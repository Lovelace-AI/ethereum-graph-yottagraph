<template>
    <div class="wallet-table pa-4">
        <v-table density="comfortable" hover>
            <thead>
                <tr>
                    <th>Wallet</th>
                    <th>Owner</th>
                    <th class="text-center">Direction</th>
                    <th class="text-right">Outgoing</th>
                    <th class="text-right">Incoming</th>
                    <th class="text-right">Total</th>
                </tr>
            </thead>
            <tbody>
                <tr
                    v-for="conn in data.connections"
                    :key="conn.neid"
                    class="clickable-row"
                    @click="emit('selectWallet', conn.address)"
                >
                    <td>
                        <div class="wallet-cell">
                            <span v-if="conn.name" class="wallet-name">{{ conn.name }}</span>
                            <span class="wallet-address">{{ conn.address }}</span>
                        </div>
                    </td>
                    <td>
                        <span v-if="conn.ownedBy" class="owned-by">{{ conn.ownedBy }}</span>
                        <span v-else class="text-medium-emphasis">—</span>
                    </td>
                    <td class="text-center">
                        <v-chip
                            size="x-small"
                            variant="flat"
                            :color="directionColor(conn.direction)"
                            label
                        >
                            {{ directionIcon(conn.direction) }}
                            {{ conn.direction }}
                        </v-chip>
                    </td>
                    <td class="text-right tabular-nums">
                        <span :class="{ 'text-medium-emphasis': !conn.outCount }">
                            {{ conn.outCount }}
                        </span>
                    </td>
                    <td class="text-right tabular-nums">
                        <span :class="{ 'text-medium-emphasis': !conn.inCount }">
                            {{ conn.inCount }}
                        </span>
                    </td>
                    <td class="text-right tabular-nums font-weight-medium">
                        {{ conn.outCount + conn.inCount }}
                    </td>
                </tr>
            </tbody>
        </v-table>
    </div>
</template>

<script setup lang="ts">
    import type {
        WalletGraphResponse,
        ConnectionDirection,
    } from '~/server/api/wallet/[address].get';

    defineProps<{
        data: WalletGraphResponse;
    }>();

    const emit = defineEmits<{
        selectWallet: [address: string];
    }>();

    function directionColor(dir: ConnectionDirection): string {
        if (dir === 'incoming') return 'success';
        if (dir === 'outgoing') return 'error';
        return 'warning';
    }

    function directionIcon(dir: ConnectionDirection): string {
        if (dir === 'incoming') return '←';
        if (dir === 'outgoing') return '→';
        return '↔';
    }
</script>

<style scoped>
    .wallet-table {
        overflow-y: auto;
        height: 100%;
    }

    .clickable-row {
        cursor: pointer;
    }

    .wallet-cell {
        display: flex;
        flex-direction: column;
        gap: 2px;
        padding: 4px 0;
    }

    .wallet-name {
        font-weight: 500;
        font-size: 13px;
    }

    .wallet-address {
        font-family: var(--font-mono, monospace);
        font-size: 11px;
        color: rgba(255, 255, 255, 0.5);
    }

    .owned-by {
        font-weight: 600;
        color: #ffffff;
    }

    .tabular-nums {
        font-variant-numeric: tabular-nums;
        font-family: var(--font-mono, monospace);
        font-size: 13px;
    }
</style>
