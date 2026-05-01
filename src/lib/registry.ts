import { Aptos, AptosConfig, Network } from "@aptos-labs/ts-sdk";
import {
  aptosApiKeyFor,
  registryAddressFor,
  type SupportedNetwork,
} from "./networks";

export const ACCESS_PUBLIC = 0;
export const ACCESS_PAID = 1;
export const ACCESS_WHITELIST = 2;
export const ACCESS_TOKEN_GATED = 3;

const aptosCache = new Map<SupportedNetwork, Aptos>();

export function getAptos(network: SupportedNetwork): Aptos {
  const cached = aptosCache.get(network);
  if (cached) return cached;
  const apiKey = aptosApiKeyFor(network);
  const aptos = new Aptos(
    new AptosConfig({
      network: network as Network,
      ...(apiKey ? { clientConfig: { API_KEY: apiKey } } : {}),
    })
  );
  aptosCache.set(network, aptos);
  return aptos;
}

export function getRegistryAddress(network: SupportedNetwork): string {
  return registryAddressFor(network);
}

export type RegisterFileArgs = {
  contentHash: Uint8Array;
  shelbyCid: string;
  mimeType: string;
  sizeBytes: number;
  accessType: number;
  priceOctas: bigint;
  whitelist: string[];
};

export function buildRegisterFilePayload(
  network: SupportedNetwork,
  args: RegisterFileArgs
) {
  const addr = getRegistryAddress(network);
  if (!addr) {
    throw new Error(
      `No registry address for ${network}. Set NEXT_PUBLIC_REGISTRY_ADDRESS_${network.toUpperCase()}.`
    );
  }
  return {
    function:
      `${addr}::registry::register_file` as `${string}::${string}::${string}`,
    typeArguments: [],
    functionArguments: [
      Array.from(args.contentHash),
      args.shelbyCid,
      args.mimeType,
      args.sizeBytes.toString(),
      args.accessType,
      args.priceOctas.toString(),
      args.whitelist,
    ],
  };
}

export function buildPurchaseAccessPayload(
  network: SupportedNetwork,
  fileId: string
) {
  const addr = getRegistryAddress(network);
  if (!addr) throw new Error(`No registry address for ${network}.`);
  return {
    function:
      `${addr}::registry::purchase_access` as `${string}::${string}::${string}`,
    typeArguments: [],
    functionArguments: [fileId],
  };
}

export function buildFlagFilePayload(
  network: SupportedNetwork,
  fileId: string
) {
  const addr = getRegistryAddress(network);
  if (!addr) throw new Error(`No registry address for ${network}.`);
  return {
    function:
      `${addr}::registry::flag_file` as `${string}::${string}::${string}`,
    typeArguments: [],
    functionArguments: [fileId],
  };
}

export function buildDeleteFilePayload(
  network: SupportedNetwork,
  fileId: string
) {
  const addr = getRegistryAddress(network);
  if (!addr) throw new Error(`No registry address for ${network}.`);
  return {
    function:
      `${addr}::registry::delete_file` as `${string}::${string}::${string}`,
    typeArguments: [],
    functionArguments: [fileId],
  };
}

export function extractFileIdFromTx(
  events: { type: string; data: any }[]
): bigint | null {
  const evt = events.find((e) => e.type.includes("::registry::FileRegistered"));
  if (!evt) return null;
  const id = evt.data?.file_id;
  return id != null ? BigInt(id) : null;
}
