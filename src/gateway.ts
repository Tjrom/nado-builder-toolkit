import { z } from "zod";

const ContractsResponse = z.object({
  status: z.string(),
  data: z
    .object({
      chain_id: z.string(),
      endpoint_addr: z.string()
    })
    .optional(),
  error: z.string().optional(),
  error_code: z.number().optional()
});

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
    const json = await res.json();
    const parsed = ContractsResponse.parse(json);
    if (parsed.status !== "success" || !parsed.data) {
      throw new Error(`contracts query failed: ${parsed.error ?? "unknown error"} (${parsed.error_code ?? "n/a"})`);
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
    return await res.json();
  }
}

