import { getAptos } from "./registry";
import type { SupportedNetwork } from "./networks";

/** ShelbyUSD Fungible Asset metadata address (same on testnet + shelbynet). */
const SUSD_METADATA =
  "0x1b18363a9f1fe5e6ebf247daba5cc1c18052bb232efdc4c50f556053922d98e1";

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
