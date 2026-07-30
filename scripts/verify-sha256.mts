/**
 * Correctness gate for src/lib/sha256Stream.ts.
 *
 * The streaming digest replaces WebCrypto on the upload path, so if it were
 * wrong every dataset would get a bad on-chain commitment and every download
 * would report tampering. This checks it three ways:
 *
 *   1. FIPS 180-4 / NIST published known-answer vectors
 *   2. Differential fuzz against crypto.subtle.digest on random sizes
 *   3. Chunk-boundary cases — the padding and carry-over logic is where a
 *      hand-written SHA-256 actually breaks (55/56/57, 63/64/65, 119/120/121)
 *
 * Run: node --experimental-strip-types scripts/verify-sha256.mts
 */

import { Sha256, bytesToHex, sha256Stream } from "../src/lib/sha256Stream.ts";

let failures = 0;

function check(label: string, actual: string, expected: string) {
  const ok = actual === expected;
  if (!ok) failures++;
  console.log(`${ok ? "pass" : "FAIL"}  ${label}`);
  if (!ok) console.log(`        expected ${expected}\n        actual   ${actual}`);
}

async function webcrypto(bytes: Uint8Array): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", bytes.slice().buffer);
  return bytesToHex(new Uint8Array(d));
}

function oneShot(bytes: Uint8Array): string {
  return new Sha256().update(bytes).hex();
}

const enc = new TextEncoder();

/* ---------- 1. Published known-answer vectors ---------- */
console.log("\n-- NIST / FIPS 180-4 known-answer vectors --");
check(
  'empty string',
  oneShot(new Uint8Array(0)),
  "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
);
check(
  '"abc"',
  oneShot(enc.encode("abc")),
  "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
);
check(
  '448-bit multi-block vector',
  oneShot(enc.encode("abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq")),
  "248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1"
);
check(
  '896-bit two-block vector',
  oneShot(
    enc.encode(
      "abcdefghbcdefghicdefghijdefghijkefghijklfghijklmghijklmnhijklmnoijklmnopjklmnopqklmnopqrlmnopqrsmnopqrstnopqrstu"
    )
  ),
  "cf5b16a778af8380036ce59e7b0492370b249b11e8f07a51afac45037afee9d1"
);
check(
  '1,000,000 x "a"',
  oneShot(new Uint8Array(1_000_000).fill(0x61)),
  "cdc76e5c9914fb9281a1c7e284d73e67f1809a48a497200e046d39ccc7112cd0"
);

/* ---------- 2. Chunk-boundary cases ---------- */
console.log("\n-- block/padding boundaries (vs WebCrypto) --");
for (const n of [0, 1, 54, 55, 56, 57, 63, 64, 65, 119, 120, 121, 127, 128, 129]) {
  const bytes = new Uint8Array(n);
  for (let i = 0; i < n; i++) bytes[i] = (i * 31 + 7) & 0xff;
  check(`length ${n}`, oneShot(bytes), await webcrypto(bytes));
}

/* ---------- 3. Differential fuzz + split-update equivalence ---------- */
console.log("\n-- differential fuzz vs WebCrypto (random sizes + random splits) --");
let fuzzFail = 0;
for (let trial = 0; trial < 300; trial++) {
  const n = Math.floor(Math.random() * 5000);
  const bytes = new Uint8Array(n);
  crypto.getRandomValues(bytes);
  const expected = await webcrypto(bytes);

  if (oneShot(bytes) !== expected) fuzzFail++;

  // Same bytes fed in random-sized pieces must give the same digest — this is
  // what actually exercises the carry-over buffer.
  const h = new Sha256();
  let off = 0;
  while (off < n) {
    const take = Math.min(n - off, 1 + Math.floor(Math.random() * 200));
    h.update(bytes.subarray(off, off + take));
    off += take;
  }
  if (h.hex() !== expected) fuzzFail++;
}
check(`300 random inputs, one-shot + split-update`, String(fuzzFail), "0");

/* ---------- 4. sha256Stream over a real ReadableStream ---------- */
console.log("\n-- sha256Stream (ReadableStream path) --");
const payload = new Uint8Array(300_000);
// getRandomValues caps at 65,536 bytes per call, so fill in slices.
for (let off = 0; off < payload.length; off += 65_536) {
  crypto.getRandomValues(payload.subarray(off, Math.min(off + 65_536, payload.length)));
}
const expectedStream = await webcrypto(payload);

function streamOf(bytes: Uint8Array, chunk: number): ReadableStream<Uint8Array> {
  let off = 0;
  return new ReadableStream({
    pull(c) {
      if (off >= bytes.length) return void c.close();
      c.enqueue(bytes.subarray(off, Math.min(off + chunk, bytes.length)));
      off += chunk;
    },
  });
}

for (const chunk of [1, 63, 64, 65, 1024, 65536]) {
  const { hex } = await sha256Stream(streamOf(payload, chunk), {
    totalBytes: payload.length,
  });
  check(`streamed in ${chunk}-byte chunks`, hex, expectedStream);
}

// Progress must report every byte exactly once.
let lastHashed = 0;
await sha256Stream(streamOf(payload, 4096), {
  totalBytes: payload.length,
  onProgress: (p) => {
    lastHashed = p.hashedBytes;
  },
});
check("progress total", String(lastHashed), String(payload.length));

/* ---------- 5. Misuse guards ---------- */
console.log("\n-- misuse guards --");
const g = new Sha256();
g.update(enc.encode("x"));
g.digest();
let threwOnDoubleDigest = false;
try {
  g.digest();
} catch {
  threwOnDoubleDigest = true;
}
check("digest() twice throws", String(threwOnDoubleDigest), "true");

let threwOnLateUpdate = false;
try {
  g.update(enc.encode("y"));
} catch {
  threwOnLateUpdate = true;
}
check("update() after digest throws", String(threwOnLateUpdate), "true");

console.log(
  `\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`}\n`
);
process.exit(failures === 0 ? 0 : 1);
