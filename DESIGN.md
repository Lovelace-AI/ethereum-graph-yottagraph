# Ethereum graph

## Vision

This app displays a graph of connections between ethereum accounts. The user can enter an ethereum wallet number. We look at the last year of transactions, and show the other ethereum wallets that this wallet has interacted with. If there are more than 10, we only show the 10 with the greatest number of transactions. Each wallet is represented by a circle. The original wallet we queried is in the middle of the diagram, with the other wallets we queried around it. The size of the each connected circle represents the number of transactions with the queried wallet. The color of circle in the middle is grey. The color of each connected circle is a gradient between red and green where red is more going out, green is more coming in. A user can hover over a connecting circle to see all this info displayed. If we know the name of the wallet, we should display it, but typically do not expect to find it. A user can click on another connecting circle to redo the search with that other circle at the center.

## Status

Initial build complete. Core features implemented:

- Wallet address search with validation
- Etherscan API integration via server-side proxy (`/api/eth/transactions`)
- D3 force-directed graph visualization with interactive nodes
- Node sizing by transaction count, coloring by in/out ratio (green = receiving, red = sending)
- Hover tooltips showing wallet details (address, tx count, ETH in/out)
- Click-to-navigate: click any connected wallet to re-center the graph
- Navigation history with back button and breadcrumb trail
- Example addresses for quick exploration (Vitalik, Uniswap)
- Zoom and pan support on the graph
- Drag to reposition nodes
- Responsive layout that fills the viewport

## Modules

### Pages

- `pages/index.vue` — Single-page app: search input + D3 graph + history breadcrumbs

### Components

- `components/EthGraph.vue` — D3 force-directed graph with zoom, drag, hover tooltips, and click navigation

### Composables

- `composables/useEthGraph.ts` — Graph state management, Etherscan data fetching, navigation history

### Server Routes

- `server/api/eth/transactions.get.ts` — Proxies Etherscan API, aggregates transactions per wallet, returns top 10 by tx count

### Types

- `types/eth.ts` — TypeScript interfaces for wallet data, graph nodes, and graph links
