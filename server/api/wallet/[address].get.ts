/**
 * GET /api/wallet/:address
 *
 * Finds an Ethereum address in the knowledge graph, uses linked queries
 * to sample connected wallets, and returns them for graph rendering.
 *
 * Uses bounded linked queries (limit 10 per direction) instead of
 * fetching full transfer lists — fast and safe for any wallet size.
 */

import { elementalFind, elementalGetProperties, getSchema } from '~/server/utils/elementalGateway';

export type ConnectionDirection = 'outgoing' | 'incoming' | 'both';

interface WalletConnection {
    neid: string;
    address: string;
    name: string | null;
    labels: string | null;
    isContract: boolean;
    direction: ConnectionDirection;
}

export interface WalletGraphResponse {
    center: {
        neid: string;
        address: string;
        name: string | null;
        labels: string | null;
    };
    connections: WalletConnection[];
    isSample: boolean;
}

const SAMPLE_PER_DIRECTION = 10;

// ---------------------------------------------------------------------------
// Caches
// ---------------------------------------------------------------------------

interface EthPids {
    addressId: string;
    transfer: string;
    addressName: string | null;
    addressLabels: string | null;
    isContract: string | null;
}

let _pidCache: EthPids | null = null;

async function getEthPids(): Promise<EthPids> {
    if (_pidCache) return _pidCache;
    const schema = await getSchema();
    const pidOf = (name: string) => {
        const p = schema.properties.find((pr: any) => pr.name === name);
        return p ? String(p.pid) : null;
    };
    _pidCache = {
        addressId: pidOf('eth_address_id')!,
        transfer: pidOf('erc20_transfer')!,
        addressName: pidOf('eth_address_name'),
        addressLabels: pidOf('eth_address_labels'),
        isContract: pidOf('eth_is_contract'),
    };
    return _pidCache;
}

const addressToNeid = new Map<string, string>();

function cacheAddress(address: string, neid: string) {
    addressToNeid.set(address.toLowerCase(), neid);
}

async function resolveAddress(address: string, pids: EthPids): Promise<string | null> {
    const cached = addressToNeid.get(address);
    if (cached) return cached;

    const expr = `{"type":"comparison","comparison":{"operator":"eq","pid":${pids.addressId},"value":"${address}"}}`;
    try {
        const eids = await elementalFind(expr, 1);
        if (eids.length) {
            cacheAddress(address, eids[0]);
            return eids[0];
        }
    } catch (e: any) {
        if (e?.message?.includes('category') && e?.message?.includes('not found')) {
            return null;
        }
        throw e;
    }
    return null;
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

export default defineEventHandler(async (event): Promise<WalletGraphResponse> => {
    const address = getRouterParam(event, 'address')?.toLowerCase();
    if (!address || !/^0x[0-9a-f]{40}$/.test(address)) {
        throw createError({
            statusCode: 400,
            statusMessage: 'Invalid Ethereum address. Expected 0x followed by 40 hex characters.',
        });
    }

    const pids = await getEthPids();
    if (!pids.addressId || !pids.transfer) {
        throw createError({
            statusCode: 503,
            statusMessage: 'Schema not available: eth_address properties not found.',
        });
    }

    const centerNeid = await resolveAddress(address, pids);
    if (!centerNeid) {
        throw createError({
            statusCode: 404,
            statusMessage: `Ethereum address ${address} not found in the knowledge graph.`,
        });
    }

    // Parallel: center props + outgoing sample + incoming sample
    const identityPids = [pids.addressId, pids.addressName, pids.addressLabels].filter(
        Boolean
    ) as string[];

    const outExpr = `{"type":"linked","linked":{"from_entity":"${centerNeid}","distance":1,"pids":[${pids.transfer}],"direction":"outgoing"}}`;
    const inExpr = `{"type":"linked","linked":{"to_entity":"${centerNeid}","distance":1,"pids":[${pids.transfer}],"direction":"incoming"}}`;

    const [centerProps, outNeids, inNeids] = await Promise.all([
        elementalGetProperties([centerNeid], identityPids),
        elementalFind(outExpr, SAMPLE_PER_DIRECTION).catch(() => [] as string[]),
        elementalFind(inExpr, SAMPLE_PER_DIRECTION).catch(() => [] as string[]),
    ]);

    const centerAddress =
        centerProps.find((v) => String(v.pid) === pids.addressId)?.value ?? address;
    const centerName = centerProps.find((v) => String(v.pid) === pids.addressName)?.value ?? null;
    const centerLabels =
        centerProps.find((v) => String(v.pid) === pids.addressLabels)?.value ?? null;

    // Merge directions — a NEID in both lists is "both"
    const outSet = new Set(outNeids.filter((n) => n !== centerNeid));
    const inSet = new Set(inNeids.filter((n) => n !== centerNeid));
    const allNeids = new Set([...outSet, ...inSet]);

    const directionOf = (neid: string): ConnectionDirection => {
        const isOut = outSet.has(neid);
        const isIn = inSet.has(neid);
        if (isOut && isIn) return 'both';
        if (isIn) return 'incoming';
        return 'outgoing';
    };

    if (allNeids.size === 0) {
        return {
            center: {
                neid: centerNeid,
                address: centerAddress,
                name: centerName,
                labels: centerLabels,
            },
            connections: [],
            isSample: false,
        };
    }

    // One call to get identity props for all connected wallets
    const connNeidList = [...allNeids];
    const allPropPids = [...identityPids, ...(pids.isContract ? [pids.isContract] : [])];
    const connProps = await elementalGetProperties(connNeidList, allPropPids);

    const connPropsByNeid = new Map<string, Record<string, any>>();
    for (const v of connProps) {
        if (!connPropsByNeid.has(v.eid)) connPropsByNeid.set(v.eid, {});
        const bag = connPropsByNeid.get(v.eid)!;
        const pidStr = String(v.pid);
        if (pidStr === pids.addressId) bag.address = v.value;
        if (pidStr === pids.addressName) bag.name = v.value;
        if (pidStr === pids.addressLabels) bag.labels = v.value;
        if (pidStr === pids.isContract) bag.isContract = v.value === 1 || v.value === 1.0;
    }

    const connections: WalletConnection[] = connNeidList.map((neid) => {
        const p = connPropsByNeid.get(neid) ?? {};
        return {
            neid,
            address: p.address ?? neid,
            name: p.name ?? null,
            labels: p.labels ?? null,
            isContract: p.isContract ?? false,
            direction: directionOf(neid),
        };
    });

    // Pre-cache connected addresses for fast click-to-explore
    for (const conn of connections) {
        if (conn.address.startsWith('0x')) {
            cacheAddress(conn.address, conn.neid);
        }
    }

    const isSample =
        outNeids.length >= SAMPLE_PER_DIRECTION || inNeids.length >= SAMPLE_PER_DIRECTION;

    return {
        center: {
            neid: centerNeid,
            address: centerAddress,
            name: centerName,
            labels: centerLabels,
        },
        connections,
        isSample,
    };
});
