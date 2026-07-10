"use client";

import Link from "next/link";
import { useReveal } from "@/hooks/useReveal";
import { AptboxIcon } from "@/components/AptboxIcon";
import { ShelbyLogo } from "@/components/ShelbyLogo";
import { StoryLogo } from "@/components/StoryLogo";
import { ConnectWalletButton } from "@/components/ConnectWalletButton";
import { NetworkSwitcher } from "@/components/NetworkSwitcher";
import {
  AiMemoryIcon,
  IpVaultIcon,
  MarketplaceIcon,
  MonetizeIcon,
  PermissionsIcon,
  VerifiedStorageIcon,
  WorkspaceIcon,
} from "@/components/CategoryIcon";

export default function DocsPage() {
  return (
    <div
      className="relative flex min-h-screen flex-col overflow-hidden bg-black text-zinc-100"
    >
      {/* Ambient brand glow — same family as the landing */}
      <Backdrop />

      <header className="sticky top-0 z-10 flex w-full items-center justify-between border-b border-white/5 bg-black/70 px-4 py-3 backdrop-blur-md sm:px-6 sm:py-4">
        <Link href="/" className="flex items-center gap-2">
          <AptboxIcon className="h-8 w-8 text-zinc-100" />
          <span className="text-lg font-semibold tracking-tight">aptbox</span>
        </Link>
        <div className="flex items-center gap-1.5 sm:gap-2">
          <NetworkSwitcher />
          <ConnectWalletButton />
        </div>
      </header>

      <main className="relative z-10 mx-auto w-full max-w-5xl px-4 py-12 sm:px-6 sm:py-20">
        <Hero />
        <Trinity />
        <ArchitectureStack />
        <PageWalkthroughs />
        <ComponentSketches />
        <WhyWeBuilt />
        <Closing />
      </main>
    </div>
  );
}

/* ---------------- Sections ---------------- */

function Hero() {
  const { ref, revealed } = useReveal<HTMLDivElement>();
  return (
    <section
      ref={ref}
      data-revealed={revealed}
      className="ax-reveal text-center"
    >
      <div className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-[11px] font-medium uppercase tracking-wider text-violet-300">
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-violet-400" />
        Documentation
      </div>
      <h1 className="mt-5 text-4xl font-semibold leading-[1.05] tracking-tight sm:text-6xl">
        <Words text="How aptbox actually works." />
      </h1>
      <p className="mx-auto mt-6 max-w-2xl text-base leading-relaxed text-zinc-400 sm:text-lg">
        Three protocols. One creator-native flow. Storage on{" "}
        <span className="font-semibold text-orange-300">Shelby</span>, programmable
        IP on <span className="font-semibold text-[#41B5FF]">Story</span>,
        provenance on <span className="font-semibold text-violet-300">Aptos</span>.
        Below: every piece, what it does, and why we built it.
      </p>
      <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
        <a
          href="#trinity"
          className="rounded-full bg-violet-600 px-5 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-violet-500"
        >
          Read the stack
        </a>
        <a
          href="#why"
          className="rounded-full border border-white/15 bg-white/[0.04] px-5 py-2 text-sm font-medium text-zinc-200 transition hover:border-violet-500/40 hover:bg-violet-500/10"
        >
          Why we built it
        </a>
      </div>
    </section>
  );
}

function Trinity() {
  const { ref, revealed } = useReveal<HTMLDivElement>();
  return (
    <section
      id="trinity"
      ref={ref}
      data-revealed={revealed}
      className="ax-reveal mt-24"
    >
      <SectionHeader
        eyebrow="The stack"
        title="A trinity of protocols, one creator-native flow."
        body="Each layer is best-in-class at one job. aptbox is the UX wrapper that turns them into a single product."
      />

      <div className="mt-10 grid grid-cols-1 gap-6 sm:grid-cols-3">
        <TrinityCard
          accent="orange"
          logo={<ShelbyLogo className="h-6 w-6 text-orange-400" />}
          title="Shelby"
          role="Verified storage"
          bullets={[
            "Decentralized hot storage built by Aptos Labs + Jump Crypto.",
            "Bytes replicated across providers, proven retrievable, sub-second reads.",
            "Files live as encrypted blobs — keys live elsewhere.",
          ]}
        />
        <TrinityCard
          accent="cyan"
          logo={<StoryLogo className="h-6 w-6" />}
          title="Story"
          role="Programmable IP"
          bullets={[
            "EVM L1 dedicated to intellectual-property primitives.",
            "Each file mints an NFT into your SPG collection → becomes an IP Asset.",
            "License terms, royalty splits, derivatives — all on-chain.",
          ]}
        />
        <TrinityCard
          accent="violet"
          logo={<AptboxIcon className="h-6 w-6 text-violet-300" />}
          title="Aptos"
          role="Provenance + access"
          bullets={[
            "Move contract `aptbox::registry` records content hash + uploader.",
            "First-class access modes: Public, Paid (APT), Whitelist.",
            "Where the creator's wallet always lives, no matter the chain layer.",
          ]}
        />
      </div>

      {/* Animated flow diagram */}
      <div className="mt-12">
        <FlowDiagram />
      </div>
    </section>
  );
}

function ArchitectureStack() {
  const { ref, revealed } = useReveal<HTMLDivElement>();
  return (
    <section
      id="architecture"
      ref={ref}
      data-revealed={revealed}
      className="ax-reveal mt-24"
    >
      <SectionHeader
        eyebrow="Architecture"
        title="Layers, top-down."
        body="What you click on top of, what runs underneath, and where keys + bytes split apart."
      />

      <div className="mt-10 space-y-2">
        <StackLayer
          label="UX"
          sub="What the creator sees — Workspace, IP Vault, Marketplace"
          tint="violet"
        />
        <StackLayer
          label="App logic"
          sub="MemoryPack builder · upload service · CategoryIcon · MarketCard"
          tint="violet"
        />
        <StackLayer
          label="Encryption envelope"
          sub="AES-256-GCM client-side · key never leaves the browser until sealed"
          tint="emerald"
        />
        <StackLayer
          label="Provenance · Aptos"
          sub="aptbox::registry — content_hash, shelby_cid, access_type, file_id"
          tint="violet"
        />
        <StackLayer
          label="IP · Story Protocol"
          sub="SPG NFT collection · ipId · license terms · royalty vaults"
          tint="cyan"
        />
        <StackLayer
          label="Privacy · CDR"
          sub="Encrypted objects + dynamic access policy · key sealed under buyer rules"
          tint="cyan"
        />
        <StackLayer
          label="Storage · Shelby"
          sub="Encrypted blob bytes · replicated · 3× retrievability"
          tint="orange"
        />
      </div>
    </section>
  );
}

function PageWalkthroughs() {
  const { ref, revealed } = useReveal<HTMLDivElement>();
  return (
    <section
      id="pages"
      ref={ref}
      data-revealed={revealed}
      className="ax-reveal mt-24"
    >
      <SectionHeader
        eyebrow="Pages"
        title="Every screen, decoded."
        body="What each page does, the components inside it, and the rationale."
      />

      <div className="mt-10 space-y-5">
        <PageCard
          icon={<WorkspaceIcon className="h-5 w-5" />}
          name="Workspace"
          href="/"
          tag="Home for the connected creator"
          what="The default landing once a wallet is connected. Shows storage usage, monetization summary, verification status, and four quick actions: Upload File, Register IP, Create Dataset, Share Secure Link."
          how="Fetches the user's files from aptbox::registry, enriches with Shelby lifecycle data (expiration, written, deleted) and the AI batch overlay (when enabled)."
          why="A creator-OS landing instead of a generic file grid. The first thing a user sees should signal what they can DO, not just what they own."
        />
        <PageCard
          icon={<IpVaultIcon className="h-5 w-5" />}
          name="IP Vault"
          href="/ip-vault"
          tag="Registered IP overview"
          what="Lists every file that's been registered as IP on Story Protocol. Shows IP ID, license type, royalty %, and links to the Story explorer. One-time SPG collection setup lives here."
          how="Reads from localStorage (`ipTracker.ts`) + the on-chain Story state. SPG collection setup uses `lib/story.ts` to deploy a one-time ERC-721 collection per wallet."
          why="Files-as-IP is the whole point of the product. The Vault makes that ownership legible — proof you can show, not just bytes you can download."
        />
        <PageCard
          icon={<VerifiedStorageIcon className="h-5 w-5" />}
          name="Verified Storage"
          href="/verified-storage"
          tag="Trust dashboard"
          what="Surfaces Shelby's verification properties: availability %, replication factor, encryption, proof status."
          how="Shelby's indexer + the lifecycle endpoint. Today the page is a hero stub — the real metric ingestion lands once we wire `client.coordination.getAccountBlobs` for the active wallet."
          why="People don't trust 'decentralized storage' as a bumper sticker. They trust it when you show them the numbers behind it."
        />
        <PageCard
          icon={<MonetizeIcon className="h-5 w-5" />}
          name="Monetize"
          href="/monetize"
          tag="Revenue dashboard"
          what="License sales, royalties, subscriptions, payouts — one place to see what your IP earned. Per-file analytics: downloads, AI usage, API calls."
          how="Aggregates Story Protocol royalty events + on-chain payment receipts from aptbox::registry. Server-side cron rolls these into the dashboard on a schedule."
          why="Decentralized storage without monetization is a sentimental side project. Monetize makes aptbox a livelihood."
        />
        <PageCard
          icon={<PermissionsIcon className="h-5 w-5" />}
          name="Permissions"
          href="/permissions"
          tag="Programmable access control"
          what="Per-file toggles: public/private, AI training, commercial rights, derivatives, revocable shares. Time-boxed grants."
          how="Today: aptbox's access modes (Public/Paid/Whitelist) in the Move contract. Tomorrow: CDR access policies — encrypted bytes + a policy contract that releases keys only to the wallets that satisfy the rule."
          why="Creators don't want one access mode. They want different rules for AI agents, paying customers, collaborators, and the public."
        />
        <PageCard
          icon={<AiMemoryIcon className="h-5 w-5" />}
          name="AI Memory Hub"
          href="/ai-memory"
          tag="Datasets as licensable IP"
          what="Create a memory pack by typing content or importing a file. Auto-chunked, ready for AI agents to query. Drafts saved locally until you publish."
          how="`lib/memoryPack.ts` defines the `.memory` format — manifest + chunks + (optional) embeddings. Chunker uses paragraph boundaries with light overlap. The Create page has two tabs: Type and Upload."
          why="The CDR Hackathon prize bullet #1 is 'private AI agents with encrypted memory'. This is where aptbox plays directly into that primitive — packaging intelligence as a tradable, encrypted, royalty-bearing object."
        />
        <PageCard
          icon={<MarketplaceIcon className="h-5 w-5" />}
          name="Marketplace"
          href="/marketplace"
          tag="Discover programmable IP"
          what="Dense, dark, Polymarket-style grid of every IP asset on the network. Each card shows the offer (Free / Paid / Whitelist), a one-click action, and a bookmark."
          how="Pulls all files via `fetchAllFiles(network)`, filters by category + access type + search. Bookmarks stored locally per `network:fileId`."
          why="Without a marketplace, IP registration is a writeable database with no readers. Marketplace gives buyers + AI agents a place to come find what they can license."
        />
      </div>
    </section>
  );
}

function ComponentSketches() {
  const { ref, revealed } = useReveal<HTMLDivElement>();
  return (
    <section
      id="components"
      ref={ref}
      data-revealed={revealed}
      className="ax-reveal mt-24"
    >
      <SectionHeader
        eyebrow="Components"
        title="What's actually doing the work."
        body="The handful of primitives that everything else composes from."
      />

      <div className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <ComponentCard
          name="encryption.ts"
          tagline="AES-256-GCM envelope"
          body="Encrypts bytes client-side before Shelby. Envelope = 4B magic + 12B nonce + ciphertext+16B tag. Keys never live in the envelope — they live on Story under CDR."
        />
        <ComponentCard
          name="memoryPack.ts"
          tagline="Dataset container"
          body="JSON `.memory` format. Manifest + paragraph-chunked content + optional embeddings. The unit the AI Memory Hub stores, encrypts, licenses, and queries against."
        />
        <ComponentCard
          name="story.ts + SPG"
          tagline="Programmable IP"
          body="Per-wallet ERC-721 collection on Story Aeneid. Each file registers as an IP Asset within it. License terms + royalty splits attach to the IP, travel with derivatives."
        />
        <ComponentCard
          name="aptbox::registry"
          tagline="Move provenance"
          body="Single resource on Aptos. Stores `content_hash`, `shelby_cid`, `mime_type`, `access_type`, `whitelist`, `flag_count`. The canonical pointer between bytes and IP."
        />
        <ComponentCard
          name="MarketCard"
          tagline="Dense card UI"
          body="Polymarket-style card with category chip, primary offer row, LIVE pulse, bookmark. Same component will eventually render IP licenses, memory packs, prompt packs."
        />
        <ComponentCard
          name="CategoryIcon + brand"
          tagline="Visual identity"
          body="Hand-crafted SVG icons inheriting `currentColor`. Brand tokens in `lib/brand.ts` cite each protocol's official kit so colors never drift."
        />
      </div>
    </section>
  );
}

function WhyWeBuilt() {
  const { ref, revealed } = useReveal<HTMLDivElement>();
  return (
    <section
      id="why"
      ref={ref}
      data-revealed={revealed}
      className="ax-reveal mt-24"
    >
      <SectionHeader
        eyebrow="Why"
        title="The thesis."
        body="Storage networks have been talking about ownership for a decade. Almost none have programmable ownership at the file level. We started here."
      />

      <div className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <ThesisCard
          n="1"
          title="Files are IP"
          body="A research paper, a model weight file, a song — all programmable IP if the rails exist. Story provides those rails."
        />
        <ThesisCard
          n="2"
          title="Storage isn't enough"
          body="Shelby gets the bytes verified. But verified bytes you can't monetize, license, or revoke are just S3 with extra steps."
        />
        <ThesisCard
          n="3"
          title="Privacy is composable"
          body="CDR lets encrypted data carry programmable access rules — read by AI agents, paid for, time-limited, revocable. That's the unlock."
        />
      </div>

      <div className="mt-10 rounded-2xl border border-white/10 bg-gradient-to-br from-violet-500/[0.06] to-orange-500/[0.04] p-6">
        <p className="text-base leading-relaxed text-zinc-200 sm:text-lg">
          aptbox is the layer where creators say{" "}
          <span className="ax-underline-wrap relative font-semibold text-violet-200">
            "this is mine, here are the rules"
            <span className="ax-underline absolute inset-x-0 -bottom-0.5 h-[2px] bg-violet-400" />
          </span>
          {" "}— and the rules actually travel with the file. Bytes go to Shelby.
          Ownership and licensing go to Story. Provenance anchors on Aptos.
          Privacy and dynamic policy come from CDR. One UX. One creator wallet.
          One trail of receipts.
        </p>
      </div>
    </section>
  );
}

function Closing() {
  const { ref, revealed } = useReveal<HTMLDivElement>();
  return (
    <section
      ref={ref}
      data-revealed={revealed}
      className="ax-reveal mt-24 text-center"
    >
      <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
        Ready to publish?
      </h2>
      <p className="mx-auto mt-3 max-w-xl text-sm text-zinc-400 sm:text-base">
        Connect a wallet, upload a file, register as IP, mint a memory pack.
        Each step is its own card and each card lives in its own page above.
      </p>
      <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
        <Link
          href="/upload"
          className="rounded-full bg-violet-600 px-6 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-violet-500"
        >
          Upload a file
        </Link>
        <Link
          href="/ai-memory/new"
          className="rounded-full border border-white/15 bg-white/[0.04] px-6 py-2.5 text-sm font-medium text-zinc-200 transition hover:border-violet-500/40 hover:bg-violet-500/10"
        >
          Create a memory pack
        </Link>
      </div>
    </section>
  );
}

/* ---------------- Reusable pieces ---------------- */

function SectionHeader({
  eyebrow,
  title,
  body,
}: {
  eyebrow: string;
  title: string;
  body?: string;
}) {
  return (
    <div className="max-w-3xl">
      <div className="text-[11px] font-semibold uppercase tracking-wider text-violet-300">
        {eyebrow}
      </div>
      <h2 className="mt-2 text-2xl font-semibold tracking-tight sm:text-4xl">
        <Words text={title} />
      </h2>
      {body && (
        <p className="mt-3 text-sm leading-relaxed text-zinc-400 sm:text-base">
          {body}
        </p>
      )}
    </div>
  );
}

function Words({ text }: { text: string }) {
  const parts = text.split(" ");
  return (
    <span>
      {parts.map((word, i) => (
        <span
          key={`${word}-${i}`}
          className="ax-word"
          style={{ ["--ax-word-index" as string]: i }}
        >
          {word}
          {i < parts.length - 1 ? " " : ""}
        </span>
      ))}
    </span>
  );
}

function TrinityCard({
  accent,
  logo,
  title,
  role,
  bullets,
}: {
  accent: "orange" | "cyan" | "violet";
  logo: React.ReactNode;
  title: string;
  role: string;
  bullets: string[];
}) {
  const ring =
    accent === "orange"
      ? "ring-orange-500/30 hover:border-orange-500/40"
      : accent === "cyan"
        ? "ring-[#1380F5]/30 hover:border-[#1380F5]/40"
        : "ring-violet-500/30 hover:border-violet-500/40";
  const titleColor =
    accent === "orange"
      ? "text-orange-300"
      : accent === "cyan"
        ? "text-[#41B5FF]"
        : "text-violet-300";
  return (
    <div
      className={`group ax-card relative flex flex-col gap-4 p-5 ring-1 transition hover:bg-white/[0.05] ${ring}`}
    >
      <div className="flex items-center gap-2">
        {logo}
        <div>
          <div className={`text-base font-semibold ${titleColor}`}>{title}</div>
          <div className="text-[11px] uppercase tracking-wider text-zinc-500">
            {role}
          </div>
        </div>
      </div>
      <ul className="space-y-2 text-sm text-zinc-300">
        {bullets.map((b, i) => (
          <li key={i} className="flex gap-2">
            <span
              className={`mt-1.5 inline-block h-1.5 w-1.5 shrink-0 rounded-full ${
                accent === "orange"
                  ? "bg-orange-400"
                  : accent === "cyan"
                    ? "bg-[#41B5FF]"
                    : "bg-violet-400"
              }`}
            />
            <span>{b}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Animated 3-node flow: Shelby → Aptos → Story, with drawn-in lines. */
function FlowDiagram() {
  return (
    <div className="ax-card relative overflow-hidden p-6 sm:p-8">
      <div className="mb-4 flex items-baseline justify-between">
        <div className="text-[11px] font-semibold uppercase tracking-wider text-violet-300">
          End-to-end flow
        </div>
        <div className="text-[11px] text-zinc-500">
          Upload → Encrypt → Anchor → Mint → List
        </div>
      </div>

      <svg
        viewBox="0 0 800 220"
        className="h-auto w-full"
        preserveAspectRatio="xMidYMid meet"
      >
        <defs>
          <linearGradient id="flow-grad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#ff7a14" />
            <stop offset="50%" stopColor="#a78bfa" />
            <stop offset="100%" stopColor="#1380F5" />
          </linearGradient>
        </defs>

        {/* Connecting line, drawn-in on reveal */}
        <path
          d="M120,110 L680,110"
          fill="none"
          stroke="url(#flow-grad)"
          strokeWidth="2"
          strokeLinecap="round"
          className="ax-draw"
        />

        {/* Tick marks for stages */}
        {[260, 400, 540].map((x, i) => (
          <line
            key={x}
            x1={x}
            y1={102}
            x2={x}
            y2={118}
            stroke="rgba(255,255,255,0.25)"
            strokeWidth="1"
            className={`ax-draw ax-draw-delay-${i + 1}`}
          />
        ))}

        {/* Nodes */}
        <FlowNode
          cx={120}
          cy={110}
          color="#ff7a14"
          label="Shelby"
          sub="Storage"
        />
        <FlowNode
          cx={400}
          cy={110}
          color="#a78bfa"
          label="Aptos"
          sub="Provenance"
        />
        <FlowNode
          cx={680}
          cy={110}
          color="#1380F5"
          label="Story"
          sub="IP + License"
        />

        {/* Stage labels along the line */}
        <FlowStage cx={260} label="Encrypt" />
        <FlowStage cx={540} label="Mint" />
      </svg>

      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[11px] text-zinc-500">
        <span>
          AES-256-GCM bytes flow left-to-right; the decryption key never touches
          this path — it&apos;s sealed via CDR alongside the Story IP record.
        </span>
      </div>
    </div>
  );
}

function FlowNode({
  cx,
  cy,
  color,
  label,
  sub,
}: {
  cx: number;
  cy: number;
  color: string;
  label: string;
  sub: string;
}) {
  return (
    <g>
      {/* glow ring */}
      <circle
        cx={cx}
        cy={cy}
        r="22"
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        opacity="0.35"
      />
      <circle
        cx={cx}
        cy={cy}
        r="12"
        fill={color}
        opacity="0.18"
        stroke={color}
        strokeWidth="2"
      />
      <text
        x={cx}
        y={cy - 36}
        textAnchor="middle"
        className="fill-zinc-100 text-[13px] font-semibold"
      >
        {label}
      </text>
      <text
        x={cx}
        y={cy + 46}
        textAnchor="middle"
        className="fill-zinc-500 text-[10px] uppercase tracking-wider"
      >
        {sub}
      </text>
    </g>
  );
}

function FlowStage({ cx, label }: { cx: number; label: string }) {
  return (
    <text
      x={cx}
      y={88}
      textAnchor="middle"
      className="fill-zinc-400 text-[11px] font-medium uppercase tracking-wider"
    >
      {label}
    </text>
  );
}

function StackLayer({
  label,
  sub,
  tint,
}: {
  label: string;
  sub: string;
  tint: "violet" | "orange" | "cyan" | "emerald";
}) {
  const dot =
    tint === "orange"
      ? "bg-orange-400"
      : tint === "cyan"
        ? "bg-[#41B5FF]"
        : tint === "emerald"
          ? "bg-emerald-400"
          : "bg-violet-400";
  const accent =
    tint === "orange"
      ? "from-orange-500/[0.04]"
      : tint === "cyan"
        ? "from-[#1380F5]/[0.04]"
        : tint === "emerald"
          ? "from-emerald-500/[0.04]"
          : "from-violet-500/[0.04]";
  return (
    <div
      className={`flex items-center gap-4 rounded-xl border border-white/5 bg-gradient-to-r ${accent} to-transparent p-4 transition hover:border-white/15`}
    >
      <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${dot}`} />
      <div className="min-w-0">
        <div className="text-sm font-semibold text-zinc-100">{label}</div>
        <div className="truncate text-xs text-zinc-500">{sub}</div>
      </div>
    </div>
  );
}

function PageCard({
  icon,
  name,
  href,
  tag,
  what,
  how,
  why,
}: {
  icon: React.ReactNode;
  name: string;
  href: string;
  tag: string;
  what: string;
  how: string;
  why: string;
}) {
  return (
    <div className="ax-card ax-card-hover p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-500/10 text-violet-300 ring-1 ring-violet-500/25">
            {icon}
          </span>
          <div>
            <Link
              href={href}
              className="text-base font-semibold text-zinc-100 hover:text-violet-200"
            >
              {name}
            </Link>
            <div className="text-[11px] uppercase tracking-wider text-zinc-500">
              {tag}
            </div>
          </div>
        </div>
        <Link
          href={href}
          className="rounded-md border border-white/10 bg-white/[0.03] px-2.5 py-1 text-[11px] font-medium text-zinc-300 hover:bg-white/[0.06]"
        >
          Open →
        </Link>
      </div>

      <dl className="mt-4 space-y-3 text-sm text-zinc-300">
        <Row k="What" v={what} />
        <Row k="How" v={how} />
        <Row k="Why" v={why} />
      </dl>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="grid grid-cols-[60px_1fr] gap-3 sm:grid-cols-[72px_1fr]">
      <dt className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
        {k}
      </dt>
      <dd className="leading-relaxed text-zinc-300">{v}</dd>
    </div>
  );
}

function ComponentCard({
  name,
  tagline,
  body,
}: {
  name: string;
  tagline: string;
  body: string;
}) {
  return (
    <div className="ax-card ax-card-hover p-4">
      <div className="flex items-baseline justify-between gap-2">
        <code className="font-mono text-xs text-violet-300">{name}</code>
        <span className="text-[10px] uppercase tracking-wider text-zinc-500">
          {tagline}
        </span>
      </div>
      <p className="mt-2 text-sm leading-relaxed text-zinc-300">{body}</p>
    </div>
  );
}

function ThesisCard({
  n,
  title,
  body,
}: {
  n: string;
  title: string;
  body: string;
}) {
  return (
    <div className="ax-card relative p-5">
      <div className="text-xs font-mono text-violet-400/60">0{n}</div>
      <h3 className="mt-1 text-base font-semibold text-zinc-100">{title}</h3>
      <p className="mt-2 text-sm leading-relaxed text-zinc-400">{body}</p>
    </div>
  );
}

/* ---------------- Ambient backdrop ---------------- */

function Backdrop() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      {/* Dotted texture */}
      <div
        className="absolute inset-0 opacity-40"
        style={{
          backgroundImage:
            "radial-gradient(circle at 1.5px 1.5px, rgba(167,139,250,0.12) 1px, transparent 0)",
          backgroundSize: "22px 22px",
        }}
      />
      {/* Trinity glows */}
      <div
        className="ax-anim-blob absolute -top-32 -left-24 h-[28rem] w-[28rem] rounded-full blur-3xl"
        style={{ backgroundColor: "rgba(255, 122, 20, 0.06)" }}
      />
      <div
        className="ax-anim-blob absolute top-1/3 right-[-10%] h-[26rem] w-[26rem] rounded-full blur-3xl"
        style={{
          backgroundColor: "rgba(19, 128, 245, 0.06)",
          animationDelay: "2s",
        }}
      />
      <div
        className="ax-anim-blob absolute bottom-[-10%] left-1/3 h-[24rem] w-[24rem] rounded-full blur-3xl"
        style={{
          backgroundColor: "rgba(139, 92, 246, 0.07)",
          animationDelay: "4s",
        }}
      />
    </div>
  );
}
