import { TypedDataDomain, Wallet, Signature, TypedDataField } from "ethers";

export type NadoDomain = TypedDataDomain & {
  name: "Nado";
  version: "0.0.1";
  chainId: number;
  verifyingContract: string;
};

export type Eip712Types = Record<string, Array<TypedDataField>>;

export const types = {
  Order: [
    { name: "sender", type: "bytes32" },
    { name: "priceX18", type: "int128" },
    { name: "amount", type: "int128" },
    { name: "expiration", type: "uint64" },
    { name: "nonce", type: "uint64" },
    { name: "appendix", type: "uint128" }
  ],
  Cancellation: [
    { name: "sender", type: "bytes32" },
    { name: "productIds", type: "uint32[]" },
    { name: "digests", type: "bytes32[]" },
    { name: "nonce", type: "uint64" }
  ],
  StreamAuthentication: [
    { name: "sender", type: "bytes32" },
    { name: "expiration", type: "uint64" }
  ],
  ListTriggerOrders: [
    { name: "sender", type: "bytes32" },
    { name: "recvTime", type: "uint64" }
  ]
} satisfies Eip712Types;

export async function signTypedDataHex(opts: {
  wallet: Wallet;
  domain: NadoDomain;
  primaryType: keyof typeof types;
  message: Record<string, unknown>;
}): Promise<string> {
  const sig = await opts.wallet.signTypedData(opts.domain, { [opts.primaryType]: types[opts.primaryType] }, opts.message);
  // normalize to 0x{r}{s}{v}
  return Signature.from(sig).serialized;
}

