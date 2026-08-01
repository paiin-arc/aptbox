import { Aptos, AptosConfig, Network } from "@aptos-labs/ts-sdk";
import {
  aptosApiKeyFor,
  registryAddressFor,
  type SupportedNetwork,
} from "./networks";

/** 1 APT = 100,000,000 octas. */
export const OCTAS_PER_APT = 100_000_000n;

/**
 * Parses an APT amount typed by a human into octas.
 *
 * Deliberately string-based rather than `Number(apt) * 1e8`: this is money, and
 * that product is not always an integer — Number("0.29") * 1e8 is
 * 28999999.999999996, which truncates to one octa short of the price the seller
 * typed. Parsing the decimal into a BigInt is exact for every input. Anything
 * finer than one octa is truncated, since the chain cannot represent it.
 */
export function aptToOctas(apt: string): bigint {
  const t = apt.trim();
  if (!t || t === "." || !/^\d*\.?\d*$/.test(t)) return 0n;
  const [whole, frac = ""] = t.split(".");
  const octaFrac = (frac + "00000000").slice(0, 8);
  return BigInt(whole || "0") * OCTAS_PER_APT + BigInt(octaFrac);
}

/** Formats octas for display, keeping small prices legible. */
export function aptFromOctas(octas: bigint): string {
  const apt = Number(octas) / Number(OCTAS_PER_APT);
  if (apt === 0) return "0";
  if (apt < 0.0001) return apt.toExponential(2);
  return apt.toFixed(apt < 1 ? 4 : 2);
}

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
