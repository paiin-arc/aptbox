# Shelby App Submission — copy/paste per field

---

## App name

AI Dataset Locker

---

## Category

Pick **Data / Storage** or **Developer Tools** if offered. If the list is
consumer-oriented, **AI** is the next best fit.

---

## Live app (https)

https://aptbox.vercel.app

## Repository

https://github.com/paiin-arc/aptbox

## Aptos address (optional)

0x6e5c78b1b9fd0c729cc525529f012227bf3e0b4aff7f8af93539dd186668ec25

*(the registry Move module on Aptos testnet; shelbynet is
`0x2251165b1dd4124e02304bd781779070e87af21aa86f69c1f6d452d4d8bd2e5c`)*

---

## Describe your final application (max 5000)

**AI Dataset Locker — verifiable storage for AI training datasets.**

**The problem.** Training data moves through Drive links, S3 buckets and zip
files. All of them answer "where do I download it". None answer "is this the
same data the paper used". A folder gets re-uploaded with 300 rows removed, a
bucket is regenerated with different preprocessing, an archive picks up a
corrupted file in transit — the link still works, the filename is unchanged, and
the model trains on something other than what everyone believes it trained on.

**What it does.** Upload a dataset. The browser streams it through SHA-256,
stores the bytes on Shelby, and commits the hash to an Aptos Move registry
through the uploader's own signed transaction — before the data is retrievable
by anyone. Every download then re-hashes the bytes actually received and
compares them against that commitment. A mismatch blocks preview and download
behind an explicit warning, showing both digests side by side so the reader can
confirm the mismatch rather than trusting a badge.

The ordering is what makes it meaningful. A checksum published next to a file
proves nothing, because whoever serves the bytes can serve a matching checksum.
Ours lives in an immutable Move resource written before distribution, by a key
the storage layer doesn't hold — so there is no point at which altered bytes and
a matching commitment can both exist.

**What's built — all live:**

- `/upload` — stream-hash, erasure-code, store on Shelby, commit on Aptos
- `/f/[id]` — share page; verifies integrity before exposing any bytes
- `/verify` — drop any file and check it against the registry, no wallet
  required. Beyond an exact match it flags a dataset published under the *same
  filename with different bytes* — the case a single hash comparison can't catch
- `/marketplace` — public catalogue with filters, search, and publisher views
  keyed by wallet address
- `/docs` — how verification works, and honestly what it does not cover
- `/cleanup` — reclaim ShelbyUSD from uploads that registered on-chain but whose
  bytes never finalised

A Move registry is deployed on both Aptos testnet and shelbynet. It was upgraded
in place to add publisher descriptions via a new resource rather than a new field,
so every previously registered dataset kept working.

**No size limit.** Nothing is buffered. Hashing, erasure coding and upload each
take a fresh stream, so peak memory is a flat ~26 MB whether the dataset is one
kilobyte or one terabyte. This needed a streaming SHA-256 implementation, because
WebCrypto's `subtle.digest` has no streaming API and would have capped uploads
around 2 GiB on its own.

**Ownership.** Buying a dataset grants access, never authorship. The contract has
no ownership-transfer function at all, and `delete_file` asserts the original
uploader. Verified against the strongest attacker available: setting a
description on someone else's dataset *from the account that deployed the
contract* aborts with `E_NOT_OWNER`.

**Correctness gates** (`npm run verify`):

- streaming SHA-256 vs FIPS 180-4 known-answer vectors, padding boundaries, and
  300 randomised differential comparisons against WebCrypto
- streamed erasure commitments proven byte-identical to buffered ones, including
  at chunkset boundaries
- verifier verdict logic, including precedence when several conditions hold
- a live tamper test that fetches a real dataset from Shelby, flips one byte, and
  confirms detection

**Current state:** 19 datasets, 49.8 MB, 4 publisher wallets on testnet.

**Honest limits.** Shelby stores blobs publicly, so paid and restricted datasets
are gated in this UI but their bytes stay retrievable by anyone who reads the
account and blob name from the registry. The app says exactly that at the point
of purchase rather than implying an exclusivity it cannot deliver. Client-side
encryption is the fix, is designed, and is not shipped. Storage is also a lease —
blobs expire, and the app warns before selling access to data that expires soon.

---

## Describe how your app uses Shelby storage (max 2000)

Shelby is the storage layer, used through `@shelby-protocol/sdk` directly rather
than the S3 gateway.

**Upload.** `generateCommitments` erasure-codes the dataset into 10 MiB chunksets
(ClayCode 16/10 — any 10 of 16 shards rebuild one). `createRegisterBlobPayload`
builds the `register_blob` transaction the user's wallet signs. `putBlob` then
uploads the bytes as 5 MiB multipart chunks.

Both `generateCommitments` and `putBlob` are handed a `ReadableStream` from
`Blob.stream()` rather than a `Uint8Array`, so the dataset is never materialised
in memory — that is what removes the size ceiling. Verified against the SDK
rather than assumed: neither has a chunkset or part-count cap.

**Read.** `getBlob` for verification and preview; the public gateway URL for
datasets too large for the browser to hold, which it streams to disk.

**Lifecycle.** The blob indexer supplies `expiration` and `is_written`, driving
expiry countdowns, a "storage providers finalising" state while a fresh upload
propagates, and `/cleanup` for blobs that registered on-chain but never finalised.

**What we add.** Reading the SDK closely turned up the thing this project rests
on: `getBlob`'s client-side check compares `bytesReceived` against the
content-length header and nothing else. That catches a truncated transfer, not an
alteration that preserves length. Shelby's guarantees are durability and
retrievability; end-to-end verification is left to the caller. Our SHA-256
commitment fills exactly that gap — demonstrated by flipping one byte of a
196,882-byte dataset: identical length, completely different digest, caught.

**Version.** Pinned to sdk 0.3.1 deliberately. 0.4.1 removes the v1 upload
endpoint, and its v2 chunkset flow has no wallet-adapter path yet — react 3.0.1
throws on a wallet signer, and `putBlobChunksets` signs its auth challenge
synchronously from a private key a browser wallet never exposes.

---

## Links (one per line)

https://aptbox.vercel.app/docs
https://aptbox.vercel.app/verify
https://aptbox.vercel.app/marketplace
https://explorer.aptoslabs.com/account/0x6e5c78b1b9fd0c729cc525529f012227bf3e0b4aff7f8af93539dd186668ec25/modules?network=testnet

---

## Roadmap

**Shipped**
- Streaming SHA-256 committed on-chain before distribution
- Verification enforced on every download; mismatch blocks the bytes
- No upload size limit — flat ~26 MB peak memory at any size
- `/verify` — check any file against the registry, no wallet
- Marketplace with wallet-as-publisher-identity and on-chain descriptions
- Move registry live on Aptos testnet and shelbynet
- Four correctness gates, including a live tamper test

**Next**
- Client-side AES-GCM encryption so paid and restricted actually withhold bytes
- Key release to receipt holders — the real problem, and the reason encryption
  isn't shipped yet
- Migrate to Shelby SDK 0.4.x once wallet-adapter uploads return, then declare
  encrypted blobs on-chain with the new `AES_GCM_V1` label

**Later**
- Registry-wide audit: re-fetch every dataset and re-verify against its
  commitment, reporting verified / tampered / bytes missing / expired
- Hash index in Move (`Table<hash, file_id>`) so lookup stops being O(n) view
  calls beyond a few hundred datasets
- Renewal flow before expiry, so a purchased dataset can't quietly vanish
- Multi-location writes, once Shelby's named locations are usable

---

## Demo video

Not recorded yet. Suggested 90 seconds:

1. `/upload` a dataset — hash, two signatures, stored
2. `/f/[id]` — green "Integrity verified", both hashes shown
3. `/verify` — drop the same file → authentic; rename an edited copy to the
   original's filename → red conflict
4. `/marketplace` — publisher view, paid listing with description and no preview
5. Terminal: `npm run verify:tamper` — one byte flipped, detected
