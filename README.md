# AI Dataset Locker

Verifiable storage for AI training datasets, built on [Shelby](https://shelby.xyz) and [Aptos](https://aptosfoundation.org).

Training data usually travels as a Google Drive link or a zip file passed around in chat. Nobody downstream can tell whether the dataset they received is the original or a modified copy. The Dataset Locker fixes that: it stores the dataset on Shelby's decentralized object storage and commits its SHA-256 to an Aptos Move registry, so any downloader can prove the bytes are unaltered.

## How verification works

Upload:

1. The browser hashes the file with SHA-256 (`src/lib/crypto.ts`).
2. The bytes are erasure-coded and uploaded to Shelby (`src/services/uploadService.ts`).
3. That hash is written to the Aptos registry by the uploader's own signed transaction (`aptos/sources/registry.move`) — **before** the dataset is served to anyone.

Download (`src/app/f/[fileId]/page.tsx`):

1. The bytes are fetched from Shelby.
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
| `NEXT_PUBLIC_MAX_UPLOAD_BYTES` | Optional. Raises the per-upload byte ceiling above the default ~2 GiB browser buffer limit |

Per-network Shelby keys (`NEXT_PUBLIC_SHELBY_API_KEY_TESTNET`, `..._SHELBYNET`) override the shared key when set.

## Move contract

```bash
cd aptos
aptos move compile
aptos move publish
```

Then point `NEXT_PUBLIC_REGISTRY_ADDRESS_<NETWORK>` at the published address.

## Known limits

- **No size limit from Shelby, but the browser caps a single upload at ~2 GiB.** Shelby has no per-blob maximum — the SDK splits data into as many 10 MiB erasure-coded chunksets as needed and uploads them as 5 MiB multipart chunks with no part-count ceiling. The constraint is that this app hands the SDK one contiguous `Uint8Array` from `file.arrayBuffer()`, and JS engines cap a single ArrayBuffer at roughly 2 GiB. Set `NEXT_PUBLIC_MAX_UPLOAD_BYTES` to raise it, or shard larger datasets. Erasure coding also runs in the tab and holds about 2.6× the dataset size in memory at peak, so uploads over 256 MiB show an advisory.
- **Storage expires.** Blobs carry an expiration (1 day to 1 year, chosen at upload). Once it passes, providers garbage-collect the bytes; the registry entry and its hash remain, but the data is gone.
- **Verification requires downloading the whole dataset**, since the hash covers the full byte range. There is no partial or streaming verification.
- Shelby testnet uploads can return 408/5xx after the on-chain register already landed, which locks ShelbyUSD against an orphaned blob. `/cleanup` reclaims it.

## Scripts

```bash
npm run dev     # dev server
npm run build   # production build
npm run lint    # eslint
npx tsc --noEmit  # typecheck
```
