import { getAptos } from "./registry";
import type { SupportedNetwork } from "./networks";
import { SHELBYUSD_FA_METADATA_ADDRESS } from "@shelby-protocol/sdk/browser";

/** ShelbyUSD Fungible Asset metadata address, for the SDK's network. */
const SUSD_METADATA = SHELBYUSD_FA_METADATA_ADDRESS;

export const APT_DECIMALS = 8;
export const SUSD_DECIMALS = 8;

export async function getAptBalance(
  network: SupportedNetwork,
  address: string
): Promise<bigint> {
  if (!address) return 0n;
  try {
    const aptos = getAptos(network);
    const amount = await aptos.getAccountAPTAmount({ accountAddress: address });
    return BigInt(amount);
  } catch {
    return 0n;
  }
}

export async function getSusdBalance(
  network: SupportedNetwork,
  address: string
): Promise<bigint> {
  if (!address) return 0n;
  try {
    const aptos = getAptos(network);
    const balances = await aptos.getCurrentFungibleAssetBalances({
      options: {
        where: {
          owner_address: { _eq: address },
          asset_type: { _eq: SUSD_METADATA },
        },
      },
    });
    if (balances.length > 0) return BigInt(balances[0].amount ?? 0);
    return 0n;
  } catch {
    return 0n;
  }
}

export function formatTokenAmount(
  raw: bigint,
  decimals: number,
  displayDecimals = 4
): string {
  const divisor = BigInt(10) ** BigInt(decimals);
  const whole = raw / divisor;
  const fraction = raw % divisor;
  const fractionStr = fraction
    .toString()
    .padStart(decimals, "0")
    .slice(0, displayDecimals)
    .replace(/0+$/, "");
  return fractionStr ? `${whole}.${fractionStr}` : whole.toString();
}
