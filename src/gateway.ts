import { z } from "zod";
import { detectEdgeBlock, formatHttpError, readJsonOrText } from "./http.js";

const ContractsResponse = z.union([
  z.object({
    status: z.string(),
    data: z
      .object({
        chain_id: z.string(),
        endpoint_addr: z.string()
      })
      .optional(),
    error: z.string().optional(),
    error_code: z.number().optional()
  }),
  // Example observed when blocked at the edge:
  // {"reason":"ip","blocked":true}
  z.object({
    reason: z.string().optional(),
    blocked: z.boolean().optional()
  })
]);

export type Contracts = {
  chainId: number;
  endpointAddr: string;
};

function mkHeaders(): HeadersInit {
  // docs: must include gzip/br/deflate
  return {
    "content-type": "application/json",
    "accept-encoding": "gzip, br, deflate"
  };
}

export class NadoGatewayClient {
  constructor(public readonly gatewayRestV1: string) {}

  async queryContracts(): Promise<Contracts> {
    const url = new URL(`${this.gatewayRestV1}/query`);
    url.searchParams.set("type", "contracts");
    const res = await fetch(url, { method: "GET", headers: mkHeaders() });
    const json = await readJsonOrText(res);
    const blocked = detectEdgeBlock(json);
    if (blocked) {
      throw new Error(formatHttpError({ where: "gateway/contracts", status: res.status, json }));
    }
    const parsed = ContractsResponse.parse(json);
    if ("blocked" in parsed && parsed.blocked) {
      throw new Error(formatHttpError({ where: "gateway/contracts", status: res.status, json: parsed }));
    }
    if (!("status" in parsed) || parsed.status !== "success" || !parsed.data) {
      const err = "error" in parsed ? parsed.error : undefined;
      const code = "error_code" in parsed ? parsed.error_code : undefined;
      throw new Error(`contracts query failed: ${err ?? "unknown error"} (${code ?? "n/a"})`);
    }
    return {
      chainId: Number(parsed.data.chain_id),
      endpointAddr: parsed.data.endpoint_addr
    };
  }

  async execute(body: unknown): Promise<unknown> {
    const res = await fetch(`${this.gatewayRestV1}/execute`, {
      method: "POST",
      headers: mkHeaders(),
      body: JSON.stringify(body)
    });
    const json = await readJsonOrText(res);
    const blocked = detectEdgeBlock(json);
    if (blocked) {
      throw new Error(formatHttpError({ where: "gateway/execute", status: res.status, json }));
    }
    return json;
  }
}

