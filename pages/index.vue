<template>
    <div class="d-flex flex-column fill-height">
        <div class="flex-shrink-0 pa-4 pb-2">
            <div class="search-row">
                <v-text-field
                    v-model="addressInput"
                    label="Ethereum wallet address"
                    placeholder="0x..."
                    prepend-inner-icon="mdi-magnify"
                    variant="outlined"
                    density="comfortable"
                    color="primary"
                    hide-details
                    clearable
                    class="search-field"
                    @keydown.enter="search"
                    @click:clear="clear"
                />
                <v-btn
                    color="primary"
                    :loading="loading"
                    :disabled="!isValidAddress"
                    @click="search"
                >
                    Search
                </v-btn>
            </div>
            <div v-if="currentAddress" class="breadcrumb">
                <v-chip
                    v-for="item in history"
                    :key="item"
                    size="small"
                    variant="tonal"
                    class="mr-1"
                    :color="item === currentAddress ? 'primary' : undefined"
                    @click="navigateTo(item)"
                >
                    {{ truncate(item) }}
                </v-chip>
            </div>
        </div>

        <div class="flex-grow-1 overflow-hidden graph-area">
            <v-progress-circular
                v-if="loading"
                indeterminate
                color="primary"
                size="48"
                class="center-loader"
            />
            <v-alert
                v-else-if="error"
                type="error"
                variant="tonal"
                closable
                class="ma-4"
                @click:close="error = null"
            >
                {{ error }}
            </v-alert>
            <div v-else-if="!graphData" class="empty-state">
                <v-icon size="64" color="rgba(255,255,255,0.15)">mdi-graph-outline</v-icon>
                <p class="mt-4">Enter an Ethereum address to explore its transfer connections</p>
                <div class="example-wallets mt-6">
                    <p class="examples-label">Try an example</p>
                    <v-chip
                        v-for="addr in exampleAddresses"
                        :key="addr"
                        variant="outlined"
                        color="primary"
                        size="small"
                        class="example-chip"
                        @click="fetchWallet(addr)"
                    >
                        {{ truncate(addr) }}
                    </v-chip>
                </div>
            </div>
            <template v-else>
                <div v-if="graphData.isSample" class="sample-banner">
                    Showing a sample of connections
                </div>
                <WalletGraph :data="graphData" @select-wallet="onSelectWallet" />
            </template>
        </div>
    </div>
</template>

<script setup lang="ts">
    import type { WalletGraphResponse } from '~/server/api/wallet/[address].get';

    const exampleAddresses = [
        '0x5b71d5fd6bb118665582dd87922bf3b9de6c75f9',
        '0x7bd5fea8dc1d01a85e7aeac8a7de4aeb22513b27',
        '0x5b5ecfc8122ba166b21d6ea26268ef97e09b2e9f',
    ];

    const addressInput = ref('');
    const currentAddress = ref<string | null>(null);
    const loading = ref(false);
    const error = ref<string | null>(null);
    const graphData = ref<WalletGraphResponse | null>(null);
    const history = ref<string[]>([]);

    const isValidAddress = computed(() =>
        /^0x[0-9a-fA-F]{40}$/.test(addressInput.value?.trim() ?? '')
    );

    function truncate(addr: string): string {
        return addr.length > 12 ? `${addr.slice(0, 6)}...${addr.slice(-4)}` : addr;
    }

    async function fetchWallet(address: string) {
        const normalized = address.toLowerCase().trim();
        loading.value = true;
        error.value = null;

        try {
            const data = await $fetch<WalletGraphResponse>(`/api/wallet/${normalized}`);
            graphData.value = data;
            currentAddress.value = normalized;
            if (!history.value.includes(normalized)) {
                history.value.push(normalized);
            }
            addressInput.value = normalized;
        } catch (e: any) {
            const msg = e?.data?.statusMessage || e?.message || 'Failed to load wallet data';
            error.value = msg;
            graphData.value = null;
        } finally {
            loading.value = false;
        }
    }

    function search() {
        const addr = addressInput.value?.trim();
        if (addr && /^0x[0-9a-fA-F]{40}$/.test(addr)) {
            fetchWallet(addr);
        }
    }

    function clear() {
        graphData.value = null;
        currentAddress.value = null;
        error.value = null;
    }

    function onSelectWallet(address: string) {
        addressInput.value = address;
        fetchWallet(address);
    }

    function navigateTo(address: string) {
        addressInput.value = address;
        fetchWallet(address);
    }
</script>

<style scoped>
    .search-row {
        display: flex;
        gap: 12px;
        align-items: center;
        max-width: 720px;
    }

    .search-field {
        flex: 1;
    }

    .search-field :deep(input) {
        font-family: var(--font-mono, monospace);
        font-size: 13px;
    }

    .breadcrumb {
        margin-top: 8px;
        display: flex;
        flex-wrap: wrap;
        gap: 4px;
    }

    .graph-area {
        position: relative;
    }

    .center-loader {
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
    }

    .empty-state {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        height: 100%;
        color: rgba(255, 255, 255, 0.4);
        font-size: 14px;
    }

    .example-wallets {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 8px;
    }

    .examples-label {
        font-size: 12px;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        color: rgba(255, 255, 255, 0.3);
    }

    .example-chip {
        font-family: var(--font-mono, monospace);
        font-size: 12px;
    }

    .sample-banner {
        text-align: center;
        padding: 6px 0 2px;
        font-size: 12px;
        color: rgba(255, 255, 255, 0.4);
        letter-spacing: 0.02em;
    }
</style>
