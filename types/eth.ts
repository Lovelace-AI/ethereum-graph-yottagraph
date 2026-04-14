export interface ConnectedWallet {
    address: string;
    txCount: number;
    totalInWei: string;
    totalOutWei: string;
    totalInEth: number;
    totalOutEth: number;
}

export interface TransactionResponse {
    address: string;
    wallets: ConnectedWallet[];
    totalTx: number;
    demo?: boolean;
}

export interface GraphNode {
    id: string;
    label: string;
    txCount: number;
    totalInEth: number;
    totalOutEth: number;
    isCenter: boolean;
    x?: number;
    y?: number;
    fx?: number | null;
    fy?: number | null;
}

export interface GraphLink {
    source: string | GraphNode;
    target: string | GraphNode;
    txCount: number;
}
