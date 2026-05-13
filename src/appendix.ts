export enum OrderExecutionType {
  DEFAULT = 0,
  IOC = 1,
  FOK = 2,
  POST_ONLY = 3
}

export enum OrderTriggerType {
  NONE = 0,
  PRICE = 1,
  TWAP = 2,
  TWAP_CUSTOM_AMOUNTS = 3
}

export type BuildAppendixParams = {
  version?: number; // 0..255 (docs say currently 1)
  isolated?: boolean;
  orderType?: OrderExecutionType;
  reduceOnly?: boolean;
  triggerType?: OrderTriggerType;
  builderId?: number; // 0..65535
  builderFeeRate?: number; // 0..1023 (0.1bps units)
  value?: bigint; // 64-bit payload (isolated margin x6 OR TWAP payload)
};

const MASK_64 = (1n << 64n) - 1n;

export function encodeTwapValue(params: { times: number; slippageX6: number }): bigint {
  if (!Number.isInteger(params.times) || params.times < 0) throw new Error("twap times must be >= 0 integer");
  if (!Number.isInteger(params.slippageX6) || params.slippageX6 < 0) throw new Error("slippageX6 must be >= 0 integer");
  const times = BigInt(params.times) & ((1n << 32n) - 1n);
  const slip = BigInt(params.slippageX6) & ((1n << 32n) - 1n);
  return times | (slip << 32n);
}

export function buildAppendix(p: BuildAppendixParams = {}): bigint {
  const version = p.version ?? 1;
  if (!Number.isInteger(version) || version < 0 || version > 255) throw new Error("version must be 0..255");

  const isolated = !!p.isolated;
  const orderType = p.orderType ?? OrderExecutionType.DEFAULT;
  const reduceOnly = !!p.reduceOnly;
  const triggerType = p.triggerType ?? OrderTriggerType.NONE;
  const builderId = p.builderId ?? 0;
  const builderFeeRate = p.builderFeeRate ?? 0;
  const value = (p.value ?? 0n) & MASK_64;

  if (builderId === 0 && builderFeeRate !== 0) {
    throw new Error("builderFeeRate cannot be set when builderId=0");
  }
  if (isolated && (triggerType === OrderTriggerType.TWAP || triggerType === OrderTriggerType.TWAP_CUSTOM_AMOUNTS)) {
    throw new Error("isolated orders cannot be combined with TWAP triggers");
  }

  let a = 0n;
  a |= BigInt(version) & 0xffn; // bits 0..7
  if (isolated) a |= 1n << 8n; // bit 8
  a |= (BigInt(orderType) & 0x3n) << 9n; // bits 9..10
  if (reduceOnly) a |= 1n << 11n; // bit 11
  a |= (BigInt(triggerType) & 0x3n) << 12n; // bits 12..13
  a |= (BigInt(builderFeeRate) & 0x3ffn) << 38n; // bits 38..47
  a |= (BigInt(builderId) & 0xffffn) << 48n; // bits 48..63
  a |= value << 64n; // bits 64..127
  return a;
}

export function parseAppendix(a: bigint) {
  const version = Number(a & 0xffn);
  const isolated = ((a >> 8n) & 1n) === 1n;
  const orderType = Number((a >> 9n) & 0x3n) as OrderExecutionType;
  const reduceOnly = ((a >> 11n) & 1n) === 1n;
  const triggerType = Number((a >> 12n) & 0x3n) as OrderTriggerType;
  const builderFeeRate = Number((a >> 38n) & 0x3ffn);
  const builderId = Number((a >> 48n) & 0xffffn);
  const value = (a >> 64n) & MASK_64;

  return { version, isolated, orderType, reduceOnly, triggerType, builderId, builderFeeRate, value };
}

