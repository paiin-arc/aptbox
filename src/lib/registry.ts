import { Aptos, AptosConfig, Network } from "@aptos-labs/ts-sdk";
import {
  aptosApiKeyFor,
  registryAddressFor,
  type SupportedNetwork,
} from "./networks";

export const ACCESS_PUBLIC = 0;
export const ACCESS_PAID = 1;
export const ACCESS_WHITELIST = 2;

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

type RegisterFileArgs = {
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

/** Buys access to a paid dataset. Pays the uploader directly, on-chain. */
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

/** Max accepted by the Move module — mirror it so the UI fails before the tx. */
export const MAX_DESCRIPTION_LEN = 500;

/**
 * Sets a dataset's listing description. The module asserts the signer is the
 * original uploader, so this will abort for anyone else — buying access never
 * confers the right to rewrite a listing.
 */
export function buildSetDescriptionPayload(
  network: SupportedNetwork,
  fileId: string,
  text: string
) {
  const addr = getRegistryAddress(network);
  if (!addr) throw new Error(`No registry address for ${network}.`);
  return {
    function:
      `${addr}::registry::set_description` as `${string}::${string}::${string}`,
    typeArguments: [],
    functionArguments: [fileId, text],
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
  events: { type: string; data: Record<string, unknown> }[]
): bigint | null {
  const evt = events.find((e) => e.type.includes("::registry::FileRegistered"));
  if (!evt) return null;
  const id = evt.data?.file_id as string | number | undefined;
  return id != null ? BigInt(id) : null;
}
