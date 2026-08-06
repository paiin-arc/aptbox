/**
 * Confirms the app's default network actually has a live registry behind it.
 *
 * Reads the same env vars the app reads, resolves them the same way
 * src/lib/networks.ts does, then calls the registry's `next_id` view. Kept
 * standalone rather than importing src/lib so it can run under plain node,
 * which doesn't resolve the extensionless internal imports the bundler does.
 *
 * Run: node --experimental-strip-types --env-file=.env.local scripts/check-network.mts
 */

const SUPPORTED = ["shelbynet"] as const;
type Net = (typeof SUPPORTED)[number];

const NODE_API: Record<Net, string> = {
  shelbynet: "https://api.shelbynet.shelby.xyz/v1",
};

function resolveDefault(): Net {
  // Mirrors defaultNetwork() in src/lib/networks.ts — one override, one fallback.
  const v = (process.env.NEXT_PUBLIC_DEFAULT_NETWORK ?? "").toLowerCase();
  if ((SUPPORTED as readonly string[]).includes(v)) return v as Net;
  return "shelbynet";
}

const net = resolveDefault();
const addr = process.env.NEXT_PUBLIC_REGISTRY_ADDRESS_SHELBYNET;

console.log("default network :", net);
console.log("registry address:", addr);

if (!addr) {
  console.log("\nFAIL: no registry address configured for this network");
  process.exit(1);
}

const res = await fetch(`${NODE_API[net]}/view`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    function: `${addr}::registry::next_id`,
    type_arguments: [],
    arguments: [],
  }),
});

const body = await res.json();
if (!res.ok) {
  // The failure this script exists to catch: the module isn't there at all,
  // usually because the network was wiped or the address is stale. The app
  // shows an empty dashboard in that case rather than an error, so it is easy
  // to miss without checking.
  console.log("\nFAIL: registry not reachable —", body.message ?? res.status);
  console.log("      redeploy with the steps in README > Move contract");
  process.exit(1);
}

// An empty registry is a normal state for a freshly deployed or freshly wiped
// network, so it is not a failure. Answering at all is the signal.
const total = Number(body[0]);
console.log("datasets in registry:", total);
console.log(
  `\nOK: registry is live${total === 0 ? " (empty — nothing uploaded yet)" : ""}`
);
