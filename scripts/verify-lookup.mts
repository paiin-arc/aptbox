/**
 * Correctness gate for the Dataset Verifier's matching logic.
 *
 * The verdicts drive what a user is told about a file they were handed, so a
 * wrong classification here is worse than no feature: "conflict" misread as
 * "authentic" would launder a tampered dataset.
 *
 * Run: node --experimental-strip-types scripts/verify-lookup.mts
 */
import {
  buildVerifyReport,
  normalizeNameForCompare,
  registryFileName,
} from "../src/lib/verifyLookup.ts";
import type { FileMeta } from "../src/lib/files.ts";

let failures = 0;
function check(label: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures++;
  console.log(`${ok ? "pass" : "FAIL"}  ${label}`);
  if (!ok) console.log(`        expected ${expected}, got ${actual}`);
}

const HASH_A = "a".repeat(64);
const HASH_B = "b".repeat(64);

function entry(id: string, hash: string, name: string): FileMeta {
  return {
    fileId: id,
    uploader: "0xdead",
    contentHash: hash,
    shelbyCid: `aptbox/${hash.slice(0, 16)}-${name}`,
    mimeType: "application/zip",
    sizeBytes: 100,
    accessType: 0,
    priceOctas: 0n,
    whitelist: [],
    flagCount: 0,
    createdAt: 0,
  };
}

const report = (hash: string, name: string, files: FileMeta[]) =>
  buildVerifyReport({ hashHex: hash, fileName: name, sizeBytes: 100, files });

console.log("\n-- filename round-trip --");
check("name survives the cid", registryFileName("aptbox/abcdef0123456789-train.zip"), "train.zip");
check("name containing dashes", registryFileName("aptbox/abcdef0123456789-my-train-set.zip"), "my-train-set.zip");
check("sanitisation mirrors blobNameFor", normalizeNameForCompare("my report.csv"), "my_report.csv");
check("case-insensitive compare", normalizeNameForCompare("Train.ZIP"), "train.zip");

console.log("\n-- verdicts --");
const registry = [
  entry("1", HASH_A, "train.zip"),
  entry("2", HASH_B, "other.zip"),
];

check("exact hash + name", report(HASH_A, "train.zip", registry).verdict, "authentic");
check("hash matches, name differs", report(HASH_A, "renamed.zip", registry).verdict, "renamed");
check("name matches, hash differs", report(HASH_B, "train.zip", registry).verdict, "conflict");
check("neither matches", report("c".repeat(64), "nothing.zip", registry).verdict, "unknown");
check("empty registry", report(HASH_A, "train.zip", []).verdict, "unknown");

console.log("\n-- the tampering case in detail --");
const tampered = report(HASH_B, "train.zip", registry);
check("flags the legitimate entry", tampered.sameName.map((f) => f.fileId), ["1"]);
check("does not claim authenticity", tampered.exact.length, 0);
check("scanned count reported", tampered.scanned, 2);

console.log("\n-- 0x-prefixed on-chain hashes still match --");
const prefixed = [entry("3", HASH_A, "train.zip")];
prefixed[0].contentHash = "0x" + HASH_A;
check("0x prefix normalised", report(HASH_A, "train.zip", prefixed).verdict, "authentic");

console.log("\n-- precedence when several conditions hold at once --");
// Bytes registered as other.zip, arriving named train.zip, while a different
// dataset legitimately owns train.zip. Both "renamed" and "conflict" are true;
// conflict must win or a masquerade reads as a harmless rename.
const masquerade = report(HASH_B, "train.zip", registry);
check("name collision outranks matching bytes", masquerade.verdict, "conflict");
check("  ...but the renamed match is still reported", masquerade.sameBytes.map((f) => f.fileId), ["2"]);

// An exact match alongside an impostor sharing the filename.
const withImpostor = [
  entry("1", HASH_A, "train.zip"),
  entry("9", "f".repeat(64), "train.zip"),
];
const authentic = report(HASH_A, "train.zip", withImpostor);
check("exact match still wins", authentic.verdict, "authentic");
check("  ...and the impostor is surfaced", authentic.sameName.map((f) => f.fileId), ["9"]);

console.log("\n-- multiple conflicts are all reported --");
const many = [
  entry("1", HASH_A, "train.zip"),
  entry("2", "c".repeat(64), "train.zip"),
  entry("3", "d".repeat(64), "train.zip"),
];
check("three entries share the name", report("e".repeat(64), "train.zip", many).sameName.length, 3);

console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`}\n`);
process.exit(failures === 0 ? 0 : 1);
