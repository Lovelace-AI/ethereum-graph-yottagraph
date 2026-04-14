interface EtherscanTx {
    from: string;
    to: string;
    value: string;
    timeStamp: string;
    hash: string;
    blockNumber: string;
}

interface AggregatedWallet {
    address: string;
    txCount: number;
    totalIn: bigint;
    totalOut: bigint;
}

function generateDemoData(address: string) {
    const seed = address.slice(2, 10);
    const seedNum = parseInt(seed, 16);

    const count = 5 + (seedNum % 6);
    const wallets = [];

    for (let i = 0; i < count; i++) {
        const addrHash = ((seedNum * (i + 1) * 2654435761) >>> 0).toString(16).padStart(8, '0');
        const walletAddr = `0x${addrHash}${'0'.repeat(32)}`.slice(0, 42);

        const txCount = 10 + ((seedNum * (i + 3)) % 200);
        const inRatio = ((seedNum * (i + 7)) % 100) / 100;
        const totalEth = 0.5 + ((seedNum * (i + 11)) % 500) / 10;

        wallets.push({
            address: walletAddr,
            txCount,
            totalInWei: Math.floor(totalEth * inRatio * 1e18).toString(),
            totalOutWei: Math.floor(totalEth * (1 - inRatio) * 1e18).toString(),
            totalInEth: parseFloat((totalEth * inRatio).toFixed(4)),
            totalOutEth: parseFloat((totalEth * (1 - inRatio)).toFixed(4)),
        });
    }

    wallets.sort((a, b) => b.txCount - a.txCount);

    return {
        address,
        wallets: wallets.slice(0, 10),
        totalTx: wallets.reduce((sum, w) => sum + w.txCount, 0),
        demo: true,
    };
}

export default defineEventHandler(async (event) => {
    const query = getQuery(event);
    const address = (query.address as string)?.toLowerCase()?.trim();

    if (!address || !/^0x[a-f0-9]{40}$/i.test(address)) {
        throw createError({ statusCode: 400, statusMessage: 'Invalid Ethereum address' });
    }

    const apiKey = process.env.ETHERSCAN_API_KEY;
    if (!apiKey) {
        return generateDemoData(address);
    }

    const oneYearAgo = Math.floor(Date.now() / 1000) - 365 * 24 * 60 * 60;
    const baseUrl = 'https://api.etherscan.io/v2/api';

    const params = new URLSearchParams({
        chainid: '1',
        module: 'account',
        action: 'txlist',
        address,
        startblock: '0',
        endblock: '99999999',
        page: '1',
        offset: '10000',
        sort: 'desc',
        apikey: apiKey,
    });

    const res = await $fetch<{ status: string; message: string; result: EtherscanTx[] | string }>(
        `${baseUrl}?${params.toString()}`
    );

    if (res.status !== '1' || !Array.isArray(res.result)) {
        const msg = typeof res.result === 'string' ? res.result : res.message;
        if (msg === 'No transactions found') {
            return { address, wallets: [], totalTx: 0, demo: false };
        }
        throw createError({ statusCode: 502, statusMessage: `Etherscan error: ${msg}` });
    }

    const recentTxs = res.result.filter((tx) => parseInt(tx.timeStamp) >= oneYearAgo);

    const walletMap = new Map<string, AggregatedWallet>();

    for (const tx of recentTxs) {
        const from = tx.from.toLowerCase();
        const to = tx.to?.toLowerCase();
        if (!to) continue;

        const other = from === address ? to : from;
        const isOutgoing = from === address;
        const value = BigInt(tx.value || '0');

        const existing = walletMap.get(other);
        if (existing) {
            existing.txCount++;
            if (isOutgoing) {
                existing.totalOut += value;
            } else {
                existing.totalIn += value;
            }
        } else {
            walletMap.set(other, {
                address: other,
                txCount: 1,
                totalIn: isOutgoing ? BigInt(0) : value,
                totalOut: isOutgoing ? value : BigInt(0),
            });
        }
    }

    const sorted = Array.from(walletMap.values()).sort((a, b) => b.txCount - a.txCount);
    const top10 = sorted.slice(0, 10);

    const wallets = top10.map((w) => ({
        address: w.address,
        txCount: w.txCount,
        totalInWei: w.totalIn.toString(),
        totalOutWei: w.totalOut.toString(),
        totalInEth: Number(w.totalIn) / 1e18,
        totalOutEth: Number(w.totalOut) / 1e18,
    }));

    return {
        address,
        wallets,
        totalTx: recentTxs.length,
        demo: false,
    };
});
