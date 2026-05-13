import WebSocket from "ws";
import { z } from "zod";

export type SubscriptionsClientOpts = {
  url: string;
};

export type SubscribeRequest = {
  method: "subscribe" | "unsubscribe";
  stream: Record<string, unknown>;
  id?: number;
};

export type AuthenticateRequest = {
  method: "authenticate";
  id: number;
  tx: {
    sender: string; // bytes32 hex
    expiration: string; // ms since epoch
  };
  signature: string; // 0x...
};

const GenericResponse = z.object({
  id: z.number().optional(),
  result: z.any().optional(),
  error: z.any().optional()
});

export class NadoSubscriptionsClient {
  private ws?: WebSocket;

  constructor(private readonly opts: SubscriptionsClientOpts) {}

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(this.opts.url, {
        headers: {
          // docs require permessage-deflate
          "Sec-WebSocket-Extensions": "permessage-deflate"
        }
      });

      ws.on("open", () => {
        this.ws = ws;
        resolve();
      });
      ws.on("error", (err) => reject(err));
    });
  }

  close(): void {
    this.ws?.close();
  }

  sendJson(msg: unknown): void {
    if (!this.ws) throw new Error("WebSocket not connected");
    this.ws.send(JSON.stringify(msg));
  }

  authenticate(req: AuthenticateRequest): void {
    this.sendJson(req);
  }

  subscribe(req: SubscribeRequest): void {
    this.sendJson(req);
  }

  onMessage(cb: (msg: unknown) => void): void {
    if (!this.ws) throw new Error("WebSocket not connected");
    this.ws.on("message", (data) => {
      try {
        const text = data.toString("utf8");
        const json = JSON.parse(text);
        cb(json);
      } catch (e) {
        cb({ type: "raw", data: data.toString() });
      }
    });
  }

  onAck(cb: (ack: { id?: number; result?: unknown }) => void): void {
    this.onMessage((msg) => {
      const parsed = GenericResponse.safeParse(msg);
      if (parsed.success && ("result" in parsed.data || "id" in parsed.data)) {
        cb({ id: parsed.data.id, result: parsed.data.result });
      }
    });
  }
}

