## Builder application (готовый текст)

**Project name**: Nado Builder Toolkit (SDK + CLI)

**One-liner**: Open-source TypeScript SDK + CLI for Nado (Ink): EIP-712 signing, Gateway/Archive/Trigger API clients, and a subscriptions alerts runner (JSONL logging).

**What it does / why it’s useful**

- Lowers the barrier for builders: working EIP-712 signing + ready-to-run CLI examples.
- Provides a reproducible “demo harness” for Nado APIs (gateway executes/queries, archive/indexer, trigger service).
- Alerts runner helps traders/builders observe `fill/position_change/order_update` streams and export raw event logs for analysis.

**Key features**

- EIP-712 signing (domain `Nado` / `0.0.1`), correct `verifyingContract` handling (productId address for `place_order`, endpoint for others).
- Gateway: `place-order`, `cancel-orders`, `contracts`.
- Archive/indexer: `candlesticks`, `orders` queries.
- Trigger service: `trigger-place-price`, `trigger-place-twap`, `trigger-cancel`, `trigger-list`, `trigger-list-twap-executions`.
- Appendix builder/parser: builderId + builderFeeRate, reduce-only, isolated, triggers, TWAP value encoding.
- Subscriptions: `alerts` mode + JSONL output.

**Repo**

- Folder: `nado-builder-toolkit/`
- Run: `npm i && npm run build`

**Demo / test plan**

1) Print chainId + endpoint:
`node dist/cli.js contracts --network testnet`

2) Stream public trades:
`node dist/cli.js subscribe --network testnet --stream trade --product-id 0`

3) Run authenticated alerts and write to file:
`NADO_PRIVATE_KEY=... NADO_SUBACCOUNT_BYTES32=... node dist/cli.js alerts --network testnet --subaccount 0x... --auth --out ./events.jsonl`

4) Place a trigger (price or TWAP), then inspect:
`node dist/cli.js trigger-list ...`
`node dist/cli.js trigger-list-twap-executions --digest 0x...`

**Planned next improvements**

- `alerts --pretty` (human-readable) + filters.
- More archive queries (matches, funding, snapshots).
- Example “bot strategy” template using SDK + subscriptions.

