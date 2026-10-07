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

0x2251165b1dd4124e02304bd781779070e87af21aa86f69c1f6d452d4d8bd2e5c

*(the registry Move module on shelbynet — the network the app runs on. An
earlier deployment on Aptos testnet,
`0x6e5c78b1b9fd0c729cc525529f012227bf3e0b4aff7f8af93539dd186668ec25`, is no
longer used by the app.)*

---

## Describe your final application (max 5000)

**AI Dataset Locker — verifiable storage and training provenance for AI datasets.**

**The problem.** Training data moves through Drive links, S3 buckets and zip
files. All of them answer "where do I download it". None answer "is this the
same data the paper used", or "which data was this model trained on". A folder
gets re-uploaded with 300 rows removed, an archive picks up a corrupted file,
and a model card's dataset list is just text anyone could have written.

**What it does.** Upload a dataset. The browser streams it through SHA-256,
optionally encrypts it with AES-256-GCM, stores it on Shelby, and commits the
hash of the original bytes to an Aptos Move registry through the uploader's own
signed transaction — before anyone can retrieve it. Every download re-hashes
the bytes received and compares them to that commitment; a mismatch blocks
preview and download, showing both digests side by side.

Then go one level up: group datasets into a training set, commit it on-chain,
and issue a **wallet-signed training certificate** naming the model run. Anyone
can verify that certificate without a wallet.

**What's built — all live:**

- `/upload` — stream-hash, optionally encrypt, erasure-code, store on Shelby,
  commit on Aptos
- `/f/[id]` — share page; verifies integrity before exposing any bytes, and
  decrypts encrypted datasets with the owner's key, in the browser
- `/train` — batch-pin datasets as a training set: one Shelby batch
  registration, one registry batch, an immutable on-chain training-set record,
  and a certificate signed with the wallet. Encryption keys are shown and must
  be backed up before anything is pinned — Aptbox never stores them. Or reuse
  registered datasets: no re-upload
- `/verify/certificate` — paste or drop a certificate: checks the issuer's
  signature, that the training set is on Aptos and was created by the signer,
  that every dataset is still registered with the same SHA-256, and optionally
  the model file's hash. It shows ✓/✗ per check, and says plainly what a valid
  certificate does and doesn't prove
- `/verify` — drop any file and check it against the registry. It also flags a
  dataset published under the *same filename with different bytes*
- `/marketplace` — public catalogue with filters, search, publisher views and
  paid listings
- Embeddable badges and citations — a live SVG badge per dataset for READMEs
  and model cards, plus BibTeX and plain-text citations that pin the exact hash
- `/docs` and `/cleanup` (reclaim ShelbyUSD from uploads that never finalised)

**Certificates you can't forge.** A certificate's integrity hash alone proves
nothing — anyone can edit the body and recompute it. So the issuer's wallet
signs a message binding its address to that hash, and verification checks the
signature, that the key controls the signer address (with support for rotated
keys and keyless accounts), and the on-chain training-set record. The test suite
attacks it directly: edit-and-recompute, an attacker's key claiming a victim's
address, signatures reused across certificates. All are rejected.

**Honest about what it can't check.** Verdicts have three states. A check that
couldn't run — fullnode down, older contract — shows amber "couldn't verify",
never red; red is reserved for evidence of tampering. A dataset its uploader
later deleted is a warning, not a forgery.

**The registry evolves by addition only.** Descriptions, training sets and
training-set views were each added as new resources or functions rather than
by changing stored structs. The views were upgraded into the live shelbynet
registry in place, with every existing dataset and training set intact.

**Correctness gates** (`npm run verify`): streaming SHA-256 against FIPS 180-4
vectors and 300 randomised comparisons with WebCrypto; streamed erasure
commitments byte-identical to buffered; verifier verdict logic; badge and
citation escaping; 83 provenance checks covering encryption, key backup, the
certificate forgery cases, and the outage-vs-tamper verdicts; plus Move unit
tests for the training-set views.

**Verified end to end on shelbynet** with a real wallet: an encrypted training
upload whose public Shelby bytes are ciphertext (no PNG header, hash differs),
which decrypts with the backed-up key, and whose certificate verifies on-chain.

**Current state (shelbynet):** 8 datasets, 8.8 MB, 4 on-chain training sets.

**Honest limits.** Encryption protects bytes from Shelby readers, but there is
no key release to buyers yet: a paid *encrypted* dataset can only be shared by
the owner handing over the key, and a paid dataset uploaded *unencrypted* is
still publicly retrievable — the app says so at purchase. A certificate proves
*who* claims a model used which datasets, not that training actually used only
those. And storage is a lease: blobs expire, and Shelby's current object
listing doesn't report expiry, so the app can't yet warn a buyer before
selling access to data that is about to expire.

---

## Describe how your app uses Shelby storage (max 2000)

Shelby is the storage layer, used through `@shelby-protocol/sdk` (0.9.x)
directly rather than the S3 gateway.

**Upload.** Commitments are generated from a stream, so plaintext uploads are
never buffered whole. The user's wallet signs the blob registration — for
training sets, one `register_multiple_blobs` transaction for the whole batch —
and `putBlobChunksets` sends chunksets to storage providers, which
`commitObject` then finalises. Encrypted uploads are registered with the
`AES_GCM_V1` label, so the encryption state is recorded on-chain rather than
inferred.

**Read.** `getBlob` for verification, decryption and preview; the public
gateway URL for public datasets too large to hold in the tab, which the
browser streams to disk.

**Indexer.** The object listing supplies encryption, size and commit time:
it drives the encrypted-dataset key prompt (and stops an encrypted blob being
hashed as if it were plaintext), and `/cleanup` for blobs that registered but
never finalised. When the activity indexer returns no events,
the training audit trail falls back to the object listing — marked as derived
— rather than showing an empty history.

**What we add.** `getBlob`'s client-side check compares bytes received against
the content-length header. That catches truncation, not an alteration that
preserves length. Shelby guarantees durability and retrievability; end-to-end
verification is left to the caller. Our SHA-256 commitment fills that gap —
reproducible with `npm run verify:tamper`, which fetches a live 65,131-byte
dataset from shelbynet and flips one byte: same length, different digest,
caught. For encrypted datasets the commitment is over the
plaintext, so verification proves you decrypted the original bytes, not just
retrieved some ciphertext.

---

## Links (one per line)

https://aptbox.vercel.app/train
https://aptbox.vercel.app/verify/certificate
https://aptbox.vercel.app/verify
https://aptbox.vercel.app/marketplace
https://aptbox.vercel.app/docs
https://aptbox.vercel.app/api/badge/0?n=shelbynet

---

## Roadmap

**Shipped**
- Streaming SHA-256 committed on-chain before distribution
- Verification enforced on every download; mismatch blocks the bytes
- Client-side AES-256-GCM encryption, labelled `AES_GCM_V1` on Shelby, with a
  mandatory key backup before pinning
- Training sets: batch pinning and an immutable on-chain training-set record,
  or built from already-registered datasets with no re-upload
- Wallet-signed training certificates and a public certificate verifier,
  pinning the model's SHA-256 by hashing the weights file in the browser
- "My training sets" — every `register_training_set` tx from your wallet, each
  shown with its on-chain record and re-issuable as a fresh signed certificate
- Embeddable verification badges and dataset citations (BibTeX / plain text)
- `/verify` — check any file against the registry, no wallet
- Marketplace with wallet-as-publisher-identity and on-chain descriptions
- Batch pinning from uploads or the existing registry, with immutable on-chain training-set records
- Move registry live on shelbynet, upgraded in place without breaking records
- Correctness gates incl. certificate-forgery and outage-vs-tamper tests

**Next**
- Key release to buyers, so paid encrypted datasets unlock on purchase

**Later**
- Verify-before-train CLI / Python helper: refuse to train on bytes that don't
  match a training set's commitments
- Hugging Face model-card generator with live badges
- Registry-wide audit: re-fetch every dataset and report verified / tampered /
  missing / expired
- Hash index in Move (`Table<hash, file_id>`) so lookup isn't O(n) view calls
- Restore expiry warnings (the SDK 0.9 object listing has no expiry field),
  then a renewal flow, so a purchased dataset can't quietly vanish

---

## Demo video

Not recorded yet. Suggested 2 minutes:

1. `/train` — tick encryption, Prepare, download `keys.json` (Pin stays locked
   until you do), Pin, approve the wallet prompts → "Certificate verified"
2. Open the dataset → paste the key → decrypts, "Integrity verified"; change
   one character → friendly "this key doesn't unlock this dataset"
3. "Open in verifier" → all ✓; edit `modelRunId` in the JSON → ✗ integrity
4. `/verify` — drop the original file → authentic; rename an edited copy to
   the original's filename → red conflict
5. Cite → copy the badge into a README; show it rendering live
6. Terminal: `npm run verify:tamper` — one byte flipped, detected
