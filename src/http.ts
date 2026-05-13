export type NadoEdgeBlock = { blocked: true; reason?: string };

export async function readJsonOrText(res: Response): Promise<unknown> {
  const contentType = res.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) return await res.json();
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

export function detectEdgeBlock(json: unknown): NadoEdgeBlock | null {
  if (!json || typeof json !== "object") return null;
  const j = json as any;
  if (j.blocked === true) return { blocked: true, reason: typeof j.reason === "string" ? j.reason : undefined };
  return null;
}

export function formatHttpError(opts: { where: string; status?: number; json?: unknown }): string {
  const status = typeof opts.status === "number" ? `status=${opts.status}` : "status=n/a";
  const block = detectEdgeBlock(opts.json);
  if (block) return `${opts.where} blocked by edge (reason=${block.reason ?? "unknown"})`;
  return `${opts.where} failed (${status})`;
}

