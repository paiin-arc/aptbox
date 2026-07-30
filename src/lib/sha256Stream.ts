/**
 * Incremental SHA-256 (FIPS 180-4).
 *
 * Why this exists: WebCrypto's `crypto.subtle.digest` takes one contiguous
 * buffer and has no streaming API, so hashing an N-byte dataset with it costs
 * N bytes of memory. That put a hard ~2 GiB ceiling on uploads even though
 * Shelby itself has no size limit and its SDK accepts a ReadableStream.
 *
 * This lets us hash a dataset of any size in fixed memory by feeding it 64-byte
 * blocks as they stream off disk. Output is byte-identical to
 * `crypto.subtle.digest("SHA-256", ...)` — see the cross-check in
 * `scripts/verify-sha256.mjs`, which fuzzes both against each other.
 *
 * WebCrypto is still the fast path for small inputs (native, ~10x quicker);
 * `sha256Blob` picks automatically.
 */

const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1,
  0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
  0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786,
  0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147,
  0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
  0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b,
  0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a,
  0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
  0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

const BLOCK_BYTES = 64;

export class Sha256 {
  private h = new Uint32Array([
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c,
    0x1f83d9ab, 0x5be0cd19,
  ]);
  private readonly w = new Uint32Array(64);
  private readonly tail = new Uint8Array(BLOCK_BYTES);
  private tailLen = 0;
  /** Total message length in bytes. Number is exact to 2^53 — 8 PiB of input. */
  private totalBytes = 0;
  private finalized = false;

  update(data: Uint8Array): this {
    if (this.finalized) throw new Error("Sha256: update() after digest()");
    this.totalBytes += data.length;
    let offset = 0;

    // Top up a partial block held from the previous update.
    if (this.tailLen > 0) {
      const take = Math.min(BLOCK_BYTES - this.tailLen, data.length);
      this.tail.set(data.subarray(0, take), this.tailLen);
      this.tailLen += take;
      offset = take;
      if (this.tailLen < BLOCK_BYTES) return this;
      this.compress(this.tail, 0);
      this.tailLen = 0;
    }

    // Consume whole blocks straight out of the caller's buffer.
    while (offset + BLOCK_BYTES <= data.length) {
      this.compress(data, offset);
      offset += BLOCK_BYTES;
    }

    // Stash the remainder for next time.
    if (offset < data.length) {
      this.tailLen = data.length - offset;
      this.tail.set(data.subarray(offset), 0);
    }
    return this;
  }

  digest(): Uint8Array {
    if (this.finalized) throw new Error("Sha256: digest() called twice");
    const bitLength = this.totalBytes * 8;

    // Pad to 56 mod 64, then append the 64-bit big-endian bit length.
    const padLen = this.tailLen < 56 ? 56 - this.tailLen : 120 - this.tailLen;
    const pad = new Uint8Array(padLen + 8);
    pad[0] = 0x80;
    const view = new DataView(pad.buffer);
    view.setUint32(padLen, Math.floor(bitLength / 0x1_0000_0000));
    view.setUint32(padLen + 4, bitLength % 0x1_0000_0000);
    this.update(pad);

    this.finalized = true;
    const out = new Uint8Array(32);
    const outView = new DataView(out.buffer);
    for (let i = 0; i < 8; i++) outView.setUint32(i * 4, this.h[i]);
    return out;
  }

  hex(): string {
    return bytesToHex(this.digest());
  }

  private compress(block: Uint8Array, offset: number): void {
    const w = this.w;

    for (let i = 0; i < 16; i++) {
      const j = offset + i * 4;
      w[i] =
        (block[j] << 24) | (block[j + 1] << 16) | (block[j + 2] << 8) | block[j + 3];
    }
    for (let i = 16; i < 64; i++) {
      const x = w[i - 15];
      const y = w[i - 2];
      const s0 = ((x >>> 7) | (x << 25)) ^ ((x >>> 18) | (x << 14)) ^ (x >>> 3);
      const s1 = ((y >>> 17) | (y << 15)) ^ ((y >>> 19) | (y << 13)) ^ (y >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0;
    }

    const h = this.h;
    let a = h[0];
    let b = h[1];
    let c = h[2];
    let d = h[3];
    let e = h[4];
    let f = h[5];
    let g = h[6];
    let hh = h[7];

    for (let i = 0; i < 64; i++) {
      const S1 =
        ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7));
      const ch = (e & f) ^ (~e & g);
      const t1 = (hh + S1 + ch + K[i] + w[i]) | 0;
      const S0 =
        ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10));
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (S0 + maj) | 0;

      hh = g;
      g = f;
      f = e;
      e = (d + t1) | 0;
      d = c;
      c = b;
      b = a;
      a = (t1 + t2) | 0;
    }

    h[0] = (h[0] + a) | 0;
    h[1] = (h[1] + b) | 0;
    h[2] = (h[2] + c) | 0;
    h[3] = (h[3] + d) | 0;
    h[4] = (h[4] + e) | 0;
    h[5] = (h[5] + f) | 0;
    h[6] = (h[6] + g) | 0;
    h[7] = (h[7] + hh) | 0;
  }
}

export function bytesToHex(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; i++) {
    out += bytes[i].toString(16).padStart(2, "0");
  }
  return out;
}

/**
 * Above this we stream instead of buffering. Chosen well under the ~2 GiB
 * single-ArrayBuffer engine ceiling so the native path is only used where it's
 * comfortably safe.
 */
export const WEBCRYPTO_MAX_BYTES = 64 * 1024 * 1024;

export type HashProgress = { hashedBytes: number; totalBytes: number };

/** Hash a ReadableStream in fixed memory. */
export async function sha256Stream(
  stream: ReadableStream<Uint8Array>,
  opts?: { totalBytes?: number; onProgress?: (p: HashProgress) => void }
): Promise<{ bytes: Uint8Array; hex: string }> {
  const hasher = new Sha256();
  const reader = stream.getReader();
  let hashed = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      hasher.update(value);
      hashed += value.length;
      opts?.onProgress?.({ hashedBytes: hashed, totalBytes: opts.totalBytes ?? 0 });
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = hasher.digest();
  return { bytes, hex: bytesToHex(bytes) };
}

/**
 * Hash a Blob/File. Uses native WebCrypto for small inputs and the streaming
 * implementation above for anything large enough that buffering it would be
 * reckless. Both produce identical digests.
 */
export async function sha256Blob(
  blob: Blob,
  onProgress?: (p: HashProgress) => void
): Promise<{ bytes: Uint8Array; hex: string }> {
  if (blob.size <= WEBCRYPTO_MAX_BYTES) {
    const buf = await blob.arrayBuffer();
    const digest = await crypto.subtle.digest("SHA-256", buf);
    const bytes = new Uint8Array(digest);
    onProgress?.({ hashedBytes: blob.size, totalBytes: blob.size });
    return { bytes, hex: bytesToHex(bytes) };
  }
  return sha256Stream(blob.stream(), { totalBytes: blob.size, onProgress });
}
