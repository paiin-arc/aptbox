# AI Dataset Locker

Verifiable storage for AI training datasets, built on [Shelby](https://shelby.xyz) and [Aptos](https://aptosfoundation.org).

Training data usually travels as a Google Drive link or a zip file passed around in chat. Nobody downstream can tell whether the dataset they received is the original or a modified copy. The Dataset Locker fixes that: it stores the dataset on Shelby's decentralized object storage and commits its SHA-256 to an Aptos Move registry, so any downloader can prove the bytes are unaltered.

## Size limits

There aren't any. Verified against `@shelby-protocol/sdk` 0.3.1, not assumed:

- `generateCommitments(provider, ReadableStream | Uint8Array)` splits input into as many 10 MiB erasure-coded chunksets as needed — no ceiling.
- `putBlob({ blobData: ReadableStream, totalBytes })` uploads multipart in 5 MiB parts — no part-count cap.
- The docs say you can "upload files of any size with automatic chunking and erasure coding"; no maximum is stated anywhere.

So nothing is buffered. Each stage takes a fresh `Blob.stream()`, and peak memory is a flat ~26 MB (one chunkset plus its parity) no matter how large the dataset is. Hashing uses a streaming SHA-256 (`src/lib/sha256Stream.ts`) because WebCrypto's `subtle.digest` has no streaming API and would have forced a ~2 GiB ceiling on its own.

## How verification works

Upload:

1. The browser streams the dataset through SHA-256 (`src/lib/crypto.ts`, `src/lib/sha256Stream.ts`).
2. It streams again into erasure coding, then again into Shelby (`src/services/uploadService.ts`).
3. That hash is written to the Aptos registry by the uploader's own signed transaction (`aptos/sources/registry.move`) — **before** the dataset is served to anyone.

Download (`src/app/f/[fileId]/page.tsx`):

1. The bytes are fetched from Shelby — buffered under 256 MiB, streamed above it.
2. Their SHA-256 is recomputed in the browser and compared to the on-chain commitment (`src/lib/verify.ts`).
3. The result is shown with both hashes side by side (`src/components/IntegrityPanel.tsx`). A mismatch blocks preview and download behind an explicit warning.

The on-chain commitment is what makes this meaningful. A hash the uploader hands you next to the file proves nothing, because whoever serves the bytes can serve a matching hash. Because the commitment lives in an immutable Move resource, neither the uploader nor the storage gateway can change it after the fact to match altered bytes.

## Routes

| Route | Purpose |
| --- | --- |
| `/` | Landing page, or your dataset list once a wallet is connected |
| `/upload` | Hash, store on Shelby, and commit the hash on-chain |
| `/f/[fileId]` | Share page — verifies integrity, then previews/downloads |
| `/cleanup` | Recover ShelbyUSD from uploads whose bytes never finalized |

## Setup

```bash
npm install
cp .env.local.example .env.local   # then paste your keys
npm run dev
```

Required environment variables:

| Variable | Purpose |
| --- | --- |
| `NEXT_PUBLIC_SHELBY_API_KEY` | Shelby (Geomi) key for storage reads/writes |
| `NEXT_PUBLIC_REGISTRY_ADDRESS_TESTNET` | Deployed registry address on Aptos testnet |
| `NEXT_PUBLIC_REGISTRY_ADDRESS_SHELBYNET` | Deployed registry address on shelbynet |
| `NEXT_PUBLIC_APTOS_API_KEY_TESTNET` | Aptos fullnode API key (optional, avoids rate limits) |

Per-network Shelby keys (`NEXT_PUBLIC_SHELBY_API_KEY_TESTNET`, `..._SHELBYNET`) override the shared key when set.

## Move contract

```bash
cd aptos
aptos move compile
aptos move publish
```

Then point `NEXT_PUBLIC_REGISTRY_ADDRESS_<NETWORK>` at the published address.

## Known limits

- **Uploads are unbounded**, but the dataset is read from disk three times (hash, encode, upload) and the transfer is sequential, so very large datasets simply take a while. Datasets over 1 GiB show a timing advisory.
- **Datasets over 256 MiB can't be previewed or re-downloaded in the tab.** Integrity is still verified in full by streaming, but materializing that many bytes into a `Blob` would exhaust memory, so the share page hands you the direct Shelby gateway URL instead (public datasets) or tells you to fetch via the SDK/CLI (restricted ones).
- **Storage expires.** Blobs carry an expiration (1 day to 1 year, chosen at upload). Once it passes, providers garbage-collect the bytes; the registry entry and its hash remain, but the data is gone.
- **Verification requires transferring the whole dataset**, since the hash covers the full byte range. It streams rather than buffers, so memory is flat — but there is no partial or range-based verification.
- Shelby testnet uploads can return 408/5xx after the on-chain register already landed, which locks ShelbyUSD against an orphaned blob. `/cleanup` reclaims it.

## Scripts

```bash
npm run dev               # dev server
npm run build             # production build
npm run lint              # eslint
npm run typecheck         # tsc --noEmit
npm run verify            # typecheck + both correctness gates below
npm run verify:sha256     # streaming SHA-256 vs NIST vectors + WebCrypto fuzz
npm run verify:streaming  # streamed commitments == buffered commitments
npm run verify:network    # default network actually has a live registry
```

The two `verify:*` gates guard the pieces where a silent bug would be worst:

- `verify:sha256` — the streaming digest replaces WebCrypto on the upload path. If it were wrong, every dataset would get a bad on-chain commitment and every download would report tampering. Checked against FIPS 180-4 known-answer vectors, block/padding boundaries (55/56/57, 63/64/65, 119/120/121), and 300 randomized differential comparisons against `crypto.subtle.digest` with random update splits.
- `verify:streaming` — uploads now stream into `generateCommitments`. If streaming changed the merkle root, blobs would register on-chain with the wrong root. Checked at chunkset boundaries with both aligned and ragged stream chunking.

`verify:network` is separate from `npm run verify` because it needs `.env.local` and network access. It resolves the default network the same way the app does and calls the registry's `next_id`, which catches the case where the app points at a network with no contract deployed.

**The registry is deployed on Aptos testnet, not shelbynet.** The shelbynet account exists but has zero modules published, so the app defaults to testnet — pointing it at shelbynet gives a silently empty dashboard and uploads that fail at `register_file`.
