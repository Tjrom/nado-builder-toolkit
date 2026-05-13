import { z } from "zod";

function mkHeaders(): HeadersInit {
  // docs: must include gzip/br/deflate
  return {
    "content-type": "application/json",
    "accept-encoding": "gzip, br, deflate"
  };
}

export class NadoArchiveClient {
  constructor(public readonly archiveV1: string) {}

  async query(body: unknown): Promise<unknown> {
    const res = await fetch(this.archiveV1, {
      method: "POST",
      headers: mkHeaders(),
      body: JSON.stringify(body)
    });
    return await res.json();
  }

  async candlesticks(params: { productId: number; granularitySec: number; limit?: number; maxTimeSec?: number }): Promise<unknown> {
    const payload: any = {
      candlesticks: {
        product_id: params.productId,
        granularity: params.granularitySec,
        limit: params.limit ?? 100
      }
    };
    if (typeof params.maxTimeSec === "number") payload.candlesticks.max_time = params.maxTimeSec;
    return await this.query(payload);
  }

  async orders(params: {
    subaccounts?: string[];
    productIds?: number[];
    limit?: number;
    maxTimeSec?: number;
    idx?: number | string;
    digests?: string[];
    triggerTypes?: Array<"price_trigger" | "time_trigger" | "none">;
    isolated?: boolean | null;
  }): Promise<unknown> {
    const o: any = {};
    if (params.subaccounts) o.subaccounts = params.subaccounts;
    if (params.productIds) o.product_ids = params.productIds;
    if (typeof params.limit === "number") o.limit = params.limit;
    if (typeof params.maxTimeSec !== "undefined") o.max_time = params.maxTimeSec;
    if (typeof params.idx !== "undefined") o.idx = params.idx;
    if (params.digests) o.digests = params.digests;
    if (params.triggerTypes) o.trigger_types = params.triggerTypes;
    if (typeof params.isolated === "boolean" || params.isolated === null) o.isolated = params.isolated;
    return await this.query({ orders: o });
  }
}

export const SupportedGranularities = z.union([
  z.literal(60),
  z.literal(300),
  z.literal(900),
  z.literal(3600),
  z.literal(7200),
  z.literal(14400),
  z.literal(86400),
  z.literal(604800),
  z.literal(2419200)
]);

