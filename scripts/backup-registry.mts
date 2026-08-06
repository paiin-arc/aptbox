/**
 * Snapshot the whole on-chain registry to JSON, so a testnet wipe doesn't take
 * the dataset catalogue with it.
 *
 * Run: npm run backup:registry            (defaults to testnet)
 *      NETWORK=shelbynet npm run backup:registry
 *
 * Writes backups/registry-<network>-<timestamp>.json. Commit it — the whole
 * point is that it outlives the chain it came from.
 *
 * Deliberately standalone: it talks to the Aptos SDK directly rather than
 * importing src/lib/files.ts, because that module's imports are extensionless
 * and don't resolve under `node --experimental-strip-types`. A disaster-recovery
 * script should not be the reason app code has to change shape.
 *
 * What this can and cannot save:
 *   - Saves every FileRecord field plus the publisher description, which is
 *     everything needed to re-register a dataset after a redeploy.
 *   - Does NOT save the bytes. Those live on Shelby and the record only carries
 *     the blob name. If Shelby's testnet is wiped too, re-registering these
 *     hashes would point at blobs that no longer resolve — the listings would
 *     come back but every download would fail verification.
 */

import { promises as fs } from "node:fs";
import path from "node:path";
import { Aptos, AptosConfig, Network } from "@aptos-labs/ts-sdk";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const network = (process.env.NETWORK ?? "testnet").toLowerCase();

const addr = process.env[`NEXT_PUBLIC_REGISTRY_ADDRESS_${network.toUpperCase()}`];
if (!addr) {
  console.error(
    `No NEXT_PUBLIC_REGISTRY_ADDRESS_${network.toUpperCase()}. Pass --env-file=.env.local.`
  );
  process.exit(1);
}

const apiKey = process.env[`NEXT_PUBLIC_APTOS_API_KEY_${network.toUpperCase()}`];
const aptos = new Aptos(
  new AptosConfig({
    network: network as Network,
    ...(apiKey ? { clientConfig: { API_KEY: apiKey } } : {}),
  })
);

const view = async (fn: string, args: unknown[] = []) =>
  aptos.view({
    payload: {
      function: `${addr}::registry::${fn}` as `${string}::${string}::${string}`,
      typeArguments: [],
      functionArguments: args as never,
    },
  });

/** content_hash comes back as a 0x hex string or a byte array, depending on node. */
function hexOf(v: unknown): string {
  if (typeof v === "string") return v.startsWith("0x") ? v.slice(2) : v;
  if (Array.isArray(v)) {
    return v.map((b) => Number(b).toString(16).padStart(2, "0")).join("");
  }
  return "";
}

console.log(`Reading ${network} registry at ${addr} …`);
const nextId = Number((await view("next_id"))[0]);
console.log(`  next_id = ${nextId}`);

const files: Record<string, unknown>[] = [];
let missing = 0;

for (let id = 0; id < nextId; id++) {
  try {
    const r = (await view("get_file", [String(id)]))[0] as Record<string, unknown>;
    // Descriptions live in a separate resource, so they need their own read.
    let description = "";
    try {
      description = String((await view("get_description", [String(id)]))[0] ?? "");
    } catch {
      // Registry predating the Descriptions resource — not an error.
    }
    files.push({
      fileId: String(r.file_id),
      uploader: String(r.uploader),
      contentHash: hexOf(r.content_hash),
      shelbyCid: String(r.shelby_cid),
      mimeType: String(r.mime_type),
      sizeBytes: Number(r.size_bytes),
      accessType: Number(r.access_type),
      priceOctas: String(r.price_octas),
      whitelist: (r.whitelist as string[]) ?? [],
      flagCount: Number(r.flag_count),
      createdAt: Number(r.created_at),
      description,
    });
    process.stdout.write(".");
  } catch {
    // get_file aborts for deleted ids. Expected while iterating 0..next_id.
    missing++;
    process.stdout.write("x");
  }
}
console.log();

const snapshot = {
  network,
  registryAddress: addr,
  capturedAt: new Date().toISOString(),
  nextId,
  fileCount: files.length,
  deletedOrMissing: missing,
  files,
};

const dir = path.join(ROOT, "backups");
await fs.mkdir(dir, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
const out = path.join(dir, `registry-${network}-${stamp}.json`);
await fs.writeFile(out, JSON.stringify(snapshot, null, 2));

console.log(`\nWrote ${path.relative(ROOT, out)}`);
console.log(`  ${files.length} datasets (${missing} deleted/unreadable ids skipped)`);
console.log(`  ${files.filter((f) => f.description).length} with descriptions`);
console.log(
  `  ${new Set(files.map((f) => f.uploader)).size} distinct publishers`
);
