export type NadoNetwork = "mainnet" | "testnet";

export type NadoEndpoints = {
  gatewayRestV1: string;
  gatewayWsV1: string;
  gatewayWsV2: string;
  subscriptionsWs: string;
  archiveV1: string;
  archiveV2: string;
  triggerV1: string;
  gatewayRestV2: string;
};

// From https://docs.nado.xyz/developer-resources/api/endpoints
export function getEndpoints(network: NadoNetwork): NadoEndpoints {
  if (network === "mainnet") {
    return {
      gatewayRestV1: "https://gateway.prod.nado.xyz/v1",
      gatewayWsV1: "wss://gateway.prod.nado.xyz/v1/ws",
      gatewayWsV2: "wss://gateway.prod.nado.xyz/ws/v2",
      subscriptionsWs: "wss://gateway.prod.nado.xyz/v1/subscribe",
      archiveV1: "https://archive.prod.nado.xyz/v1",
      archiveV2: "https://archive.prod.nado.xyz/v2",
      triggerV1: "https://trigger.prod.nado.xyz/v1",
      gatewayRestV2: "https://gateway.prod.nado.xyz/v2"
    };
  }

  return {
    gatewayRestV1: "https://gateway.test.nado.xyz/v1",
    gatewayWsV1: "wss://gateway.test.nado.xyz/v1/ws",
    gatewayWsV2: "wss://gateway.test.nado.xyz/ws/v2",
    subscriptionsWs: "wss://gateway.test.nado.xyz/v1/subscribe",
    archiveV1: "https://archive.test.nado.xyz/v1",
    archiveV2: "https://archive.test.nado.xyz/v2",
    triggerV1: "https://trigger.test.nado.xyz/v1",
    gatewayRestV2: "https://gateway.test.nado.xyz/v2"
  };
}

