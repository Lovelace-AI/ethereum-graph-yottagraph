# Ethereum graph

## Vision

This app displays a graph of connections between ethereum accounts. The user can enter an ethereum wallet number. We look at the last year of transactions, and show the other ethereum wallets that this wallet has interacted with. If there are more than 10, we only show the 10 with the greatest number of transactions. Each wallet is represented by a circle. The original wallet we queried is in the middle of the diagram, with the other wallets we queried around it. The size of the each connected circle represents the number of transactions with the queried wallet. The color of circle in the middle is grey. The color of each connected circle is a gradient between red and green where red is more going out, green is more coming in. A user can hover over a connecting circle to see all this info displayed. If we know the name of the wallet, we should display it, but typically do not expect to find it. A user can click on another connecting circle to redo the search with that other circle at the center.

IMPORTANT NOTE: Information about using the ethereum data (schema and data dictionary) can only be found locally in /Users/leah/Lovelace/moongoose/fetch/fetchtypes/erc20

## Status

Project just created. Run `/build_my_app` in Cursor to start building.

## Modules

_None yet — the agent will populate this as features are built._
