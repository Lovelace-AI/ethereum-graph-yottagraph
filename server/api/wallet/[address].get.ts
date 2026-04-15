/**
 * GET /api/wallet/:address
 *
 * Finds an Ethereum address in the knowledge graph, retrieves its
 * ERC-20 transfer relationships, aggregates by counterparty, and
 * returns the top connections for graph rendering.
 */

import {
    elementalFind,
    elementalGetProperties,
    getFidByName,
    getPidByName,
} from '~/server/utils/elementalGateway';

interface WalletConnection {
    neid: string;
    address: string;
    name: string | null;
    labels: string | null;
    isContract: boolean;
    txCount: number;
    outCount: number;
    inCount: number;
}

export interface WalletGraphResponse {
    center: {
        neid: string;
        address: string;
        name: string | null;
        labels: string | null;
    };
    connections: WalletConnection[];
}

const MAX_CONNECTIONS = 10;

export default defineEventHandler(async (event): Promise<WalletGraphResponse> => {
    const address = getRouterParam(event, 'address')?.toLowerCase();
    if (!address || !/^0x[0-9a-f]{40}$/.test(address)) {
        throw createError({
            statusCode: 400,
            statusMessage: 'Invalid Ethereum address. Expected 0x followed by 40 hex characters.',
        });
    }

    const [
        ethAddressIdPid,
        erc20TransferPid,
        ethAddressNamePid,
        ethAddressLabelsPid,
        ethIsContractPid,
    ] = await Promise.all([
        getPidByName('eth_address_id'),
        getPidByName('erc20_transfer'),
        getPidByName('eth_address_name'),
        getPidByName('eth_address_labels'),
        getPidByName('eth_is_contract'),
    ]);

    if (!ethAddressIdPid || !erc20TransferPid) {
        throw createError({
            statusCode: 503,
            statusMessage: 'Schema not available: eth_address properties not found.',
        });
    }

    // Step 1: Find the entity by its eth_address_id
    const expr = `{"type":"comparison","comparison":{"operator":"eq","pid":${ethAddressIdPid},"value":"${address}"}}`;
    const entityEids = await elementalFind(expr, 1);

    if (!entityEids.length) {
        throw createError({
            statusCode: 404,
            statusMessage: `Ethereum address ${address} not found in the knowledge graph.`,
        });
    }

    const centerNeid = entityEids[0];

    // Step 2: Get center wallet properties
    const propPids = [ethAddressIdPid, ethAddressNamePid, ethAddressLabelsPid].filter(
        Boolean
    ) as string[];
    const centerProps = await elementalGetProperties([centerNeid], propPids);
    const centerAddress =
        centerProps.find((v) => String(v.pid) === ethAddressIdPid)?.value ?? address;
    const centerName = centerProps.find((v) => String(v.pid) === ethAddressNamePid)?.value ?? null;
    const centerLabels =
        centerProps.find((v) => String(v.pid) === ethAddressLabelsPid)?.value ?? null;

    // Step 3: Get outgoing transfers (this wallet → others)
    const outgoing = await elementalGetProperties([centerNeid], [erc20TransferPid]);
    const counterpartyMap = new Map<string, { outCount: number; inCount: number }>();

    for (const t of outgoing) {
        const targetNeid = String(t.value).padStart(20, '0');
        const entry = counterpartyMap.get(targetNeid) ?? { outCount: 0, inCount: 0 };
        entry.outCount++;
        counterpartyMap.set(targetNeid, entry);
    }

    // Step 4: Get incoming transfers (others → this wallet) via linked expression
    const ethAddressFid = await getFidByName('eth_address');
    if (ethAddressFid) {
        const linkedExpr = `{"type":"linked","linked":{"to_entity":"${centerNeid}","distance":1,"pids":[${erc20TransferPid}],"direction":"incoming"}}`;
        try {
            const incomingNeids = await elementalFind(linkedExpr, 200);
            for (const senderNeid of incomingNeids) {
                if (senderNeid === centerNeid) continue;
                const senderTransfers = await elementalGetProperties(
                    [senderNeid],
                    [erc20TransferPid]
                );
                const toUs = senderTransfers.filter(
                    (t) => String(t.value).padStart(20, '0') === centerNeid
                );
                if (toUs.length > 0) {
                    const entry = counterpartyMap.get(senderNeid) ?? {
                        outCount: 0,
                        inCount: 0,
                    };
                    entry.inCount += toUs.length;
                    counterpartyMap.set(senderNeid, entry);
                }
            }
        } catch (e) {
            // linked query may not be supported for property-layer relationships;
            // fall back to outgoing-only data
            console.warn('[wallet] linked query failed, using outgoing-only:', e);
        }
    }

    // Step 5: Sort by total transactions, take top N
    const sorted = [...counterpartyMap.entries()]
        .map(([neid, counts]) => ({
            neid,
            txCount: counts.outCount + counts.inCount,
            outCount: counts.outCount,
            inCount: counts.inCount,
        }))
        .sort((a, b) => b.txCount - a.txCount)
        .slice(0, MAX_CONNECTIONS);

    if (!sorted.length) {
        return {
            center: {
                neid: centerNeid,
                address: centerAddress,
                name: centerName,
                labels: centerLabels,
            },
            connections: [],
        };
    }

    // Step 6: Get properties for connected wallets
    const connNeids = sorted.map((s) => s.neid);
    const connProps = await elementalGetProperties(connNeids, propPids);

    const connPropsByNeid = new Map<string, Record<string, any>>();
    for (const v of connProps) {
        const neid = v.eid;
        if (!connPropsByNeid.has(neid)) connPropsByNeid.set(neid, {});
        const bag = connPropsByNeid.get(neid)!;
        if (String(v.pid) === ethAddressIdPid) bag.address = v.value;
        if (String(v.pid) === ethAddressNamePid) bag.name = v.value;
        if (String(v.pid) === ethAddressLabelsPid) bag.labels = v.value;
    }

    // Also get isContract if available
    if (ethIsContractPid) {
        const contractProps = await elementalGetProperties(connNeids, [ethIsContractPid]);
        for (const v of contractProps) {
            const bag = connPropsByNeid.get(v.eid) ?? {};
            bag.isContract = v.value === 1 || v.value === 1.0;
            connPropsByNeid.set(v.eid, bag);
        }
    }

    const connections: WalletConnection[] = sorted.map((s) => {
        const props = connPropsByNeid.get(s.neid) ?? {};
        return {
            neid: s.neid,
            address: props.address ?? s.neid,
            name: props.name ?? null,
            labels: props.labels ?? null,
            isContract: props.isContract ?? false,
            txCount: s.txCount,
            outCount: s.outCount,
            inCount: s.inCount,
        };
    });

    return {
        center: {
            neid: centerNeid,
            address: centerAddress,
            name: centerName,
            labels: centerLabels,
        },
        connections,
    };
});
