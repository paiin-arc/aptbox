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
| `/marketplace` | Public catalogue of every published dataset, plus publisher views |
| `/verify` | Drop a file and check it against the registry — no wallet needed |
| `/docs` | How verification works, and what it doesn't cover |
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

Publishing alone is not enough — the module has an `initialize` entry function
that creates the `Registry` resource, and every view aborts with
`Failed to borrow global resource` until it has been called.

```bash
cd aptos

# 1. Publish, with the named address bound to the deploying account
aptos move publish \
  --named-addresses aptbox=<DEPLOYER_ADDR> \
  --profile <PROFILE> --assume-yes

# 2. Create the Registry resource (must be sent by the same account)
aptos move run \
  --function-id '<DEPLOYER_ADDR>::registry::initialize' \
  --profile <PROFILE> --assume-yes

# 3. Confirm it answers
aptos move view \
  --function-id '<DEPLOYER_ADDR>::registry::next_id' \
  --profile <PROFILE>
```

Run `aptos move run` from `aptos/` — the CLI profile lives in `aptos/.aptos/`,
and from the repo root it looks for a global config instead.

Then point `NEXT_PUBLIC_REGISTRY_ADDRESS_<NETWORK>` at the published address and
check it with `npm run verify:network`.

### Deployed registries

| Network | Address | Status |
| --- | --- | --- |
| Aptos testnet | `0x6e5c78b1b9fd0c729cc525529f012227bf3e0b4aff7f8af93539dd186668ec25` | live, in use — the app's default |
| Shelbynet | `0x2251165b1dd4124e02304bd781779070e87af21aa86f69c1f6d452d4d8bd2e5c` | live, empty |

Both carry the `Descriptions` resource. After any upgrade that adds a resource,
run its one-time initializer as well as `initialize`:

```bash
aptos move run --function-id '<ADDR>::registry::init_descriptions' \
  --profile <PROFILE> --assume-yes
```

Shelbynet gets wiped periodically. A wipe takes the module with it, and the app
responds by showing an empty workspace rather than an error — so if shelbynet
suddenly has no datasets, run `NEXT_PUBLIC_DEFAULT_NETWORK=shelbynet npm run
verify:network` before assuming the data is gone. If it reports the module
missing, republish and re-run `initialize`.

## Deploying to Vercel

Every variable the app reads is `NEXT_PUBLIC_*`, which Next inlines **at build
time**. They must exist in the Vercel project before the build runs — setting
them afterwards does nothing until you redeploy.

```bash
vercel login
vercel link                     # connect this directory to a Vercel project

# Required — the build silently produces a broken app without these
vercel env add NEXT_PUBLIC_SHELBY_API_KEY production
vercel env add NEXT_PUBLIC_REGISTRY_ADDRESS_TESTNET production
vercel env add NEXT_PUBLIC_REGISTRY_ADDRESS_SHELBYNET production

# Recommended
vercel env add NEXT_PUBLIC_APTOS_API_KEY_TESTNET production   # avoids fullnode rate limits
vercel env add NEXT_PUBLIC_SITE_URL production                 # your real URL, for OG tags

# Optional — only to override the default network. Testnet is the built-in
# default, so leaving this unset is correct for production.
vercel env add NEXT_PUBLIC_DEFAULT_NETWORK production          # "shelbynet" to switch

vercel --prod
```

Values are in your local `.env.local`, which is gitignored and never reaches
the repo.

`NEXT_PUBLIC_DEFAULT_NETWORK` is the **only** env var that changes the active
network. An older `NEXT_PUBLIC_APTOS_NETWORK` was once honoured as a fallback
and is now ignored — a stale `shelbynet` value left in a Vercel project silently
pinned production to an empty registry, and because `NEXT_PUBLIC_*` is inlined
at build time no code change could override it. If that variable still exists in
your Vercel project it is inert, but worth deleting.

Two things worth knowing:

- **`NEXT_PUBLIC_SITE_URL`** feeds `metadataBase`. Without it the code falls
  back to `https://aptbox.vercel.app`, so Open Graph images on any other domain
  will resolve against the wrong host.
- **Shelby keys are public by construction.** They ship in the client bundle —
  that is how the browser talks to the gateway. Scope them accordingly and
  don't reuse a key that carries wider privileges.

After the first deploy, confirm the deployed build points at a live registry:

```bash
npm run verify:network        # locally, same resolution logic the app uses
```

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

The registry is now deployed on **both** networks (see the table above). The app defaults to Aptos testnet because that's where the existing datasets are; shelbynet is a working but empty registry.
