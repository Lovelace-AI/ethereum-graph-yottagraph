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
    ownedBy: string | null;
    labels: string | null;
    isContract: boolean;
    direction: ConnectionDirection;
    outCount: number;
    inCount: number;
}

export interface WalletGraphResponse {
    center: {
        neid: string;
        address: string;
        name: string | null;
        ownedBy: string | null;
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
    ownedBy: string | null;
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
        ownedBy: pidOf('owned_by'),
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

    const identityPids = [
        pids.addressId,
        pids.addressName,
        pids.ownedBy,
        pids.addressLabels,
    ].filter(Boolean) as string[];

    // Outgoing: getProperties returns center's transfer targets (NEIDs).
    // Incoming: linked query finds entities whose transfers point at center.
    // (from_entity linked queries don't work for property-layer relationships.)
    const CANDIDATE_LIMIT = 50;
    const inExpr = `{"type":"linked","linked":{"to_entity":"${centerNeid}","distance":1,"pids":[${pids.transfer}],"direction":"incoming"}}`;

    const [centerProps, centerTransfers, inNeids] = await Promise.all([
        elementalGetProperties([centerNeid], identityPids),
        elementalGetProperties([centerNeid], [pids.transfer]).catch(() => [] as any[]),
        elementalFind(inExpr, CANDIDATE_LIMIT).catch(() => [] as string[]),
    ]);

    const centerAddress =
        centerProps.find((v) => String(v.pid) === pids.addressId)?.value ?? address;
    const centerName = centerProps.find((v) => String(v.pid) === pids.addressName)?.value ?? null;
    const centerOwnedBy = centerProps.find((v) => String(v.pid) === pids.ownedBy)?.value ?? null;
    const centerLabels =
        centerProps.find((v) => String(v.pid) === pids.addressLabels)?.value ?? null;

    // Build outgoing set from center's transfer property values
    const outSet = new Set<string>();
    const outCountByNeid = new Map<string, number>();
    for (const t of centerTransfers) {
        const target = String(t.value).padStart(20, '0');
        if (target === centerNeid) continue;
        outSet.add(target);
        outCountByNeid.set(target, (outCountByNeid.get(target) ?? 0) + 1);
    }

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
        // Still need to resolve center's owned_by if present
        let resolvedCenterOwner: string | null = null;
        if (centerOwnedBy) {
            const padded = String(centerOwnedBy).padStart(20, '0');
            const ownerProps = await elementalGetProperties([padded], ['8']).catch(
                () => [] as any[]
            );
            const nameProp = ownerProps.find((v: any) => String(v.pid) === '8');
            resolvedCenterOwner = nameProp ? String(nameProp.value) : null;
        }
        return {
            center: {
                neid: centerNeid,
                address: centerAddress,
                name: centerName,
                ownedBy: resolvedCenterOwner,
                labels: centerLabels,
            },
            connections: [],
            isSample: false,
        };
    }

    // Fetch identity props for all candidates
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
        if (pidStr === pids.ownedBy) bag.ownedBy = v.value;
        if (pidStr === pids.addressLabels) bag.labels = v.value;
        if (pidStr === pids.isContract) bag.isContract = v.value === 1 || v.value === 1.0;
    }

    // Resolve owned_by NEIDs to human-readable names (PID 8 = "name")
    const ownerNeids = new Set<string>();
    const centerOwnerRaw = centerOwnedBy ? String(centerOwnedBy).padStart(20, '0') : null;
    if (centerOwnerRaw) ownerNeids.add(centerOwnerRaw);
    for (const [, bag] of connPropsByNeid) {
        if (bag.ownedBy) ownerNeids.add(String(bag.ownedBy).padStart(20, '0'));
    }

    const ownerNames = new Map<string, string>();
    if (ownerNeids.size > 0) {
        const ownerProps = await elementalGetProperties([...ownerNeids], ['8']).catch(
            () => [] as any[]
        );
        for (const v of ownerProps) {
            if (String(v.pid) === '8' && v.value) {
                ownerNames.set(v.eid, String(v.value));
            }
        }
    }

    const resolveOwner = (rawNeid: any): string | null => {
        if (!rawNeid) return null;
        const padded = String(rawNeid).padStart(20, '0');
        return ownerNames.get(padded) ?? null;
    };

    const resolvedCenterOwnedBy = resolveOwner(centerOwnedBy);

    // Build full list, prioritize wallets with name/ownedBy
    const allConnections = connNeidList.map((neid) => {
        const p = connPropsByNeid.get(neid) ?? {};
        return {
            neid,
            address: (p.address as string) ?? neid,
            name: (p.name as string) ?? null,
            ownedBy: resolveOwner(p.ownedBy),
            labels: (p.labels as string) ?? null,
            isContract: (p.isContract as boolean) ?? false,
            direction: directionOf(neid),
        };
    });

    const named = allConnections.filter((c) => c.name || c.ownedBy);
    const anonymous = allConnections.filter((c) => !c.name && !c.ownedBy);
    const selected = [...named, ...anonymous].slice(0, SAMPLE_PER_DIRECTION);

    // Fetch incoming transfer counts for the selected connections
    const selectedNeids = selected.map((c) => c.neid);
    const selectedTransfers = await elementalGetProperties(selectedNeids, [pids.transfer]).catch(
        () => [] as any[]
    );

    const inCountByNeid = new Map<string, number>();
    for (const t of selectedTransfers) {
        const target = String(t.value).padStart(20, '0');
        if (target === centerNeid) {
            inCountByNeid.set(t.eid, (inCountByNeid.get(t.eid) ?? 0) + 1);
        }
    }

    const connections: WalletConnection[] = selected.map((c) => ({
        ...c,
        outCount: outCountByNeid.get(c.neid) ?? 0,
        inCount: inCountByNeid.get(c.neid) ?? 0,
    }));

    for (const conn of allConnections) {
        if (conn.address.startsWith('0x')) {
            cacheAddress(conn.address, conn.neid);
        }
    }

    const isSample = allConnections.length > SAMPLE_PER_DIRECTION;

    return {
        center: {
            neid: centerNeid,
            address: centerAddress,
            name: centerName,
            ownedBy: resolvedCenterOwnedBy,
            labels: centerLabels,
        },
        connections,
        isSample,
    };
});
