import type { ConnectedWallet, GraphNode, GraphLink, TransactionResponse } from '~/types/eth';

export function useEthGraph() {
    const loading = ref(false);
    const error = ref<string | null>(null);
    const centerAddress = ref<string | null>(null);
    const connectedWallets = ref<ConnectedWallet[]>([]);
    const totalTx = ref(0);
    const nodes = ref<GraphNode[]>([]);
    const links = ref<GraphLink[]>([]);
    const history = ref<string[]>([]);
    const isDemo = ref(false);

    function shortenAddress(addr: string): string {
        return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
    }

    function buildGraph(address: string, wallets: ConnectedWallet[]) {
        const centerNode: GraphNode = {
            id: address,
            label: shortenAddress(address),
            txCount: 0,
            totalInEth: 0,
            totalOutEth: 0,
            isCenter: true,
        };

        const connectedNodes: GraphNode[] = wallets.map((w) => ({
            id: w.address,
            label: shortenAddress(w.address),
            txCount: w.txCount,
            totalInEth: w.totalInEth,
            totalOutEth: w.totalOutEth,
            isCenter: false,
        }));

        const graphLinks: GraphLink[] = wallets.map((w) => ({
            source: address,
            target: w.address,
            txCount: w.txCount,
        }));

        nodes.value = [centerNode, ...connectedNodes];
        links.value = graphLinks;
    }

    async function fetchTransactions(address: string) {
        const normalized = address.toLowerCase().trim();
        if (!/^0x[a-f0-9]{40}$/i.test(normalized)) {
            error.value =
                'Invalid Ethereum address. Must start with 0x followed by 40 hex characters.';
            return;
        }

        loading.value = true;
        error.value = null;

        try {
            const data = await $fetch<TransactionResponse>('/api/eth/transactions', {
                params: { address: normalized },
            });

            centerAddress.value = data.address;
            connectedWallets.value = data.wallets;
            totalTx.value = data.totalTx;
            isDemo.value = data.demo ?? false;

            if (!history.value.includes(normalized)) {
                history.value.push(normalized);
            }

            buildGraph(data.address, data.wallets);
        } catch (e: any) {
            const msg = e?.data?.statusMessage || e?.message || 'Failed to fetch transactions';
            error.value = msg;
            nodes.value = [];
            links.value = [];
        } finally {
            loading.value = false;
        }
    }

    function navigateToWallet(address: string) {
        fetchTransactions(address);
    }

    function goBack() {
        if (history.value.length > 1) {
            history.value.pop();
            const prev = history.value[history.value.length - 1];
            fetchTransactions(prev);
        }
    }

    return {
        loading: readonly(loading),
        error: readonly(error),
        centerAddress: readonly(centerAddress),
        connectedWallets: readonly(connectedWallets),
        totalTx: readonly(totalTx),
        nodes: readonly(nodes),
        links: readonly(links),
        history: readonly(history),
        isDemo: readonly(isDemo),
        fetchTransactions,
        navigateToWallet,
        goBack,
        shortenAddress,
    };
}
