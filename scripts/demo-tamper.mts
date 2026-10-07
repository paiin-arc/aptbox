/**
 * Proves the tamper path on a real dataset from the live registry.
 *
 * Uses the app's actual verifyDatasetIntegrity — not a reimplementation — on
 * bytes fetched from Shelby, then on the same bytes with one byte flipped.
 *
 * Run: node --experimental-strip-types scripts/demo-tamper.mts <fileId>
 */
import { verifyDatasetIntegrity } from "../src/lib/verify.ts";

// Shelbynet: the only network the app supports since Shelby retired testnet.
const APTOS = "https://api.shelbynet.shelby.xyz/v1/view";
const REGISTRY =
  process.env.NEXT_PUBLIC_REGISTRY_ADDRESS_SHELBYNET ||
  "0x2251165b1dd4124e02304bd781779070e87af21aa86f69c1f6d452d4d8bd2e5c";
const GATEWAY = "https://api.shelbynet.shelby.xyz/shelby/v1/blobs";
/** AES-GCM framing the app adds: 12-byte IV prefix + 16-byte auth tag. */
const AES_GCM_OVERHEAD = 28;

// Default must be a public, unencrypted dataset whose bytes are still stored.
const fileId = process.argv[2] ?? "0";

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
const res = await fetch(url);
if (!res.ok) {
  // Without this the error body gets hashed as if it were the dataset, and the
  // untouched case reports TAMPERED — a false positive that looks like the tool
  // working when it is actually broken.
  console.log(
    `\nBYTES UNAVAILABLE — gateway returned ${res.status}. Shelby storage is a` +
      ` lease and this blob has expired or been evicted.\n` +
      `Pick a dataset whose bytes are still stored:\n` +
      `  npm run verify:tamper <fileId>\n`
  );
  process.exit(2);
}
const bytes = new Uint8Array(await res.arrayBuffer());

// Guard against a short read, or ciphertext, masquerading as tampering.
const expected = Number(rec.size_bytes);
if (bytes.length === expected + AES_GCM_OVERHEAD) {
  console.log(
    `\nENCRYPTED DATASET — Shelby holds ${bytes.length} bytes of AES-GCM ciphertext` +
      ` for a ${expected}-byte original. The commitment is over the plaintext, so` +
      ` hashing ciphertext would falsely report TAMPERED. Pick an unencrypted dataset:\n` +
      `  npm run verify:tamper <fileId>\n`
  );
  process.exit(2);
}
if (bytes.length !== expected) {
  console.log(
    `\nSHORT READ — got ${bytes.length} bytes, chain says ${expected}. ` +
      `Not a tamper result; the transfer was incomplete.\n`
  );
  process.exit(2);
}
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
