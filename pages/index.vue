<template>
    <div class="d-flex flex-column fill-height">
        <div class="flex-shrink-0 pa-4 pb-2">
            <div class="d-flex align-center ga-3 flex-wrap">
                <v-btn
                    v-if="history.length > 1"
                    icon
                    size="small"
                    variant="text"
                    @click="goBack"
                    title="Go back"
                >
                    <v-icon>mdi-arrow-left</v-icon>
                </v-btn>

                <v-text-field
                    v-model="searchInput"
                    placeholder="Enter Ethereum wallet address (0x...)"
                    variant="outlined"
                    density="compact"
                    hide-details
                    class="search-field flex-grow-1"
                    prepend-inner-icon="mdi-ethereum"
                    :loading="loading"
                    clearable
                    @keyup.enter="onSearch"
                />

                <v-btn
                    color="primary"
                    variant="flat"
                    :loading="loading"
                    :disabled="!searchInput"
                    @click="onSearch"
                >
                    Explore
                </v-btn>
            </div>

            <v-alert
                v-if="error"
                type="error"
                variant="tonal"
                class="mt-3"
                closable
                @click:close="error = null"
            >
                {{ error }}
            </v-alert>

            <div v-if="centerAddress" class="mt-2 d-flex align-center ga-2 flex-wrap">
                <v-chip size="small" color="primary" variant="tonal" prepend-icon="mdi-target">
                    {{ shortenAddress(centerAddress) }}
                </v-chip>
                <v-chip size="small" variant="outlined">
                    {{ totalTx }} transactions (last year)
                </v-chip>
                <v-chip v-if="connectedWallets.length > 0" size="small" variant="outlined">
                    {{ connectedWallets.length }} connected wallets
                </v-chip>
            </div>
        </div>

        <div class="flex-grow-1 overflow-hidden pa-4 pt-0">
            <div
                v-if="!centerAddress && !loading"
                class="empty-state d-flex flex-column align-center justify-center fill-height"
            >
                <v-icon size="80" color="grey-darken-1" class="mb-4">mdi-ethereum</v-icon>
                <h2 class="text-h5 font-headline mb-2" style="color: var(--lv-silver)">
                    Ethereum Wallet Explorer
                </h2>
                <p
                    class="text-body-2"
                    style="color: var(--lv-silver); max-width: 400px; text-align: center"
                >
                    Enter an Ethereum wallet address to visualize its transaction connections. Click
                    on connected wallets to explore further.
                </p>
                <div class="mt-4 d-flex flex-column ga-2 font-mono" style="font-size: 0.75rem">
                    <v-btn
                        v-for="example in exampleAddresses"
                        :key="example.address"
                        variant="text"
                        size="small"
                        class="text-none"
                        @click="
                            searchInput = example.address;
                            onSearch();
                        "
                    >
                        <span class="text-green mr-2">{{ example.label }}</span>
                        <span style="color: var(--lv-silver)">{{
                            shortenAddress(example.address)
                        }}</span>
                    </v-btn>
                </div>
            </div>

            <div
                v-else-if="loading && nodes.length === 0"
                class="d-flex flex-column align-center justify-center fill-height"
            >
                <v-progress-circular indeterminate color="primary" size="48" class="mb-4" />
                <p class="text-body-2" style="color: var(--lv-silver)">Fetching transactions...</p>
            </div>

            <div
                v-else-if="centerAddress && connectedWallets.length === 0 && !loading"
                class="d-flex flex-column align-center justify-center fill-height"
            >
                <v-icon size="64" color="grey-darken-1" class="mb-4">mdi-graph-outline</v-icon>
                <h3 class="text-h6 mb-2" style="color: var(--lv-silver)">No connections found</h3>
                <p
                    class="text-body-2"
                    style="color: var(--lv-silver); max-width: 360px; text-align: center"
                >
                    This wallet has no transactions in the last year, or Etherscan rate limits may
                    apply.
                </p>
            </div>

            <EthGraph v-else :nodes="nodes" :links="links" @node-click="onNodeClick" />
        </div>

        <div v-if="history.length > 1" class="flex-shrink-0 px-4 pb-3">
            <div class="d-flex align-center ga-1 flex-wrap history-bar">
                <v-icon size="14" color="grey">mdi-history</v-icon>
                <v-chip
                    v-for="(addr, idx) in history"
                    :key="addr"
                    size="x-small"
                    :variant="idx === history.length - 1 ? 'flat' : 'outlined'"
                    :color="idx === history.length - 1 ? 'primary' : undefined"
                    class="font-mono"
                    clickable
                    @click="navigateToWallet(addr)"
                >
                    {{ shortenAddress(addr) }}
                </v-chip>
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
    const {
        loading,
        error,
        centerAddress,
        connectedWallets,
        totalTx,
        nodes,
        links,
        history,
        fetchTransactions,
        navigateToWallet,
        goBack,
        shortenAddress,
    } = useEthGraph();

    const searchInput = ref('');

    const exampleAddresses = [
        { label: 'Vitalik', address: '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045' },
        { label: 'Uniswap', address: '0x1a9C8182C09F50C8318d769245beA52c32BE35BC' },
    ];

    function onSearch() {
        if (searchInput.value) {
            fetchTransactions(searchInput.value);
        }
    }

    function onNodeClick(address: string) {
        searchInput.value = address;
        navigateToWallet(address);
    }
</script>

<style scoped>
    .search-field {
        max-width: 600px;
    }

    .search-field :deep(input) {
        font-family: var(--font-mono);
        font-size: 0.85rem;
    }

    .empty-state {
        background-image: radial-gradient(circle, rgba(117, 117, 117, 0.04) 1px, transparent 1px);
        background-size: 20px 20px;
        border-radius: 8px;
    }

    .history-bar {
        opacity: 0.7;
    }

    .history-bar:hover {
        opacity: 1;
    }
</style>
