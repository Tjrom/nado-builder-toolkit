#!/usr/bin/env node
import { Command } from "commander";
import { Wallet } from "ethers";
import { getEndpoints, type NadoNetwork } from "./network.js";
import { NadoGatewayClient } from "./gateway.js";
import { mustGetEnv, asHex32 } from "./util.js";
import { cancelOrders, placeOrder } from "./orders.js";
import { NadoSubscriptionsClient } from "./subscriptions.js";
import { signTypedDataHex, type NadoDomain } from "./eip712.js";
import { buildAppendix, encodeTwapValue, OrderExecutionType, OrderTriggerType, parseAppendix } from "./appendix.js";
import { NadoArchiveClient, SupportedGranularities } from "./archive.js";
import { NadoTriggerClient, listTriggerOrders, triggerCancelOrders, triggerPlaceOrder } from "./trigger.js";
import { appendFileSync } from "node:fs";

function parseNetwork(v?: string): NadoNetwork {
  if (v === "mainnet" || v === "testnet") return v;
  return "testnet";
}

function parseBigint(v: string): bigint {
  if (!/^-?\d+$/.test(v)) throw new Error(`Expected integer string, got: ${v}`);
  return BigInt(v);
}

function jsonStringify(obj: unknown): string {
  return JSON.stringify(
    obj,
    (_k, v) => (typeof v === "bigint" ? v.toString() : v),
    2
  );
}

async function mkGatewayWithContracts(network: NadoNetwork) {
  const eps = getEndpoints(network);
  const gateway = new NadoGatewayClient(eps.gatewayRestV1);
  const contracts = await gateway.queryContracts();
  return { eps, gateway, contracts };
}

const program = new Command();
program.name("nado").description("Nado SDK + CLI (Ink) - gateway + subscriptions").version("0.1.0");

async function main() {
program
  .command("contracts")
  .description("Fetch chainId and endpoint address")
  .option("-n, --network <network>", "mainnet|testnet", "testnet")
  .action(async (opts) => {
    const network = parseNetwork(opts.network);
    const { contracts } = await mkGatewayWithContracts(network);
    process.stdout.write(JSON.stringify(contracts, null, 2) + "\n");
  });

program
  .command("appendix")
  .description("Build or parse order appendix (uint128)")
  .option("--parse <uint>", "parse appendix integer", parseBigint)
  .option("--version <n>", "protocol version (default 1)", (v) => Number(v))
  .option("--isolated", "isolated margin flag", false)
  .option("--reduce-only", "reduce only flag", false)
  .option("--order-type <t>", "DEFAULT|IOC|FOK|POST_ONLY", "DEFAULT")
  .option("--trigger-type <t>", "NONE|PRICE|TWAP|TWAP_CUSTOM_AMOUNTS", "NONE")
  .option("--builder-id <n>", "builder id (0..65535)", (v) => Number(v))
  .option("--builder-fee-rate <n>", "0.1bps units (0..1023)", (v) => Number(v))
  .option("--isolated-margin-x6 <n>", "isolated margin in x6, stored in value field", parseBigint)
  .option("--twap-times <n>", "TWAP times (value field)", (v) => Number(v))
  .option("--twap-slippage-x6 <n>", "TWAP slippage_x6 (value field)", (v) => Number(v))
  .action(async (opts) => {
    if (typeof opts.parse === "bigint") {
      const parsed = parseAppendix(opts.parse);
      process.stdout.write(JSON.stringify({ input: opts.parse.toString(), ...parsed }, null, 2) + "\n");
      return;
    }

    const orderTypeMap: Record<string, OrderExecutionType> = {
      DEFAULT: OrderExecutionType.DEFAULT,
      IOC: OrderExecutionType.IOC,
      FOK: OrderExecutionType.FOK,
      POST_ONLY: OrderExecutionType.POST_ONLY
    };
    const triggerTypeMap: Record<string, OrderTriggerType> = {
      NONE: OrderTriggerType.NONE,
      PRICE: OrderTriggerType.PRICE,
      TWAP: OrderTriggerType.TWAP,
      TWAP_CUSTOM_AMOUNTS: OrderTriggerType.TWAP_CUSTOM_AMOUNTS
    };

    let value = 0n;
    if (typeof opts.isolatedMarginX6 === "bigint") value = opts.isolatedMarginX6;
    if (typeof opts.twapTimes === "number" || typeof opts.twapSlippageX6 === "number") {
      value = encodeTwapValue({
        times: Number(opts.twapTimes ?? 0),
        slippageX6: Number(opts.twapSlippageX6 ?? 0)
      });
    }

    const appendix = buildAppendix({
      version: typeof opts.version === "number" && !Number.isNaN(opts.version) ? opts.version : 1,
      isolated: !!opts.isolated,
      reduceOnly: !!opts.reduceOnly,
      orderType: orderTypeMap[String(opts.orderType ?? "DEFAULT").toUpperCase()] ?? OrderExecutionType.DEFAULT,
      triggerType: triggerTypeMap[String(opts.triggerType ?? "NONE").toUpperCase()] ?? OrderTriggerType.NONE,
      builderId: typeof opts.builderId === "number" && !Number.isNaN(opts.builderId) ? opts.builderId : 0,
      builderFeeRate: typeof opts.builderFeeRate === "number" && !Number.isNaN(opts.builderFeeRate) ? opts.builderFeeRate : 0,
      value
    });

    process.stdout.write(
      jsonStringify({ appendix: appendix.toString(), hex: "0x" + appendix.toString(16), decoded: parseAppendix(appendix) }) + "\n"
    );
  });

program
  .command("place-order")
  .description("Place a signed limit order via gateway REST v1 /execute")
  .requiredOption("-n, --network <network>", "mainnet|testnet", "testnet")
  .requiredOption("--product-id <id>", "product id", (v) => Number(v))
  .requiredOption("--sender <bytes32>", "subaccount sender (bytes32 hex)")
  .requiredOption("--price-x18 <int>", "price * 1e18", parseBigint)
  .requiredOption("--amount-x18 <int>", "amount * 1e18 (positive buy, negative sell)", parseBigint)
  .requiredOption("--expiration-sec <int>", "unix seconds expiration", parseBigint)
  .requiredOption("--appendix <uint128>", "order appendix integer", parseBigint)
  .option("--nonce <uint64>", "nonce", parseBigint)
  .option("--client-id <id>", "client id echoed in streams/responses", (v) => Number(v))
  .option("--spot-leverage <bool>", "true|false", (v) => v === "true")
  .action(async (opts) => {
    const pk = mustGetEnv("NADO_PRIVATE_KEY");
    const wallet = new Wallet(pk);
    const network = parseNetwork(opts.network);
    const { gateway, contracts } = await mkGatewayWithContracts(network);

    const res = await placeOrder({
      gateway,
      wallet,
      chainId: contracts.chainId,
      endpointAddr: contracts.endpointAddr,
      input: {
        productId: opts.productId,
        sender: asHex32(opts.sender),
        priceX18: opts.priceX18,
        amountX18: opts.amountX18,
        expirationSec: opts.expirationSec,
        appendix: opts.appendix,
        nonce: opts.nonce,
        clientId: opts.clientId,
        spotLeverage: typeof opts.spotLeverage === "boolean" ? opts.spotLeverage : undefined
      }
    });

    process.stdout.write(JSON.stringify(res, null, 2) + "\n");
  });

program
  .command("archive-candles")
  .description("Archive/indexer candlesticks query")
  .requiredOption("-n, --network <network>", "mainnet|testnet", "testnet")
  .requiredOption("--product-id <id>", "product id", (v) => Number(v))
  .requiredOption("--granularity <sec>", "granularity seconds", (v) => SupportedGranularities.parse(Number(v)))
  .option("--limit <n>", "max candles (<=500)", (v) => Number(v))
  .option("--max-time <sec>", "unix seconds max_time", (v) => Number(v))
  .action(async (opts) => {
    const network = parseNetwork(opts.network);
    const eps = getEndpoints(network);
    const archive = new NadoArchiveClient(eps.archiveV1);
    const res = await archive.candlesticks({
      productId: opts.productId,
      granularitySec: opts.granularity,
      limit: typeof opts.limit === "number" ? opts.limit : undefined,
      maxTimeSec: typeof opts.maxTime === "number" ? opts.maxTime : undefined
    });
    process.stdout.write(JSON.stringify(res, null, 2) + "\n");
  });

program
  .command("archive-orders")
  .description("Archive/indexer orders query")
  .requiredOption("-n, --network <network>", "mainnet|testnet", "testnet")
  .option("--subaccounts <csv>", "comma-separated bytes32 subaccounts")
  .option("--product-ids <csv>", "comma-separated product ids")
  .option("--digests <csv>", "comma-separated order digests (bytes32); if set, other filters ignored by API")
  .option("--trigger-types <csv>", "comma-separated: price_trigger,time_trigger,none")
  .option("--isolated <v>", "true|false|null", (v) => (v === "null" ? null : v === "true"))
  .option("--limit <n>", "limit <= 500", (v) => Number(v))
  .option("--max-time <sec>", "unix seconds max_time", (v) => Number(v))
  .option("--idx <n>", "submission_idx upper bound", (v) => v)
  .action(async (opts) => {
    const network = parseNetwork(opts.network);
    const eps = getEndpoints(network);
    const archive = new NadoArchiveClient(eps.archiveV1);

    const subaccounts =
      typeof opts.subaccounts === "string"
        ? String(opts.subaccounts)
            .split(",")
            .filter(Boolean)
            .map((s: string) => s.trim())
        : undefined;
    const productIds =
      typeof opts.productIds === "string"
        ? String(opts.productIds)
            .split(",")
            .filter(Boolean)
            .map((s: string) => Number(s.trim()))
        : undefined;
    const digests =
      typeof opts.digests === "string"
        ? String(opts.digests)
            .split(",")
            .filter(Boolean)
            .map((s: string) => s.trim())
        : undefined;
    const triggerTypes =
      typeof opts.triggerTypes === "string"
        ? (String(opts.triggerTypes)
            .split(",")
            .filter(Boolean)
            .map((s: string) => s.trim()) as Array<"price_trigger" | "time_trigger" | "none">)
        : undefined;

    const res = await archive.orders({
      subaccounts,
      productIds,
      digests,
      triggerTypes,
      isolated: typeof opts.isolated === "boolean" || opts.isolated === null ? opts.isolated : undefined,
      limit: typeof opts.limit === "number" ? opts.limit : undefined,
      maxTimeSec: typeof opts.maxTime === "number" ? opts.maxTime : undefined,
      idx: typeof opts.idx === "string" ? opts.idx : undefined
    });
    process.stdout.write(JSON.stringify(res, null, 2) + "\n");
  });

program
  .command("cancel-orders")
  .description("Cancel signed orders via gateway REST v1 /execute")
  .requiredOption("-n, --network <network>", "mainnet|testnet", "testnet")
  .requiredOption("--sender <bytes32>", "subaccount sender (bytes32 hex)")
  .requiredOption("--product-ids <csv>", "comma-separated product ids, same length as digests")
  .requiredOption("--digests <csv>", "comma-separated order digests (bytes32 hex)")
  .option("--nonce <uint64>", "nonce", parseBigint)
  .option("--required-unfilled-amount-x18 <int>", "only cancel if remaining unfilled matches abs(value)", parseBigint)
  .option("--client-id <id>", "client id echoed in response", (v) => Number(v))
  .action(async (opts) => {
    const pk = mustGetEnv("NADO_PRIVATE_KEY");
    const wallet = new Wallet(pk);
    const network = parseNetwork(opts.network);
    const { gateway, contracts } = await mkGatewayWithContracts(network);

    const productIds = String(opts.productIds)
      .split(",")
      .filter(Boolean)
      .map((s: string) => Number(s.trim()));
    const digests = String(opts.digests)
      .split(",")
      .filter(Boolean)
      .map((s: string) => s.trim());

    if (productIds.length !== digests.length) {
      throw new Error(`product-ids length (${productIds.length}) must match digests length (${digests.length})`);
    }

    const res = await cancelOrders({
      gateway,
      wallet,
      chainId: contracts.chainId,
      endpointAddr: contracts.endpointAddr,
      input: {
        sender: asHex32(opts.sender),
        productIds,
        digests,
        nonce: opts.nonce,
        requiredUnfilledAmountX18: opts.requiredUnfilledAmountX18,
        clientId: opts.clientId
      }
    });

    process.stdout.write(JSON.stringify(res, null, 2) + "\n");
  });

program
  .command("trigger-list")
  .description("List trigger orders (signed query)")
  .requiredOption("-n, --network <network>", "mainnet|testnet", "testnet")
  .requiredOption("--sender <bytes32>", "subaccount sender (bytes32 hex)")
  .option("--product-ids <csv>", "comma-separated product ids")
  .option("--limit <n>", "limit <= 500", (v) => Number(v))
  .option("--max-update-time <sec>", "unix seconds", (v) => Number(v))
  .option("--max-digest <bytes32>", "pagination digest")
  .option("--digests <csv>", "comma-separated digests")
  .option("--trigger-types <csv>", "price_trigger,time_trigger")
  .option("--status-types <csv>", "comma-separated status types")
  .option("--reduce-only <bool>", "true|false", (v) => v === "true")
  .action(async (opts) => {
    const pk = mustGetEnv("NADO_PRIVATE_KEY");
    const wallet = new Wallet(pk);
    const network = parseNetwork(opts.network);
    const { eps, contracts } = await mkGatewayWithContracts(network);
    const trigger = new NadoTriggerClient(eps.triggerV1);

    const productIds =
      typeof opts.productIds === "string"
        ? String(opts.productIds)
            .split(",")
            .filter(Boolean)
            .map((s: string) => Number(s.trim()))
        : undefined;
    const digests =
      typeof opts.digests === "string"
        ? String(opts.digests)
            .split(",")
            .filter(Boolean)
            .map((s: string) => s.trim())
        : undefined;
    const triggerTypes =
      typeof opts.triggerTypes === "string"
        ? (String(opts.triggerTypes)
            .split(",")
            .filter(Boolean)
            .map((s: string) => s.trim()) as Array<"price_trigger" | "time_trigger">)
        : undefined;
    const statusTypes =
      typeof opts.statusTypes === "string"
        ? (String(opts.statusTypes)
            .split(",")
            .filter(Boolean)
            .map((s: string) => s.trim()) as any)
        : undefined;

    const res = await listTriggerOrders({
      trigger,
      wallet,
      chainId: contracts.chainId,
      endpointAddr: contracts.endpointAddr,
      sender: asHex32(opts.sender),
      productIds,
      limit: typeof opts.limit === "number" ? opts.limit : undefined,
      maxUpdateTimeSec: typeof opts.maxUpdateTime === "number" ? opts.maxUpdateTime : undefined,
      maxDigest: typeof opts.maxDigest === "string" ? opts.maxDigest : undefined,
      digests,
      triggerTypes,
      statusTypes,
      reduceOnly: typeof opts.reduceOnly === "boolean" ? opts.reduceOnly : undefined
    });
    process.stdout.write(JSON.stringify(res, null, 2) + "\n");
  });

program
  .command("trigger-cancel")
  .description("Cancel trigger orders via trigger service (signed execute)")
  .requiredOption("-n, --network <network>", "mainnet|testnet", "testnet")
  .requiredOption("--sender <bytes32>", "subaccount sender (bytes32 hex)")
  .requiredOption("--product-ids <csv>", "comma-separated product ids, same length as digests")
  .requiredOption("--digests <csv>", "comma-separated digests")
  .option("--nonce <uint64>", "nonce", parseBigint)
  .action(async (opts) => {
    const pk = mustGetEnv("NADO_PRIVATE_KEY");
    const wallet = new Wallet(pk);
    const network = parseNetwork(opts.network);
    const { eps, contracts } = await mkGatewayWithContracts(network);
    const trigger = new NadoTriggerClient(eps.triggerV1);

    const productIds = String(opts.productIds)
      .split(",")
      .filter(Boolean)
      .map((s: string) => Number(s.trim()));
    const digests = String(opts.digests)
      .split(",")
      .filter(Boolean)
      .map((s: string) => s.trim());
    if (productIds.length !== digests.length) {
      throw new Error(`product-ids length (${productIds.length}) must match digests length (${digests.length})`);
    }

    const res = await triggerCancelOrders({
      trigger,
      wallet,
      chainId: contracts.chainId,
      endpointAddr: contracts.endpointAddr,
      sender: asHex32(opts.sender),
      productIds,
      digests,
      nonce: opts.nonce
    });
    process.stdout.write(JSON.stringify(res, null, 2) + "\n");
  });

program
  .command("trigger-place-price")
  .description("Place a PRICE trigger order via trigger service (signed execute)")
  .requiredOption("-n, --network <network>", "mainnet|testnet", "testnet")
  .requiredOption("--product-id <id>", "product id", (v) => Number(v))
  .requiredOption("--sender <bytes32>", "subaccount sender (bytes32 hex)")
  .requiredOption("--price-x18 <int>", "order limit price * 1e18", parseBigint)
  .requiredOption("--amount-x18 <int>", "amount * 1e18 (positive buy, negative sell)", parseBigint)
  .requiredOption("--expiration-sec <int>", "unix seconds expiration", parseBigint)
  .requiredOption("--appendix <uint128>", "appendix integer (should encode trigger=PRICE)", parseBigint)
  .requiredOption("--requirement <k=v>", "e.g. oracle_price_below=990000... or last_price_above=...")
  .option("--nonce <uint64>", "nonce", parseBigint)
  .option("--client-id <id>", "client id", (v) => Number(v))
  .action(async (opts) => {
    const pk = mustGetEnv("NADO_PRIVATE_KEY");
    const wallet = new Wallet(pk);
    const network = parseNetwork(opts.network);
    const { eps, contracts } = await mkGatewayWithContracts(network);
    const trigger = new NadoTriggerClient(eps.triggerV1);

    const [k, v] = String(opts.requirement).split("=", 2);
    if (!k || !v) throw new Error("requirement must be key=value");
    const price_requirement: any = { [k]: v };

    const res = await triggerPlaceOrder({
      trigger,
      wallet,
      chainId: contracts.chainId,
      endpointAddr: contracts.endpointAddr,
      productId: opts.productId,
      order: {
        sender: asHex32(opts.sender),
        priceX18: opts.priceX18,
        amountX18: opts.amountX18,
        expirationSec: opts.expirationSec,
        nonce: opts.nonce,
        appendix: opts.appendix
      },
      triggerCriteria: { price_trigger: { price_requirement } },
      clientId: typeof opts.clientId === "number" ? opts.clientId : undefined
    });

    process.stdout.write(JSON.stringify(res, null, 2) + "\n");
  });

program
  .command("trigger-place-twap")
  .description("Place a TWAP trigger order via trigger service (signed execute)")
  .requiredOption("-n, --network <network>", "mainnet|testnet", "testnet")
  .requiredOption("--product-id <id>", "product id", (v) => Number(v))
  .requiredOption("--sender <bytes32>", "subaccount sender (bytes32 hex)")
  .requiredOption("--price-x18 <int>", "order limit price * 1e18", parseBigint)
  .requiredOption("--amount-x18 <int>", "total amount * 1e18 (positive buy, negative sell)", parseBigint)
  .requiredOption("--expiration-sec <int>", "unix seconds expiration", parseBigint)
  .requiredOption("--interval <sec>", "seconds between executions", (v) => Number(v))
  .requiredOption("--twap-times <n>", "number of executions (value field)", (v) => Number(v))
  .requiredOption("--twap-slippage-x6 <n>", "max slippage * 1e6", (v) => Number(v))
  .option("--amounts <csv>", "optional explicit amounts per execution (x18), comma-separated")
  .option("--nonce <uint64>", "nonce", parseBigint)
  .option("--client-id <id>", "client id", (v) => Number(v))
  .action(async (opts) => {
    const pk = mustGetEnv("NADO_PRIVATE_KEY");
    const wallet = new Wallet(pk);
    const network = parseNetwork(opts.network);
    const { eps, contracts } = await mkGatewayWithContracts(network);
    const trigger = new NadoTriggerClient(eps.triggerV1);

    const appendix = buildAppendix({
      orderType: OrderExecutionType.IOC, // required for TWAP
      triggerType: OrderTriggerType.TWAP,
      value: encodeTwapValue({ times: opts.twapTimes, slippageX6: opts.twapSlippageX6 })
    });

    const amounts =
      typeof opts.amounts === "string"
        ? String(opts.amounts)
            .split(",")
            .filter(Boolean)
            .map((s: string) => s.trim())
        : undefined;

    const res = await triggerPlaceOrder({
      trigger,
      wallet,
      chainId: contracts.chainId,
      endpointAddr: contracts.endpointAddr,
      productId: opts.productId,
      order: {
        sender: asHex32(opts.sender),
        priceX18: opts.priceX18,
        amountX18: opts.amountX18,
        expirationSec: opts.expirationSec,
        nonce: opts.nonce,
        appendix
      },
      triggerCriteria: { time_trigger: { interval: opts.interval, ...(amounts ? { amounts } : {}) } },
      clientId: typeof opts.clientId === "number" ? opts.clientId : undefined
    });

    process.stdout.write(JSON.stringify({ appendix: appendix.toString(), response: res }, null, 2) + "\n");
  });

program
  .command("trigger-list-twap-executions")
  .description("List TWAP executions for a TWAP trigger digest (unsigned query)")
  .requiredOption("-n, --network <network>", "mainnet|testnet", "testnet")
  .requiredOption("--digest <bytes32>", "trigger order digest (bytes32 hex)")
  .action(async (opts) => {
    const network = parseNetwork(opts.network);
    const eps = getEndpoints(network);
    const trigger = new NadoTriggerClient(eps.triggerV1);
    const res = await trigger.listTwapExecutions(String(opts.digest));
    process.stdout.write(JSON.stringify(res, null, 2) + "\n");
  });

program
  .command("alerts")
  .description("Subscriptions alerts mode: subscribe and print events (optionally log to file)")
  .requiredOption("-n, --network <network>", "mainnet|testnet", "testnet")
  .option("--subaccount <bytes32>", "subaccount (bytes32 hex)")
  .option("--product-id <id>", "product id", (v) => Number(v))
  .option(
    "--streams <csv>",
    "comma-separated streams (trade,best_bid_offer,fill,position_change,order_update,latest_candlestick,...)",
    "fill,position_change,order_update"
  )
  .option("--auth", "authenticate (required for order_update)", false)
  .option("--out <path>", "append JSONL to file")
  .action(async (opts) => {
    const network = parseNetwork(opts.network);
    const { eps, contracts } = await mkGatewayWithContracts(network);

    const client = new NadoSubscriptionsClient({ url: eps.subscriptionsWs });
    await client.connect();
    process.stderr.write(`connected: ${eps.subscriptionsWs}\n`);

    const subaccount = typeof opts.subaccount === "string" ? asHex32(String(opts.subaccount)) : undefined;

    if (opts.auth) {
      const pk = mustGetEnv("NADO_PRIVATE_KEY");
      const wallet = new Wallet(pk);
      const sender = subaccount ?? asHex32(mustGetEnv("NADO_SUBACCOUNT_BYTES32"));
      const expirationMs = BigInt(Date.now() + 60_000);

      const domain: NadoDomain = {
        name: "Nado",
        version: "0.0.1",
        chainId: contracts.chainId,
        verifyingContract: contracts.endpointAddr
      };

      const signature = await signTypedDataHex({
        wallet,
        domain,
        primaryType: "StreamAuthentication",
        message: { sender, expiration: expirationMs }
      });

      client.authenticate({ method: "authenticate", id: 1, tx: { sender, expiration: expirationMs.toString() }, signature });
      process.stderr.write("sent authenticate\n");
    }

    const productId = typeof opts.productId === "number" && !Number.isNaN(opts.productId) ? opts.productId : undefined;
    const streams = String(opts.streams)
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    let reqId = 10;
    for (const s of streams) {
      const stream: any = { type: s };
      if (["order_update", "fill", "position_change"].includes(s)) {
        if (!subaccount) throw new Error(`--subaccount is required for stream ${s}`);
        stream.subaccount = subaccount;
        stream.product_id = typeof productId === "number" ? productId : null;
      } else if (typeof productId === "number") {
        stream.product_id = productId;
      }

      client.subscribe({ method: "subscribe", stream, id: reqId++ });
      process.stderr.write(`subscribed: ${JSON.stringify(stream)}\n`);
    }

    client.onMessage((msg) => {
      const line = JSON.stringify(msg);
      process.stdout.write(line + "\n");
      if (typeof opts.out === "string" && opts.out.length > 0) {
        try {
          appendFileSync(String(opts.out), line + "\n", "utf8");
        } catch (e) {
          process.stderr.write(`failed to write --out: ${(e as Error).message}\n`);
        }
      }
    });
  });

program
  .command("subscribe")
  .description("Connect to subscriptions WS and print events (optionally authenticate for order_update)")
  .requiredOption("-n, --network <network>", "mainnet|testnet", "testnet")
  .requiredOption("--stream <type>", "stream type (trade, best_bid_offer, book_depth, fill, position_change, order_update, ...)")
  .option("--product-id <id>", "product id (or omit)", (v) => Number(v))
  .option("--subaccount <bytes32>", "subaccount (bytes32 hex), required for some streams")
  .option("--auth", "authenticate this connection first (requires NADO_PRIVATE_KEY)", false)
  .action(async (opts) => {
    const network = parseNetwork(opts.network);
    const { eps, contracts } = await mkGatewayWithContracts(network);

    const client = new NadoSubscriptionsClient({ url: eps.subscriptionsWs });
    await client.connect();
    process.stderr.write(`connected: ${eps.subscriptionsWs}\n`);

    if (opts.auth) {
      const pk = mustGetEnv("NADO_PRIVATE_KEY");
      const wallet = new Wallet(pk);

      const sender = asHex32(String(opts.subaccount ?? mustGetEnv("NADO_SUBACCOUNT_BYTES32")));
      const expirationMs = BigInt(Date.now() + 60_000);

      const domain: NadoDomain = {
        name: "Nado",
        version: "0.0.1",
        chainId: contracts.chainId,
        verifyingContract: contracts.endpointAddr
      };

      const signature = await signTypedDataHex({
        wallet,
        domain,
        primaryType: "StreamAuthentication",
        message: {
          sender,
          expiration: expirationMs
        }
      });

      client.authenticate({
        method: "authenticate",
        id: 1,
        tx: { sender, expiration: expirationMs.toString() },
        signature
      });
      process.stderr.write("sent authenticate\n");
    }

    const stream: any = { type: String(opts.stream) };
    if (typeof opts.productId === "number" && !Number.isNaN(opts.productId)) stream.product_id = opts.productId;
    if (opts.subaccount) stream.subaccount = asHex32(String(opts.subaccount));
    if (String(opts.stream) === "order_update" && !("product_id" in stream)) stream.product_id = null;

    client.subscribe({ method: "subscribe", stream, id: 2 });
    process.stderr.write(`subscribed: ${JSON.stringify(stream)}\n`);

    client.onMessage((msg) => {
      process.stdout.write(JSON.stringify(msg) + "\n");
    });
  });

await program.parseAsync(process.argv);
}

try {
  await main();
} catch (e) {
  const msg = e instanceof Error ? e.message : String(e);
  process.stderr.write(`ERROR: ${msg}\n`);
  process.exitCode = 1;
}

