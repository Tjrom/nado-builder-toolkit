import { Wallet } from "ethers";
import { NadoGatewayClient } from "./gateway.js";
import { NadoDomain, signTypedDataHex } from "./eip712.js";
import { asHex32, mkRecvTimeNonce, productIdToVerifyingContract } from "./util.js";

export type PlaceOrderInput = {
  productId: number;
  sender: string; // bytes32 hex (subaccount)
  priceX18: bigint;
  amountX18: bigint; // positive=buy, negative=sell
  expirationSec: bigint;
  appendix: bigint; // uint128
  nonce?: bigint; // uint64
  clientId?: number;
  spotLeverage?: boolean;
};

export type CancelOrdersInput = {
  sender: string; // bytes32 hex
  productIds: number[];
  digests: string[]; // bytes32 hex strings
  nonce?: bigint;
  requiredUnfilledAmountX18?: bigint;
  clientId?: number;
};

export async function placeOrder(opts: {
  gateway: NadoGatewayClient;
  wallet: Wallet;
  chainId: number;
  endpointAddr: string;
  input: PlaceOrderInput;
}): Promise<unknown> {
  const nonce = opts.input.nonce ?? mkRecvTimeNonce();
  const order = {
    sender: asHex32(opts.input.sender),
    priceX18: opts.input.priceX18.toString(),
    amount: opts.input.amountX18.toString(),
    expiration: opts.input.expirationSec.toString(),
    nonce: nonce.toString(),
    appendix: opts.input.appendix.toString()
  };

  const domain: NadoDomain = {
    name: "Nado",
    version: "0.0.1",
    chainId: opts.chainId,
    verifyingContract: productIdToVerifyingContract(opts.input.productId)
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
      appendix: BigInt(order.appendix)
    }
  });

  const body: any = {
    place_order: {
      product_id: opts.input.productId,
      order,
      signature
    }
  };
  if (typeof opts.input.clientId === "number") body.place_order.id = opts.input.clientId;
  if (typeof opts.input.spotLeverage === "boolean") body.place_order.spot_leverage = opts.input.spotLeverage;

  return await opts.gateway.execute(body);
}

export async function cancelOrders(opts: {
  gateway: NadoGatewayClient;
  wallet: Wallet;
  chainId: number;
  endpointAddr: string;
  input: CancelOrdersInput;
}): Promise<unknown> {
  const nonce = opts.input.nonce ?? mkRecvTimeNonce();
  const tx = {
    sender: asHex32(opts.input.sender),
    productIds: opts.input.productIds,
    digests: opts.input.digests,
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

  const body: any = {
    cancel_orders: {
      tx,
      signature
    }
  };
  if (typeof opts.input.requiredUnfilledAmountX18 === "bigint") {
    body.cancel_orders.required_unfilled_amount = opts.input.requiredUnfilledAmountX18.toString();
  }
  if (typeof opts.input.clientId === "number") body.cancel_orders.id = opts.input.clientId;

  return await opts.gateway.execute(body);
}

