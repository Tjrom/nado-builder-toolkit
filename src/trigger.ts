import { Wallet } from "ethers";
import { NadoDomain, signTypedDataHex } from "./eip712.js";
import { asHex32, mkRecvTimeNonce, productIdToVerifyingContract } from "./util.js";
import { detectEdgeBlock, formatHttpError, readJsonOrText } from "./http.js";

function mkHeaders(): HeadersInit {
  return {
    "content-type": "application/json",
    "accept-encoding": "gzip, br, deflate"
  };
}

export class NadoTriggerClient {
  constructor(public readonly triggerV1: string) {}

  async execute(body: unknown): Promise<unknown> {
    const res = await fetch(`${this.triggerV1}/execute`, {
      method: "POST",
      headers: mkHeaders(),
      body: JSON.stringify(body)
    });
    const json = await readJsonOrText(res);
    const blocked = detectEdgeBlock(json);
    if (blocked) {
      throw new Error(formatHttpError({ where: "trigger/execute", status: res.status, json }));
    }
    return json;
  }

  async query(body: unknown): Promise<unknown> {
    const res = await fetch(`${this.triggerV1}/query`, {
      method: "POST",
      headers: mkHeaders(),
      body: JSON.stringify(body)
    });
    const json = await readJsonOrText(res);
    const blocked = detectEdgeBlock(json);
    if (blocked) {
      throw new Error(formatHttpError({ where: "trigger/query", status: res.status, json }));
    }
    return json;
  }

  async listTwapExecutions(digest: string): Promise<unknown> {
    return await this.query({ type: "list_twap_executions", digest });
  }
}

export type PriceRequirement =
  | { oracle_price_above: string }
  | { oracle_price_below: string }
  | { last_price_above: string }
  | { last_price_below: string }
  | { mid_price_above: string }
  | { mid_price_below: string };

export async function triggerPlaceOrder(opts: {
  trigger: NadoTriggerClient;
  wallet: Wallet;
  chainId: number;
  endpointAddr: string;
  productId: number;
  order: {
    sender: string;
    priceX18: bigint;
    amountX18: bigint;
    expirationSec: bigint;
    nonce?: bigint;
    appendix?: bigint;
  };
  triggerCriteria:
    | { price_trigger: { price_requirement: PriceRequirement; dependency?: { digest: string; on_partial_fill: boolean } } }
    | { time_trigger: { interval: number; amounts?: string[] } };
  clientId?: number;
  spotLeverage?: boolean;
}): Promise<unknown> {
  const nonce = opts.order.nonce ?? mkRecvTimeNonce();
  const order = {
    sender: asHex32(opts.order.sender),
    priceX18: opts.order.priceX18.toString(),
    amount: opts.order.amountX18.toString(),
    expiration: opts.order.expirationSec.toString(),
    nonce: nonce.toString(),
    ...(typeof opts.order.appendix === "bigint" ? { appendix: opts.order.appendix.toString() } : {})
  };

  const domain: NadoDomain = {
    name: "Nado",
    version: "0.0.1",
    chainId: opts.chainId,
    verifyingContract: productIdToVerifyingContract(opts.productId)
  };

  const signature = await signTypedDataHex({
    wallet: opts.wallet,
    domain,
    primaryType: "Order",
    message: {
      sender: order.sender,
      priceX18: order.priceX18,
      amount: order.amount,
      expiration: order.expiration,
      nonce: BigInt(order.nonce),
      appendix: BigInt(order.appendix ?? "0")
    }
  });

  const body: any = {
    place_order: {
      product_id: opts.productId,
      order,
      trigger: opts.triggerCriteria,
      signature
    }
  };
  if (typeof opts.clientId === "number") body.place_order.id = opts.clientId;
  if (typeof opts.spotLeverage === "boolean") body.place_order.spot_leverage = opts.spotLeverage;
  return await opts.trigger.execute(body);
}

export async function triggerCancelOrders(opts: {
  trigger: NadoTriggerClient;
  wallet: Wallet;
  chainId: number;
  endpointAddr: string;
  sender: string;
  productIds: number[];
  digests: string[];
  nonce?: bigint;
}): Promise<unknown> {
  const nonce = opts.nonce ?? mkRecvTimeNonce();
  const tx = {
    sender: asHex32(opts.sender),
    productIds: opts.productIds,
    digests: opts.digests,
    nonce: nonce.toString()
  };

  const domain: NadoDomain = {
    name: "Nado",
    version: "0.0.1",
    chainId: opts.chainId,
    verifyingContract: opts.endpointAddr
  };

  const signature = await signTypedDataHex({
    wallet: opts.wallet,
    domain,
    primaryType: "Cancellation",
    message: {
      sender: tx.sender,
      productIds: tx.productIds,
      digests: tx.digests,
      nonce: BigInt(tx.nonce)
    }
  });

  return await opts.trigger.execute({
    cancel_orders: {
      tx,
      signature
    }
  });
}

export async function listTriggerOrders(opts: {
  trigger: NadoTriggerClient;
  wallet: Wallet;
  chainId: number;
  endpointAddr: string;
  sender: string;
  recvTimeMs?: bigint;
  productIds?: number[];
  limit?: number;
  maxUpdateTimeSec?: number;
  maxDigest?: string;
  digests?: string[];
  triggerTypes?: Array<"price_trigger" | "time_trigger">;
  statusTypes?: Array<
    | "cancelled"
    | "triggered"
    | "internal_error"
    | "triggering"
    | "waiting_price"
    | "waiting_dependency"
    | "twap_executing"
    | "twap_completed"
  >;
  reduceOnly?: boolean;
}): Promise<unknown> {
  const recvTime = opts.recvTimeMs ?? BigInt(Date.now() + 50);
  const tx = { sender: asHex32(opts.sender), recvTime: recvTime.toString() };

  const domain: NadoDomain = {
    name: "Nado",
    version: "0.0.1",
    chainId: opts.chainId,
    verifyingContract: opts.endpointAddr
  };

  const signature = await signTypedDataHex({
    wallet: opts.wallet,
    domain,
    primaryType: "ListTriggerOrders",
    message: {
      sender: tx.sender,
      recvTime: recvTime
    }
  });

  const body: any = {
    type: "list_trigger_orders",
    tx,
    signature
  };
  if (opts.productIds) body.product_ids = opts.productIds;
  if (typeof opts.limit === "number") body.limit = opts.limit;
  if (typeof opts.maxUpdateTimeSec === "number") body.max_update_time = opts.maxUpdateTimeSec;
  if (typeof opts.maxDigest === "string") body.max_digest = opts.maxDigest;
  if (opts.digests) body.digests = opts.digests;
  if (opts.triggerTypes) body.trigger_types = opts.triggerTypes;
  if (opts.statusTypes) body.status_types = opts.statusTypes;
  if (typeof opts.reduceOnly === "boolean") body.reduce_only = opts.reduceOnly;

  return await opts.trigger.query(body);
}


