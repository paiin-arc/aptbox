/**
 * Proves the tamper path on a real dataset from the live registry.
 *
 * Uses the app's actual verifyDatasetIntegrity — not a reimplementation — on
 * bytes fetched from Shelby, then on the same bytes with one byte flipped.
 *
 * Run: node --experimental-strip-types scripts/demo-tamper.mts <fileId>
 */
import { verifyDatasetIntegrity } from "../src/lib/verify.ts";

const APTOS = "https://api.testnet.aptoslabs.com/v1/view";
const REGISTRY =
  "0x6e5c78b1b9fd0c729cc525529f012227bf3e0b4aff7f8af93539dd186668ec25";
const GATEWAY = "https://api.testnet.shelby.xyz/shelby/v1/blobs";

const fileId = process.argv[2] ?? "26";

const meta = await (
  await fetch(APTOS, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      function: `${REGISTRY}::registry::get_file`,
      type_arguments: [],
      arguments: [fileId],
    }),
  })
).json();

const rec = meta[0];
console.log(`dataset #${rec.file_id}  ${rec.size_bytes} bytes`);
console.log(`on-chain hash : ${rec.content_hash}\n`);

const url = `${GATEWAY}/${rec.uploader}/${rec.shelby_cid
  .split("/")
  .map(encodeURIComponent)
  .join("/")}`;
const bytes = new Uint8Array(await (await fetch(url)).arrayBuffer());
console.log(`fetched ${bytes.length} bytes from Shelby\n`);

// 1. Untouched — what every visitor gets today.
const clean = await verifyDatasetIntegrity(bytes, rec.content_hash);
console.log(`untouched bytes      -> ${clean.status.toUpperCase()}`);

// 2. One byte flipped, as if the gateway served altered data.
const tampered = new Uint8Array(bytes);
const at = Math.floor(tampered.length / 2);
const before = tampered[at];
tampered[at] ^= 0x01;
const bad = await verifyDatasetIntegrity(tampered, rec.content_hash);
console.log(`byte ${at} ${before} -> ${tampered[at]}  -> ${bad.status.toUpperCase()}`);
console.log(`   expected ${bad.expected.slice(0, 24)}…`);
console.log(`   actual   ${bad.actual.slice(0, 24)}…`);

// 3. Truncated by a single byte.
const cut = await verifyDatasetIntegrity(bytes.slice(0, -1), rec.content_hash);
console.log(`one byte truncated   -> ${cut.status.toUpperCase()}`);

const pass =
  clean.status === "verified" &&
  bad.status === "tampered" &&
  cut.status === "tampered";
console.log(`\n${pass ? "PASS — the UI would block 2 of these 3" : "FAIL"}`);
process.exit(pass ? 0 : 1);
