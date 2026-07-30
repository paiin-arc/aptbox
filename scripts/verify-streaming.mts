/**
 * Proves the streaming upload path is equivalent to the old buffered one.
 *
 * The upload now hands `generateCommitments` a ReadableStream instead of a
 * Uint8Array. If that changed the commitments in any way — merkle root, raw
 * size, chunkset count — every blob would register on-chain with the wrong
 * root and Shelby would reject or mis-serve it. So check they match exactly,
 * including at chunkset boundaries where the split logic is easiest to break.
 *
 * Run: node --experimental-strip-types scripts/verify-streaming.mts
 */

import {
  createDefaultErasureCodingProvider,
  generateCommitments,
} from "@shelby-protocol/sdk/node";

const provider = await createDefaultErasureCodingProvider();
const CHUNKSET = provider.config.erasure_k * provider.config.chunkSizeBytes;

console.log(
  `scheme enumIndex=${provider.config.enumIndex} n=${provider.config.erasure_n} ` +
    `k=${provider.config.erasure_k} chunk=${provider.config.chunkSizeBytes}B ` +
    `chunkset=${CHUNKSET}B (${CHUNKSET / 1024 / 1024} MiB)\n`
);

function randomBytes(n: number): Uint8Array {
  const out = new Uint8Array(n);
  for (let off = 0; off < n; off += 65_536) {
    crypto.getRandomValues(out.subarray(off, Math.min(off + 65_536, n)));
  }
  return out;
}

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

let failures = 0;

function summarize(c: Awaited<ReturnType<typeof generateCommitments>>) {
  return JSON.stringify({
    root: c.blob_merkle_root,
    rawSize: c.raw_data_size,
    chunksets: c.chunkset_commitments.length,
    schema: c.schema_version,
  });
}

const cases: [string, number][] = [
  ["1 KiB", 1024],
  ["1 MiB (one chunk)", 1024 * 1024],
  ["chunkset - 1", CHUNKSET - 1],
  ["chunkset exactly", CHUNKSET],
  ["chunkset + 1", CHUNKSET + 1],
  ["2.5 chunksets", Math.floor(CHUNKSET * 2.5)],
  ["3 chunksets exactly", CHUNKSET * 3],
];

for (const [label, size] of cases) {
  const bytes = randomBytes(size);

  const buffered = await generateCommitments(provider, bytes);
  // Vary the stream chunking so we're not accidentally feeding it perfectly
  // chunkset-aligned reads, which is the easy case.
  const streamedAligned = await generateCommitments(provider, streamOf(bytes, CHUNKSET));
  const streamedRagged = await generateCommitments(provider, streamOf(bytes, 7919));

  const a = summarize(buffered);
  const b = summarize(streamedAligned);
  const c = summarize(streamedRagged);

  const ok = a === b && a === c;
  if (!ok) failures++;
  console.log(
    `${ok ? "pass" : "FAIL"}  ${label.padEnd(20)} ${size} B → ` +
      `${buffered.chunkset_commitments.length} chunkset(s), root ${buffered.blob_merkle_root.slice(0, 18)}…`
  );
  if (!ok) {
    console.log(`        buffered        ${a}`);
    console.log(`        streamed(align) ${b}`);
    console.log(`        streamed(ragged)${c}`);
  }
}

console.log(
  `\n${failures === 0 ? "STREAMING MATCHES BUFFERED — ALL CASES PASSED" : `${failures} CASE(S) FAILED`}\n`
);
process.exit(failures === 0 ? 0 : 1);
