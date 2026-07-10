/**
 * AES-256-GCM client-side encryption — the envelope around private files on
 * Shelby. Uses the browser's WebCrypto SubtleCrypto API: no external deps,
 * runs on every modern browser including mobile.
 *
 * Envelope format (binary, big-endian):
 *
 *   ┌──────────┬───────────┬───────────────────────────────────────────────┐
 *   │ MAGIC 4B │ NONCE 12B │ CIPHERTEXT (file bytes + 16B GCM auth tag)    │
 *   └──────────┴───────────┴───────────────────────────────────────────────┘
 *
 *   MAGIC = "APBX" (0x41 0x50 0x42 0x58) — quick sanity check that bytes
 *           pulled from Shelby are actually an aptbox-encrypted envelope
 *           rather than a plain blob.
 *
 *   NONCE = 96-bit random IV (NIST-recommended size for GCM). MUST be unique
 *           per (key, plaintext) pair. We generate a fresh nonce every
 *           encryption, including re-encryption of the same plaintext.
 *
 * The data key itself is NOT inside the envelope — it lives on Story Protocol
 * as part of a CDR object's access policy. See `lib/cdr.ts` (TBD) for that.
 *
 * Why GCM and not CBC + HMAC?
 *   - GCM is authenticated encryption (AEAD) in one pass. CBC + HMAC requires
 *     manually chaining, easier to misuse.
 *   - GCM ciphertext = plaintext length + 16-byte tag. Predictable size.
 *   - WebCrypto natively supports AES-GCM; CBC needs separate HMAC for
 *     integrity, more code and easier to get wrong.
 */

const MAGIC = new Uint8Array([0x41, 0x50, 0x42, 0x58]); // "APBX"
const MAGIC_LEN = MAGIC.length;
const NONCE_LEN = 12; // 96-bit IV, GCM standard
const KEY_LEN_BITS = 256;

/**
 * Copy bytes into a fresh `ArrayBuffer` (not `ArrayBufferLike` / SharedArrayBuffer).
 * Needed because the TS 5.7+ Uint8Array generic shape isn't directly assignable
 * to WebCrypto's `BufferSource = ArrayBufferView<ArrayBuffer>` requirement.
 */
function toBuf(u: Uint8Array): ArrayBuffer {
  const buf = new ArrayBuffer(u.byteLength);
  new Uint8Array(buf).set(u);
  return buf;
}

/** Result of an encryption: the on-the-wire envelope + the raw key bytes. */
export type EncryptResult = {
  /** Bytes to upload to Shelby. Includes magic + nonce + ciphertext+tag. */
  envelope: Uint8Array;
  /** Raw 32-byte key (caller's responsibility to seal via CDR). */
  keyBytes: Uint8Array;
  /** Hex-encoded copy of the key — handy for logging / debugging. */
  keyHex: string;
};

/** Generate a fresh AES-256 key — return raw bytes the caller can wrap. */
export async function generateDataKey(): Promise<Uint8Array> {
  const key = await crypto.subtle.generateKey(
    { name: "AES-GCM", length: KEY_LEN_BITS },
    true, // extractable: we need to seal it via CDR
    ["encrypt", "decrypt"]
  );
  const raw = await crypto.subtle.exportKey("raw", key);
  return new Uint8Array(raw);
}

/**
 * Encrypt plaintext with a fresh data key. Returns the envelope to store on
 * Shelby plus the data key bytes the caller MUST persist (typically by sealing
 * into a CDR access-policy object on Story).
 */
export async function encryptBytes(
  plaintext: Uint8Array
): Promise<EncryptResult> {
  const keyBytes = await generateDataKey();
  const key = await crypto.subtle.importKey(
    "raw",
    toBuf(keyBytes),
    { name: "AES-GCM" },
    false,
    ["encrypt"]
  );
  const nonce = crypto.getRandomValues(new Uint8Array(NONCE_LEN));
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: "AES-GCM", iv: toBuf(nonce) },
      key,
      toBuf(plaintext)
    )
  );

  const envelope = new Uint8Array(MAGIC_LEN + NONCE_LEN + ciphertext.length);
  envelope.set(MAGIC, 0);
  envelope.set(nonce, MAGIC_LEN);
  envelope.set(ciphertext, MAGIC_LEN + NONCE_LEN);

  return {
    envelope,
    keyBytes,
    keyHex: bytesToHex(keyBytes),
  };
}

/**
 * Decrypt an aptbox-encrypted envelope using a previously-issued data key.
 * Throws if magic mismatch or if AES-GCM tag verification fails (tampering).
 */
export async function decryptEnvelope(
  envelope: Uint8Array,
  keyBytes: Uint8Array
): Promise<Uint8Array> {
  if (envelope.length < MAGIC_LEN + NONCE_LEN + 16) {
    throw new Error(
      "Envelope too short: must be at least magic (4) + nonce (12) + gcm tag (16) bytes."
    );
  }
  // Magic check
  for (let i = 0; i < MAGIC_LEN; i++) {
    if (envelope[i] !== MAGIC[i]) {
      throw new Error(
        "Not an aptbox-encrypted envelope (magic mismatch). Refusing to decrypt."
      );
    }
  }
  if (keyBytes.length !== KEY_LEN_BITS / 8) {
    throw new Error(
      `Key must be ${KEY_LEN_BITS / 8} bytes; got ${keyBytes.length}.`
    );
  }

  const nonce = envelope.subarray(MAGIC_LEN, MAGIC_LEN + NONCE_LEN);
  const ciphertext = envelope.subarray(MAGIC_LEN + NONCE_LEN);

  const key = await crypto.subtle.importKey(
    "raw",
    toBuf(keyBytes),
    { name: "AES-GCM" },
    false,
    ["decrypt"]
  );

  const plaintextBuf = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: toBuf(nonce) },
    key,
    toBuf(ciphertext)
  );

  return new Uint8Array(plaintextBuf);
}

/** True if the bytes start with the aptbox encryption magic. */
export function isAptboxEnvelope(bytes: Uint8Array): boolean {
  if (bytes.length < MAGIC_LEN) return false;
  for (let i = 0; i < MAGIC_LEN; i++) {
    if (bytes[i] !== MAGIC[i]) return false;
  }
  return true;
}

/* ---------- Hex helpers (no Buffer / Node dep — runs in browser) ---------- */

export function bytesToHex(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; i++) {
    out += bytes[i].toString(16).padStart(2, "0");
  }
  return out;
}

export function hexToBytes(hex: string): Uint8Array {
  const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
  if (clean.length % 2 !== 0) {
    throw new Error("Hex string must have even length.");
  }
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(clean.substr(i * 2, 2), 16);
  }
  return out;
}
