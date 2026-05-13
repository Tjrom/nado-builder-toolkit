# Nado Builder Toolkit (SDK + CLI)

Этот мини‑проект — **TypeScript SDK + CLI** для Nado (Ink), чтобы быстрее билдить ботов/дашборды/интеграции.

Основано на документации:

- [Nado API overview](https://docs.nado.xyz/developer-resources/api)
- [Nado Endpoints](https://docs.nado.xyz/developer-resources/api/endpoints)
- [Gateway (REST/WS)](https://docs.nado.xyz/developer-resources/api/gateway)
- [Signing (EIP-712)](https://docs.nado.xyz/developer-resources/api/gateway/signing)
- [Subscriptions](https://docs.nado.xyz/developer-resources/api/subscriptions)

## Быстрый старт (Windows / PowerShell)

Перейти в папку:

```powershell
cd .\nado-builder-toolkit\
```

Установить зависимости:

```powershell
npm i
```

Собрать:

```powershell
npm run build
```

Посмотреть эндпоинт/chainId:

```powershell
node .\dist\cli.js contracts --network testnet
```

## Demo (быстро показать, что работает)

1) Публичный стрим трейдов:

```powershell
node .\dist\cli.js subscribe --network testnet --stream trade --product-id 0
```

2) Alerts (приватные события) + лог в файл (JSONL):

```powershell
$env:NADO_PRIVATE_KEY="0x..."
$env:NADO_SUBACCOUNT_BYTES32="0x..."  # bytes32 subaccount
node .\dist\cli.js alerts --network testnet --subaccount $env:NADO_SUBACCOUNT_BYTES32 --auth --out .\events.jsonl
```

## CLI

### ENV

- `NADO_PRIVATE_KEY`: приватный ключ EOA для подписи EIP-712.
- `NADO_SUBACCOUNT_BYTES32` (опционально): bytes32 subaccount для `subscribe --auth`, если не передаёшь `--subaccount`.

### Appendix builder (builder fees / triggers)

Собрать `appendix` (uint128) без ручных битов:

```powershell
node .\dist\cli.js appendix --order-type DEFAULT --trigger-type PRICE --builder-id 1 --builder-fee-rate 10
```

Распарсить существующий:

```powershell
node .\dist\cli.js appendix --parse 4096
```

### Подписки (streams)

Пример: трейды по продукту 0 (без auth):

```powershell
node .\dist\cli.js subscribe --network testnet --stream trade --product-id 0
```

Пример: `order_update` (требует auth). Сначала укажи subaccount bytes32:

```powershell
$env:NADO_PRIVATE_KEY="0x..."
$env:NADO_SUBACCOUNT_BYTES32="0x..."  # bytes32
node .\dist\cli.js subscribe --network testnet --stream order_update --auth
```

### Place order / Cancel

Эти команды требуют `NADO_PRIVATE_KEY` и корректные значения `sender` (bytes32 subaccount), appendix и т.п.

```powershell
$env:NADO_PRIVATE_KEY="0x..."
node .\dist\cli.js place-order --network testnet --product-id 1 --sender 0x... --price-x18 1000000000000000000 --amount-x18 1000000000000000000 --expiration-sec 4294967295 --appendix 1
```

### Archive (indexer)

Свечи:

```powershell
node .\dist\cli.js archive-candles --network testnet --product-id 1 --granularity 60 --limit 10
```

История ордеров по subaccount:

```powershell
node .\dist\cli.js archive-orders --network testnet --subaccounts 0x... --limit 20
```

### Trigger service

Листинг триггеров:

```powershell
$env:NADO_PRIVATE_KEY="0x..."
node .\dist\cli.js trigger-list --network testnet --sender 0x... --limit 20
```

Создать price trigger (пример requirement ключа см. доки):

```powershell
$env:NADO_PRIVATE_KEY="0x..."
node .\dist\cli.js trigger-place-price --network testnet --product-id 1 --sender 0x... --price-x18 9900000000000000000000 --amount-x18 1000000000000000000 --expiration-sec 4294967295 --appendix 4096 --requirement oracle_price_below=9900000000000000000000
```

TWAP trigger:

```powershell
$env:NADO_PRIVATE_KEY="0x..."
node .\dist\cli.js trigger-place-twap --network testnet --product-id 1 --sender 0x... --price-x18 9900000000000000000000 --amount-x18 5000000000000000000 --expiration-sec 4294967295 --interval 30 --twap-times 5 --twap-slippage-x6 10000
```

Посмотреть исполнения TWAP по digest:

```powershell
node .\dist\cli.js trigger-list-twap-executions --network testnet --digest 0x...
```

### Alerts mode (бот‑режим в консоли)

Подписаться на `fill/position_change/order_update`, печатать события и писать JSONL в файл:

```powershell
$env:NADO_PRIVATE_KEY="0x..."
node .\dist\cli.js alerts --network testnet --subaccount 0x... --auth --out .\events.jsonl
```

## Что дальше (если хочешь добить до “builder-grade”)

- Добавить `archive` клиент (indexer queries) + backfill для бэктеста.
- Добавить helper для сборки `appendix` (bits) + builder fee rate / builder id.
- Добавить Telegram bot “fills/order updates alerts”.

