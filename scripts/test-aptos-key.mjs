// Standalone test: verify the Aptos Labs API key works via the SDK.
// Run from project root:  node scripts/test-aptos-key.mjs

import { Aptos, AptosConfig, Network } from "@aptos-labs/ts-sdk";
import { readFileSync } from "node:fs";

// Load .env.local manually (Node doesn't do this on its own)
const envText = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
const env = Object.fromEntries(
  envText
    .split("\n")
    .filter((l) => l.trim() && !l.startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    })
);

const apiKey = env.NEXT_PUBLIC_APTOS_API_KEY_TESTNET;
if (!apiKey) {
  console.error("Missing NEXT_PUBLIC_APTOS_API_KEY_TESTNET in .env.local");
  process.exit(1);
}

console.log(`Using key: ${apiKey.slice(0, 10)}…${apiKey.slice(-4)}`);

const config = new AptosConfig({
  network: Network.TESTNET,
  clientConfig: { API_KEY: apiKey },
});
const aptos = new Aptos(config);

const info = await aptos.account.getAccountInfo({ accountAddress: "0x1" });
console.log("✓ getAccountInfo(0x1):", info);

// Bonus: also call our deployed registry's view fn
const registry =
  env.NEXT_PUBLIC_REGISTRY_ADDRESS_TESTNET ?? env.NEXT_PUBLIC_REGISTRY_ADDRESS;
if (registry) {
  const result = await aptos.view({
    payload: {
      function: `${registry}::registry::next_id`,
      typeArguments: [],
      functionArguments: [],
    },
  });
  console.log(`✓ ${registry}::registry::next_id:`, result);
}
