"use client";

import Link from "next/link";
import { useReveal } from "@/hooks/useReveal";
import { AptboxIcon } from "@/components/AptboxIcon";
import { ShelbyLogo } from "@/components/ShelbyLogo";
import { ConnectWalletButton } from "@/components/ConnectWalletButton";
import { NetworkSwitcher } from "@/components/NetworkSwitcher";
import { ArrowRightIcon } from "@/components/CategoryIcon";
import {
  Callout,
  CodeBlock,
  CompareCard,
  CompareGrid,
  Figure,
  Section,
  Words,
} from "@/components/docs/DocsPrimitives";
import { DocsBackdrop } from "@/components/docs/DocsBackdrop";
import {
  ChunksetTree,
  IntegrityLayers,
  LayerStack,
  TamperDiff,
  VerificationFlow,
} from "@/components/docs/Diagrams";

const TOC = [
  { id: "introduction", label: "Introduction" },
  { id: "why", label: "Why we built it" },
  { id: "verification", label: "How verification works" },
  { id: "trust", label: "Why the on-chain hash matters" },
  { id: "shelby", label: "What it does on Shelby" },
  { id: "layers", label: "Two integrity layers" },
  { id: "ai-teams", label: "For AI teams" },
  { id: "verify-yourself", label: "Verify it yourself" },
  { id: "size", label: "No size limit" },
  { id: "limits", label: "Limits, stated plainly" },
];

export default function DocsPage() {
  return (
    <div className="relative flex min-h-dvh flex-col bg-surface text-ink">
      <DocsBackdrop />

      <header className="sticky top-0 z-30 border-b border-line bg-surface/80 backdrop-blur-md">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <Link href="/" className="flex min-w-0 items-center gap-2">
            <AptboxIcon className="h-6 w-6 shrink-0 text-ink" />
            <span className="truncate text-base font-bold tracking-tight">
              Dataset Locker
            </span>
            <span className="hidden rounded-md bg-royal/15 px-1.5 py-0.5 text-2xs font-semibold uppercase tracking-wider text-royal sm:inline">
              Docs
            </span>
          </Link>
          <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
            <NetworkSwitcher />
            <ConnectWalletButton />
          </div>
        </div>

        {/* Mobile ToC — horizontal chips, since a sticky rail has nowhere to go */}
        <nav
          aria-label="On this page"
          className="flex gap-1.5 overflow-x-auto px-4 pb-2.5 lg:hidden"
        >
          {TOC.map((t) => (
            <a
              key={t.id}
              href={`#${t.id}`}
              className="shrink-0 rounded-full border border-line bg-surface-raised/80 px-3 py-1.5 text-xs font-medium text-ink-muted transition hover:border-royal/45 hover:text-royal"
            >
              {t.label}
            </a>
          ))}
        </nav>
      </header>

      <main className="relative z-10 mx-auto w-full max-w-6xl flex-1 px-4 py-10 sm:px-6 sm:py-14">
        <Hero />

        <div className="mt-12 lg:grid lg:grid-cols-[14rem_minmax(0,1fr)] lg:gap-12">
          {/* Desktop ToC rail */}
          <aside className="hidden lg:block">
            <nav
              aria-label="On this page"
              className="sticky top-24 flex flex-col gap-0.5"
            >
              <div className="px-3 pb-2 text-2xs font-semibold uppercase tracking-[0.18em] text-ink-subtle">
                On this page
              </div>
              {TOC.map((t) => (
                <a
                  key={t.id}
                  href={`#${t.id}`}
                  className="rounded-lg px-3 py-1.5 text-sm text-ink-subtle transition hover:bg-royal/6 hover:text-ink"
                >
                  {t.label}
                </a>
              ))}
            </nav>
          </aside>

          <div className="space-y-14 sm:space-y-20">
            <Introduction />
            <WhyWeBuilt />
            <HowVerificationWorks />
            <TrustArgument />
            <OnShelby />
            <TwoLayers />
            <ForAiTeams />
            <VerifyYourself />
            <NoSizeLimit />
            <Limits />
            <Closing />
          </div>
        </div>
      </main>

      <footer className="relative z-10 flex flex-wrap items-center justify-center gap-x-1.5 gap-y-1 border-t border-line bg-surface-raised/70 px-4 py-4 text-xs text-ink-subtle">
        <span>AI Dataset Locker · built on</span>
        <a
          href="https://shelby.xyz"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 font-semibold text-ink-muted transition hover:text-sky"
        >
          <ShelbyLogo className="h-3 w-3 text-sky" />
          Shelby
        </a>
        <span className="text-ink-subtle">·</span>
        <a
          href="https://aptosfoundation.org"
          target="_blank"
          rel="noopener noreferrer"
          className="font-semibold text-ink-muted transition hover:text-royal-deep"
        >
          Aptos
        </a>
      </footer>
    </div>
  );
}

/* ---------------------------- Hero ---------------------------- */

function Hero() {
  const { ref, revealed } = useReveal<HTMLDivElement>();
  return (
    <div ref={ref} data-revealed={revealed} className="ax-reveal max-w-3xl">
      <div className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface-raised/70 px-3 py-1 text-xs font-medium uppercase tracking-[0.16em] text-royal">
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-royal" />
        Documentation
      </div>
      <h1 className="mt-5 text-3xl font-semibold leading-[1.08] tracking-tight sm:text-5xl">
        <Words text="Datasets you can prove weren't touched." />
      </h1>
      <p className="mt-5 text-base leading-relaxed text-ink-muted sm:text-lg">
        The AI Dataset Locker stores training data on{" "}
        <span className="font-semibold text-sky">Shelby</span> and commits
        its SHA-256 to{" "}
        <span className="font-semibold text-royal">Aptos</span> before the
        bytes are served to anyone. Every download is re-hashed and checked
        against that commitment. This page explains exactly how, and what it
        does and doesn&apos;t guarantee.
      </p>
      <div className="mt-7 flex flex-wrap gap-3">
        <Link
          href="/upload"
          className="inline-flex items-center gap-1.5 rounded-full bg-royal px-5 py-2.5 text-sm font-semibold text-surface transition hover:bg-royal-deep"
        >
          Lock a dataset
          <ArrowRightIcon className="h-3.5 w-3.5" />
        </Link>
        <a
          href="#verification"
          className="rounded-full border border-line bg-surface-raised/70 px-5 py-2.5 text-sm font-medium text-ink transition hover:border-royal/45 hover:text-royal"
        >
          See the flow
        </a>
      </div>
    </div>
  );
}

/* -------------------------- Sections -------------------------- */

function Introduction() {
  return (
    <Section
      id="introduction"
      eyebrow="Introduction"
      title="What this is."
      lead="A place to put an AI training dataset so that anyone who later downloads it can prove, without trusting you or us, that the bytes are exactly what was published."
    >
      <p className="mt-4 max-w-3xl text-base leading-relaxed text-ink-muted">
        You upload a dataset — an image set, a text corpus, audio, or model
        weights. Three things happen: the bytes go to Shelby&apos;s decentralized
        object storage, the dataset&apos;s SHA-256 is written into an Aptos Move
        registry by your own signed transaction, and you get a share link. When
        someone opens that link, the app fetches the bytes, recomputes the hash
        in their browser, and compares it to the one on chain. A mismatch blocks
        the download behind a warning.
      </p>
      <Callout tone="violet" title="The one-line version">
        Storage tells you where the data is. The chain tells you what the data
        was supposed to be. Verification is the two disagreeing, loudly.
      </Callout>
    </Section>
  );
}

function WhyWeBuilt() {
  return (
    <Section
      id="why"
      eyebrow="Why we built it"
      title="Training data moves through links nobody can check."
      lead="Datasets get shared as Google Drive folders, S3 buckets with rotating permissions, and zip files passed around in chat. All of these answer 'where do I download it', and none of them answer 'is this the same data the paper used'."
    >
      <p className="mt-4 max-w-3xl text-base leading-relaxed text-ink-muted">
        That gap is quiet until it isn&apos;t. A folder gets re-uploaded with 300
        rows removed. A bucket is silently re-generated with a different
        preprocessing script. A shared archive picks up a corrupted file
        somewhere in transit. In each case the link still works, the filename is
        unchanged, and nothing downstream notices — the model just trains on
        something other than what everyone believes it trained on.
      </p>
      <p className="mt-4 max-w-3xl text-base leading-relaxed text-ink-muted">
        Publishing a checksum alongside the file is the usual answer, and it is
        better than nothing. But it moves the problem rather than solving it,
        which is the subject of the{" "}
        <a href="#trust" className="text-royal underline-offset-2 hover:underline">
          trust section
        </a>{" "}
        below.
      </p>
    </Section>
  );
}

function HowVerificationWorks() {
  return (
    <Section
      id="verification"
      eyebrow="How it works"
      title="Hash once. Check on every download."
      lead="The commitment is written before anyone can fetch the data, and it is written by the uploader's own key. Everything after that is a comparison."
    >
      <Figure
        scroll
        caption="Upload happens once; the verification path below the line runs for every visitor, every time."
        alt="Flow diagram. Upload: your dataset is hashed with SHA-256 in the browser, the bytes go to Shelby and the hash is committed to the Aptos registry. Download: anyone with the link receives the bytes, re-hashes them, compares against the committed hash, and the result is either verified or blocked."
      >
        <VerificationFlow />
      </Figure>

      <ol className="mt-8 space-y-4">
        {[
          {
            t: "The dataset is hashed in your browser",
            d: "Streamed through SHA-256 so memory stays flat regardless of size. The bytes never leave your machine before you sign.",
          },
          {
            t: "Bytes go to Shelby",
            d: "Erasure-coded into 10 MiB chunksets and uploaded as 5 MiB multipart chunks.",
          },
          {
            t: "The hash goes to Aptos",
            d: "Written into the registry Move module by your signed transaction — before the dataset is retrievable by anyone else.",
          },
          {
            t: "Every download re-hashes",
            d: "The recipient's browser recomputes SHA-256 from the bytes it actually received and compares. Both hashes are shown side by side so the match can be confirmed by eye, not taken on faith.",
          },
        ].map((s, i) => (
          <li key={s.t} className="flex gap-4">
            <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-royal/35 bg-royal/10 text-xs font-semibold text-royal">
              {i + 1}
            </span>
            <div className="min-w-0">
              <div className="text-base font-semibold text-ink">{s.t}</div>
              <div className="mt-1 text-sm leading-relaxed text-ink-muted">
                {s.d}
              </div>
            </div>
          </li>
        ))}
      </ol>
    </Section>
  );
}

function TrustArgument() {
  return (
    <Section
      id="trust"
      eyebrow="The core argument"
      title="A hash next to the file proves nothing."
      lead="If the same party serves both the dataset and its checksum, the checksum is a claim, not a proof. Whoever can alter the bytes can alter the number printed beside them."
    >
      <CompareGrid>
        <CompareCard
          verdict="bad"
          title="Checksum published beside the file"
          points={[
            "The host serves the bytes and the checksum, so both can change together",
            "A README hash can be edited silently, with no record that it ever differed",
            "You are trusting the publisher's infrastructure, not verifying anything",
            "Nothing tells you the file changed after you first downloaded it",
          ]}
        />
        <CompareCard
          verdict="good"
          title="Hash committed on-chain first"
          points={[
            "Written by the uploader's signed transaction into an immutable Move resource",
            "Committed before the dataset is retrievable, so it can't be fitted to altered bytes",
            "The storage gateway has no ability to change it",
            "Anyone can read the commitment independently, without asking us",
          ]}
        />
      </CompareGrid>

      <p className="mt-8 max-w-3xl text-base leading-relaxed text-ink-muted">
        The property that matters is ordering. The hash is committed{" "}
        <em className="text-ink not-italic">before</em> anyone can fetch the
        data, by a key the storage layer doesn&apos;t hold. So there is no point
        at which a modified dataset and a matching commitment can both exist —
        not for the uploader, and not for whoever runs the storage.
      </p>

      <TamperDiff />
    </Section>
  );
}

function OnShelby() {
  return (
    <Section
      id="shelby"
      eyebrow="Storage layer"
      title="What it does on Shelby."
      lead="Shelby is verifiable global object storage. Rather than putting a dataset on one machine and hoping, it splits and erasure-codes it across providers that must keep proving they still hold it."
    >
      <Figure
        scroll
        caption="The default scheme is ClayCode 16/10: each 10 MiB chunkset becomes 16 shards, any 10 of which rebuild it."
        alt="Tree diagram. A dataset splits into multiple 10 MiB chunksets. Each chunkset is erasure-coded into 16 shards: 10 data shards and 6 parity shards. Any 10 of the 16 shards can rebuild the chunkset, so up to 6 can be lost without data loss."
      >
        <ChunksetTree />
      </Figure>

      <p className="mt-8 max-w-3xl text-base leading-relaxed text-ink-muted">
        This is what the locker is built on top of, and it is doing the part
        that&apos;s genuinely hard: keeping large objects durable and retrievable
        across independent operators. What the locker adds is the claim about{" "}
        <em className="text-ink not-italic">identity</em> — not just that
        the bytes are still there, but that they are still the same bytes.
      </p>

      <LayerStack />
    </Section>
  );
}

function TwoLayers() {
  return (
    <Section
      id="layers"
      eyebrow="Division of labour"
      title="Shelby checks the count. The hash checks the bytes."
      lead="These are two different guarantees, and the distinction is the reason this project exists rather than just pointing people at a gateway URL."
    >
      <p className="mt-4 max-w-3xl text-base leading-relaxed text-ink-muted">
        Shelby&apos;s job is durability and retrievability: erasure-coded shards
        across independent providers, a blob merkle root committed on-chain at
        upload, and providers that must keep proving they still hold the data.
        That machinery is real and this app depends on it.
      </p>
      <p className="mt-4 max-w-3xl text-base leading-relaxed text-ink-muted">
        What it doesn&apos;t do is verify bytes cryptographically on the read
        path. The client&apos;s download check, in{" "}
        <code className="rounded bg-surface-raised/70 px-1 py-0.5 text-sm">
          ShelbyRPCClient.getBlob
        </code>
        , is a byte count:
      </p>

      <CodeBlock
        lines={[
          { text: "// @shelby-protocol/sdk 0.3.1", comment: true },
          { text: "if (bytesReceived !== expectedContentLength) {" },
          { text: "  controller.error(new Error(" },
          { text: "    `Downloaded data size (${bytesReceived} bytes) does not`" },
          { text: "    + ` match content-length header ...`" },
          { text: "  ));" },
          { text: "}" },
        ]}
        caption="That catches a truncated or partial transfer. It cannot catch an alteration that preserves length, because nothing hashes the bytes."
      />

      <Callout tone="violet" title="The end-to-end argument">
        A check inside the transport tells you the transport behaved. Only a
        check at the endpoint, against a commitment made before the data was
        served, tells you the data is what was published. That is where the
        SHA-256 sits.
      </Callout>

      <IntegrityLayers />

      <p className="mt-8 max-w-3xl text-base leading-relaxed text-ink-muted">
        The second row is the one that matters. Flipping a single byte in a
        196,882-byte dataset leaves it 196,882 bytes long — a content-length
        check passes it unchanged, while the digest becomes unrecognisable.
        That case is exercised against live registry data by{" "}
        <code className="rounded bg-surface-raised/70 px-1 py-0.5 text-sm">
          npm run verify:tamper
        </code>
        .
      </p>
      <p className="mt-4 max-w-3xl text-base leading-relaxed text-ink-muted">
        It also explains why the commitment is a plain SHA-256 in our own
        registry rather than Shelby&apos;s merkle root. The merkle root is
        internal to Shelby and needs their tooling to interpret; a SHA-256 can
        be reproduced by anyone with <code className="rounded bg-surface-raised/70 px-1 py-0.5 text-sm">shasum</code>{" "}
        and no dependency on us or on Shelby.
      </p>
    </Section>
  );
}

function ForAiTeams() {
  return (
    <Section
      id="ai-teams"
      eyebrow="For AI teams"
      title="What this is actually useful for."
      lead="Verifiable datasets aren't an end in themselves. They're a prerequisite for a handful of things teams already have to do, usually by hand and usually badly."
    >
      <div className="mt-8 grid gap-3 sm:grid-cols-2">
        {[
          {
            t: "Reproducibility that survives review",
            d: "Record the dataset hash next to the run. Anyone re-running it later can confirm they have the same corpus rather than a directory with the same name.",
          },
          {
            t: "Supply-chain integrity",
            d: "Data poisoning depends on nobody checking. A commitment made before distribution means an altered copy fails on arrival, not months later.",
          },
          {
            t: "Provenance for audits",
            d: "The registry records who uploaded, when, how large, and under what access rule — on a public chain, not in a spreadsheet.",
          },
          {
            t: "Distribution without trust",
            d: "Share a link with a partner, a reviewer, or the public. They verify against the chain instead of taking your word for it.",
          },
          {
            t: "Licensing and access boundaries",
            d: "Datasets can be public or restricted to specific wallets, enforced by an on-chain check rather than an unlisted URL.",
          },
          {
            t: "Detecting silent corruption",
            d: "Transfer and storage errors are caught by the same mechanism that catches deliberate tampering. Neither gets through.",
          },
        ].map((c) => (
          <div
            key={c.t}
            className="rounded-xl border border-line bg-surface-raised/60 p-4 transition hover:border-royal/45"
          >
            <div className="text-sm font-semibold text-ink">{c.t}</div>
            <div className="mt-1.5 text-sm leading-relaxed text-ink-muted">
              {c.d}
            </div>
          </div>
        ))}
      </div>
    </Section>
  );
}

function VerifyYourself() {
  return (
    <Section
      id="verify-yourself"
      eyebrow="Independent check"
      title="Don't take our UI's word for it."
      lead="A verification tool you have to trust is a contradiction. Everything the app checks, you can check yourself with standard tooling."
    >
      <CodeBlock
        lines={[
          { text: "# 1. Read the commitment straight off Aptos", comment: true },
          { text: "aptos move view \\" },
          { text: "  --function-id '<REGISTRY_ADDR>::registry::get_file' \\" },
          { text: "  --args u64:<DATASET_ID> \\" },
          { text: "  --url https://api.testnet.aptoslabs.com" },
          { text: "" },
          { text: "# 2. Hash the bytes you actually received", comment: true },
          { text: "shasum -a 256 my-dataset.zip" },
          { text: "" },
          {
            text: "# 3. Compare. content_hash is 0x-prefixed, shasum is not,",
            comment: true,
          },
          { text: "#    so strip the 0x before comparing the two.", comment: true },
        ]}
        caption="Nothing here depends on this app being honest, or even being online — the commitment is public chain state, readable by anyone."
      />

      <p className="mt-8 max-w-3xl text-base leading-relaxed text-ink-muted">
        Worked example, against a real dataset in the testnet registry. Dataset{" "}
        <span className="font-mono text-ink">#24</span> is a 34,145,930-byte
        video. The chain says its hash is:
      </p>

      <CodeBlock
        lines={[
          { text: "content_hash", comment: true },
          { text: "0x9ad5a9ac80bf9425239f87fdf5d08ea1" },
          { text: "  7010f069d10bf881b4d74d638ac0ae7c" },
          { text: "" },
          { text: "# shasum of the bytes fetched from Shelby", comment: true },
          { text: "  9ad5a9ac80bf9425239f87fdf5d08ea1" },
          { text: "  7010f069d10bf881b4d74d638ac0ae7c" },
        ]}
        caption="Identical once the 0x is removed — and size_bytes on chain matches the downloaded length exactly. Nothing in that check went through this app."
      />

      <Callout tone="emerald" title="This is the whole point">
        If the locker disappeared tomorrow, every dataset it published would
        still be verifiable by anyone with the hash and a copy of the bytes.
      </Callout>

      <p className="mt-6 max-w-3xl text-base leading-relaxed text-ink-muted">
        If you&apos;d rather not do it by hand,{" "}
        <Link
          href="/verify"
          className="text-royal underline-offset-2 hover:underline"
        >
          drop the file into the checker
        </Link>
        . It hashes locally, never uploads, needs no wallet, and additionally
        flags datasets published under the same filename with different bytes —
        which comparing one hash by eye cannot tell you.
      </p>
    </Section>
  );
}

function NoSizeLimit() {
  return (
    <Section
      id="size"
      eyebrow="Scale"
      title="There is no maximum dataset size."
      lead="Shelby states none, its SDK enforces none, and the app buffers nothing. Peak memory is a flat ~26 MB whether the dataset is a kilobyte or a terabyte."
    >
      <p className="mt-4 max-w-3xl text-base leading-relaxed text-ink-muted">
        Every stage reads the dataset as a stream rather than loading it: the
        SHA-256 pass, the erasure-coding pass, and the upload itself. The
        limiting factor is time and bandwidth, not memory. Hashing uses a
        streaming SHA-256 implementation because the browser&apos;s built-in
        WebCrypto digest requires one contiguous buffer and would have imposed a
        ceiling around 2 GiB on its own.
      </p>
      <div className="mt-8 grid gap-3 sm:grid-cols-3">
        {[
          { k: "10 MiB", v: "erasure-coded chunkset" },
          { k: "5 MiB", v: "multipart upload chunk" },
          { k: "~26 MB", v: "peak memory, any size" },
        ].map((s) => (
          <div
            key={s.k}
            className="rounded-xl border border-line bg-surface-raised/60 p-4"
          >
            <div className="text-lg font-semibold text-royal">{s.k}</div>
            <div className="mt-0.5 text-xs text-ink-subtle">{s.v}</div>
          </div>
        ))}
      </div>
      <Callout tone="amber" title="The cost of not buffering">
        The dataset is read three times — once to hash, once to encode, once to
        upload — and the transfer is sequential. Very large datasets are slow.
        They are not impossible, which is the tradeoff we picked.
      </Callout>
    </Section>
  );
}

function Limits() {
  return (
    <Section
      id="limits"
      eyebrow="Honesty"
      title="What this does not do."
      lead="A verification product that oversells itself is worse than none, so here is the complete list of things worth knowing before you rely on it."
    >
      <div className="mt-8 space-y-3">
        {[
          {
            t: "Storage expires",
            d: "Blobs carry an expiration between 1 day and 1 year, chosen at upload. After it passes, providers garbage-collect the bytes. The registry entry and its hash survive, but the data does not — this is a storage lease, not an archive.",
          },
          {
            t: "Verification needs the whole dataset",
            d: "The hash covers the full byte range, so checking it means transferring all of it. It streams rather than buffers, so memory is flat, but there is no partial or range-based verification.",
          },
          {
            t: "Datasets over 256 MiB can't be previewed in the browser",
            d: "Integrity is still verified in full by streaming. But holding that many bytes in a tab to preview or re-download would exhaust memory, so the share page gives you the direct gateway URL instead.",
          },
          {
            t: "It proves integrity, not accuracy",
            d: "A verified dataset is unaltered since publication. It is not therefore correct, unbiased, well-labelled, or lawfully obtained. Those are different problems and this tool has nothing to say about them.",
          },
          {
            t: "Running on testnet",
            d: "Shelby testnet uploads can return 408 or 5xx after the on-chain register has already landed, which locks ShelbyUSD against an orphaned blob. /cleanup reclaims it.",
          },
        ].map((l) => (
          <div
            key={l.t}
            className="rounded-xl border border-amber-600/30 bg-amber-500/12 p-4"
          >
            <div className="text-sm font-semibold text-amber-700">{l.t}</div>
            <div className="mt-1.5 text-sm leading-relaxed text-ink-muted">
              {l.d}
            </div>
          </div>
        ))}
      </div>
    </Section>
  );
}

function Closing() {
  const { ref, revealed } = useReveal<HTMLDivElement>();
  return (
    <div
      ref={ref}
      data-revealed={revealed}
      className="ax-reveal rounded-2xl border border-royal/35 bg-royal/[0.06] p-6 sm:p-8"
    >
      <h2 className="text-xl font-semibold tracking-tight text-ink sm:text-2xl">
        Lock your first dataset
      </h2>
      <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-muted">
        Connect a wallet, pick a file, and sign twice — once to register storage
        on Shelby, once to commit the hash on Aptos. The share link works
        immediately, and verification runs for everyone who opens it.
      </p>
      <div className="mt-5 flex flex-wrap gap-3">
        <Link
          href="/upload"
          className="inline-flex items-center gap-1.5 rounded-full bg-royal px-5 py-2.5 text-sm font-semibold text-surface transition hover:bg-royal-deep"
        >
          Upload a dataset
          <ArrowRightIcon className="h-3.5 w-3.5" />
        </Link>
        <Link
          href="/"
          className="rounded-full border border-line bg-surface-raised/70 px-5 py-2.5 text-sm font-medium text-ink transition hover:border-royal/45 hover:text-royal"
        >
          Back to workspace
        </Link>
      </div>
    </div>
  );
}
