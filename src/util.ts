import { z } from "zod";

export function mustGetEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

export function nowMs(): number {
  return Date.now();
}

export function mkRecvTimeNonce(opts?: { recvTimeMs?: number; salt?: number }): bigint {
  // As documented for order/cancellation nonces:
  // nonce = (recv_time_ms << 20) + salt20bits
  const recvTimeMs = BigInt(opts?.recvTimeMs ?? nowMs() + 50);
  const salt = BigInt((opts?.salt ?? Math.floor(Math.random() * 1_000_000)) & ((1 << 20) - 1));
  return (recvTimeMs << 20n) + salt;
}

export function asHex32(value: string): string {
  // Accept 0x-prefixed 32-byte hex strings.
  return z
    .string()
    .regex(/^0x[0-9a-fA-F]{64}$/, "Expected 0x + 64 hex chars (bytes32)")
    .parse(value);
}

export function asHex(value: string): string {
  return z
    .string()
    .regex(/^0x[0-9a-fA-F]*$/, "Expected 0x-prefixed hex string")
    .parse(value);
}

export function productIdToVerifyingContract(productId: number): string {
  // docs: verifyingContract for PlaceOrder is address(productId)
  // ex: productId=18 => ...0012 (20 bytes)
  const pid = BigInt(productId);
  if (pid < 0n) throw new Error("productId must be >= 0");
  const hex = pid.toString(16).padStart(40, "0");
  return `0x${hex}`;
}

