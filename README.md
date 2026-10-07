# AI Dataset Locker

Verifiable storage and training provenance for AI datasets, built on [Shelby](https://shelby.xyz) and [Aptos](https://aptosfoundation.org).

Training data usually travels as a Google Drive link or a zip file passed around in chat. Nobody downstream can tell whether the dataset they received is the original or a modified copy, or which data a model was actually trained on. The Dataset Locker fixes that: it stores the dataset on Shelby's decentralized object storage (optionally encrypted) and commits its SHA-256 to an Aptos Move registry, so any downloader can prove the bytes are unaltered. On top of that, datasets can be grouped into an on-chain training set with a wallet-signed certificate that anyone can verify.

The app runs on **shelbynet**, the only network Shelby supports since SDK 0.6.0 retired testnet.

## Size limits

Plaintext uploads have none. Verified against `@shelby-protocol/sdk` 0.9.1, not assumed:

- `generateCommitments(provider, ReadableStream | Uint8Array)` streams the input into as many 10 MiB erasure-coded chunksets as needed — no ceiling.
- `putBlobChunksets` uploads chunksets directly to storage providers — no chunkset-count cap.
- The docs say you can "upload files of any size with automatic chunking and erasure coding"; no maximum is stated anywhere.

So nothing is buffered. Each stage takes a fresh `Blob.stream()`, and peak memory stays flat no matter how large the dataset is. Hashing uses a streaming SHA-256 (`src/lib/sha256Stream.ts`) because WebCrypto's `subtle.digest` has no streaming API and would have forced a ~2 GiB ceiling on its own.

**Encrypted uploads are capped at 256 MiB per file**, because browser AES-GCM (WebCrypto) has no streaming mode and materializes the ciphertext in memory.

## How verification works

Upload:

1. The browser streams the dataset through SHA-256 (`src/lib/crypto.ts`, `src/lib/sha256Stream.ts`).
2. Optionally, it encrypts the dataset with a fresh AES-256-GCM key (12-byte IV prefix + 16-byte tag, so the stored blob is 28 bytes larger).
3. It streams the (possibly encrypted) bytes into erasure coding, then into Shelby (`src/services/uploadService.ts`). Encrypted blobs are registered with Shelby's `AES_GCM_V1` label.
4. The hash of the **original** bytes is written to the Aptos registry by the uploader's own signed transaction (`aptos/sources/registry.move`) — **before** the dataset is served to anyone.

Download (`src/app/f/[fileId]/page.tsx`):

1. The bytes are fetched from Shelby — buffered under 256 MiB, streamed above it.
2. Encrypted datasets are decrypted in the browser with the key the user pastes. Without a valid key the page refuses to verify, because hashing ciphertext against the plaintext commitment would falsely report tampering.
3. The SHA-256 is recomputed and compared to the on-chain commitment (`src/lib/verify.ts`).
4. The result is shown with both hashes side by side (`src/components/IntegrityPanel.tsx`). A mismatch blocks preview and download behind an explicit warning.

The on-chain commitment is what makes this meaningful. A hash the uploader hands you next to the file proves nothing, because whoever serves the bytes can serve a matching hash. Because the commitment lives in an immutable Move resource, neither the uploader nor the storage gateway can change it after the fact to match altered bytes.

## Training provenance

`/train` pins a batch of datasets as a training set:

1. **Prepare** — hash, encrypt and erasure-code locally. Nothing leaves the browser. When encryption is on, every key is shown with a `keys.json` download, and **Pin stays disabled until the keys are backed up**. Aptbox never stores keys, so they are the only way to decrypt.
2. **Pin** — one Shelby `register_multiple_blobs` transaction, one registry `register_files_batch`, then `register_training_set`, which writes an immutable record of the member file IDs and their SHA-256s. The outcome of that last step is reported on its own, so a failure can't be hidden by later progress.
3. **Certify** — the wallet signs a certificate (AIP-62 `signMessage`) binding the signer address to the certificate's integrity digest. Optionally it pins the model: choose the weights file and it's streamed through SHA-256 in the browser (any size, never uploaded), or paste a hash, which is validated as you type so a bad value blocks Pin instead of failing after the transactions. The certificate keeps `trainingSetTxHash` and `registryTxHash` separate, so a registry transaction is never presented as the training-set commitment.

**Or build from registered datasets** ("Use registered datasets" tab): pick datasets already in the registry — yours or anyone's — and skip the upload entirely. The training set commits to their existing on-chain hashes, so it's one `register_training_set` transaction plus the certificate signature. The same datasets produce the same commitment either way. Two rules the contract doesn't enforce but the app does:

- Paid or restricted datasets can only be selected if you own them or hold access (`has_access`), since a certificate claims you trained on them.
- The registry keeps one record per training set, first creator wins. Before sending anything, the app looks the commitment up: if you registered it earlier it reuses that record (no transaction); if someone else did, it stops and says so.

`/verify/certificate` checks a certificate without a wallet: the signature (Ed25519, SingleKey, keyless, and rotated keys via the on-chain authentication key), that it targets this registry, that the training set is on-chain and was created by the signer, that every dataset is still registered with the same hash, and optionally a model file against the pinned model hash.

Verdicts have three states: **verified**, **incomplete** (a check couldn't run — fullnode down, older contract; shown amber, never as tampering), and **failed** (evidence of a problem). A certificate proves *who* claims a model used which datasets; it does not prove training used only those.

## Routes

| Route | Purpose |
| --- | --- |
| `/` | Landing page, or your dataset list once a wallet is connected |
| `/upload` | Hash, optionally encrypt, store on Shelby, and commit the hash on-chain |
| `/f/[fileId]` | Share page — decrypts if needed, verifies integrity, then previews/downloads. Also has Share and Cite (badge + BibTeX) |
| `/train` | Pin datasets as an on-chain training set and issue a wallet-signed certificate |
| `/verify` | Drop a file and check it against the registry — no wallet needed |
| `/verify/certificate` | Verify a training certificate — no wallet needed |
| `/marketplace` | Public catalogue of every published dataset, plus publisher views |
| `/docs` | How verification works, and what it doesn't cover |
| `/cleanup` | Recover ShelbyUSD from uploads whose bytes never finalized |
| `/api/badge/[fileId]?n=shelbynet` | Live SVG badge for READMEs and model cards |

## Setup

```bash
npm install
cp .env.local.example .env.local   # then paste your keys
npm run dev
```

Environment variables:

| Variable | Purpose |
| --- | --- |
| `NEXT_PUBLIC_SHELBY_API_KEY` | Shelby (Geomi) key for storage reads/writes. `NEXT_PUBLIC_SHELBY_API_KEY_SHELBYNET` overrides it when set |
| `NEXT_PUBLIC_REGISTRY_ADDRESS_SHELBYNET` | Deployed registry address. `NEXT_PUBLIC_REGISTRY_ADDRESS` is the fallback |
| `NEXT_PUBLIC_SITE_URL` | Optional. Your real URL, for Open Graph tags |

The shelbynet fullnode doesn't need an Aptos API key.

## Move contract

Publishing alone is not enough — the module has an `initialize` entry function
that creates the `Registry` resource, and every view aborts with
`Failed to borrow global resource` until it has been called. Descriptions and
training sets live in their own resources, each with a one-time initializer.

```bash
cd aptos

# 1. Publish, with the named address bound to the deploying account
aptos move publish \
  --named-addresses aptbox=<DEPLOYER_ADDR> \
  --profile <PROFILE> --assume-yes

# 2. Create the resources (must be sent by the same account)
aptos move run --function-id '<DEPLOYER_ADDR>::registry::initialize' \
  --profile <PROFILE> --assume-yes
aptos move run --function-id '<DEPLOYER_ADDR>::registry::init_descriptions' \
  --profile <PROFILE> --assume-yes
aptos move run --function-id '<DEPLOYER_ADDR>::registry::init_training_sets' \
  --profile <PROFILE> --assume-yes

# 3. Confirm it answers
aptos move view --function-id '<DEPLOYER_ADDR>::registry::next_id' \
  --profile <PROFILE>
```

Run these from `aptos/` — the CLI profile lives in `aptos/.aptos/`, and from the
repo root it looks for a global config instead. Move unit tests:
`aptos move test --dev`.

Then point `NEXT_PUBLIC_REGISTRY_ADDRESS_SHELBYNET` at the published address and
check it with `npm run verify:network`.

**Upgrades must be additive.** `FileRecord` is stored inside a `Table` in a
`key` resource, and the upgrade compatibility check rejects any change to a
stored struct's layout. New features are added as new resources (with their own
initializer) or new functions — that is how descriptions, training sets and the
`get_training_set` / `training_set_exists` views were added without breaking a
single existing record. An upgrade is just step 1 again; re-run an initializer
only if the upgrade added a resource.

### Deployed registries

| Network | Address | Status |
| --- | --- | --- |
| Shelbynet | `0x2251165b1dd4124e02304bd781779070e87af21aa86f69c1f6d452d4d8bd2e5c` | live, in use by the app |
| Aptos testnet | `0x6e5c78b1b9fd0c729cc525529f012227bf3e0b4aff7f8af93539dd186668ec25` | legacy, no longer used — Shelby retired testnet |

Shelbynet gets wiped periodically. A wipe takes the module with it, and the app
responds by showing an empty workspace rather than an error — so if shelbynet
suddenly has no datasets, run `npm run verify:network` before assuming the data
is gone. If it reports the module missing, republish and re-run the three
initializers.

## Deploying to Vercel

Every variable the app reads is `NEXT_PUBLIC_*`, which Next inlines **at build
time**. They must exist in the Vercel project before the build runs — setting
them afterwards does nothing until you redeploy.

```bash
vercel login
vercel link                     # connect this directory to a Vercel project

# Required — the build silently produces a broken app without these
vercel env add NEXT_PUBLIC_SHELBY_API_KEY production
vercel env add NEXT_PUBLIC_REGISTRY_ADDRESS_SHELBYNET production

# Recommended
vercel env add NEXT_PUBLIC_SITE_URL production                 # your real URL, for OG tags

vercel --prod
```

Values are in your local `.env.local`, which is gitignored and never reaches
the repo.

`NEXT_PUBLIC_DEFAULT_NETWORK` is the only env var that selects the network, and
`shelbynet` is the only supported value, so leave it unset. An older
`NEXT_PUBLIC_APTOS_NETWORK` is ignored; if it still exists in your Vercel
project it is inert, but worth deleting. Testnet-specific variables
(`..._TESTNET`) are no longer read.

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

## Shelby SDK

The app uses `@shelby-protocol/sdk` **0.9.1** and `@shelby-protocol/react`
**4.0.1**.

Uploads don't use the React `useUploadBlobs` hook: it calls the indexer to
dedupe first, and some Geomi key configurations 401 on that call even when
storage works. `src/services/uploadService.ts` runs the steps directly, and only
two of them need the wallet:

1. **Register** — the wallet signs the blob registration (one
   `register_multiple_blobs` for a training-set batch). The `BlobRegisteredEvent`
   gives the blob UID.
2. **Upload** — `putBlobChunksets` sends the chunksets to storage providers.
   No wallet signature.
3. **Commit** — the wallet signs `commitObject` with the providers'
   acknowledgements.

Registration in 0.9.x takes no expiry argument (see Known limits).

## Known limits

- **Uploads are unbounded**, but the dataset is read from disk three times (hash, encode, upload) and the transfer is sequential, so very large datasets simply take a while. Datasets over 1 GiB show a timing advisory.
- **Encrypted uploads are capped at 256 MiB per file** (see Size limits).
- **Keys are never stored.** Lose `keys.json` and the encrypted dataset is unrecoverable. There is also no key release to buyers yet: a paid encrypted dataset can only be unlocked by the owner handing over the key, and the purchase panel tells buyers so before they pay.
- **Unencrypted datasets are public**, even "paid" or whitelisted ones: anyone who reads the registry can fetch the bytes from Shelby. The app says so at purchase, and `/train` marks unencrypted pins in amber.
- **Datasets over 256 MiB can't be previewed or re-downloaded in the tab.** Integrity is still verified in full by streaming, but materializing that many bytes into a `Blob` would exhaust memory, so the share page hands you the direct Shelby gateway URL instead (public datasets) or tells you to fetch via the SDK/CLI (restricted ones).
- **Storage expiry isn't tracked right now.** SDK 0.9.x registration takes no expiry, and the object listing doesn't report one, so the app can't show when a blob expires or warn before a purchase. The upload page says so instead of offering a duration picker. The expiry badges and pre-purchase warnings elsewhere only render when an expiry is known, so they come back on their own if Shelby starts reporting it.
- **Verification requires transferring the whole dataset**, since the hash covers the full byte range. It streams rather than buffers, so memory is flat — but there is no partial or range-based verification.
- Shelby uploads can fail after the on-chain register already landed, which locks ShelbyUSD against an orphaned blob. `/cleanup` reclaims it.
- Shelby's activity indexer can return no events; the `/train` audit trail then falls back to the object listing (commit time, encryption, size), marked as derived.

## Scripts

```bash
npm run dev                # dev server
npm run build              # production build
npm run lint               # eslint
npm run typecheck          # tsc --noEmit
npm run verify             # typecheck + all offline correctness gates below
npm run verify:sha256      # streaming SHA-256 vs NIST vectors + WebCrypto fuzz
npm run verify:streaming   # streamed commitments == buffered commitments
npm run verify:lookup      # /verify verdict logic (authentic / renamed / conflict)
npm run verify:provenance  # encryption, key backup, certificate signing + forgery, verdicts
npm run verify:citation    # badge SVG + BibTeX escaping
npm run verify:network     # the registry is live (needs .env.local + network)
npm run verify:tamper      # live demo: fetch a dataset, flip one byte, get caught
```

The gates guard the pieces where a silent bug would be worst:

- `verify:sha256` — the streaming digest replaces WebCrypto on the upload path. If it were wrong, every dataset would get a bad on-chain commitment and every download would report tampering. Checked against FIPS 180-4 known-answer vectors, block/padding boundaries (55/56/57, 63/64/65, 119/120/121), and 300 randomized differential comparisons against `crypto.subtle.digest` with random update splits.
- `verify:streaming` — uploads stream into `generateCommitments`. If streaming changed the merkle root, blobs would register on-chain with the wrong root. Checked at chunkset boundaries with both aligned and ragged stream chunking.
- `verify:provenance` — the certificate forgery cases (edit and recompute the digest, an attacker's key claiming the victim's address, a signature reused from another certificate), key backup round trips, a one-character-off decryption key, and that an outage reads as "incomplete" while a forgery still reads as "failed".

`verify:network` and `verify:tamper` are separate from `npm run verify` because they need network access. `verify:network` resolves the network the same way the app does and calls the registry's `next_id`, which catches an app pointed at a network with no contract deployed. `verify:tamper [fileId]` defaults to dataset #0 and refuses encrypted datasets, since hashing ciphertext would falsely report tampering.
