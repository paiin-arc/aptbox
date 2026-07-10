"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useWallet } from "@aptos-labs/wallet-adapter-react";
import { ConnectWalletButton } from "@/components/ConnectWalletButton";
import { NetworkSwitcher } from "@/components/NetworkSwitcher";
import { AptboxIcon } from "@/components/AptboxIcon";
import { SettingsIcon } from "@/components/CategoryIcon";
import { useNetwork, useNetworkController } from "@/lib/networkContext";
import {
  clearAllLocalData,
  clearBookmarks,
  clearDrafts,
  readLocalDataInventory,
  readSettings,
  resetSettings,
  SETTINGS_DEFAULTS,
  writeSettings,
  type AccessDefault,
  type LicenseDefault,
  type UserSettings,
  type LocalDataInventory,
} from "@/lib/userSettings";

const HOURS_OPTIONS = [
  { label: "1 hour", value: 1 },
  { label: "24 hours", value: 24 },
  { label: "7 days", value: 24 * 7 },
  { label: "30 days", value: 24 * 30 },
  { label: "90 days", value: 24 * 90 },
  { label: "1 year", value: 24 * 365 },
];

const ACCESS_OPTIONS: { label: string; value: AccessDefault; hint: string }[] = [
  { label: "Public", value: "public", hint: "Anyone with the link" },
  { label: "Paid", value: "paid", hint: "Pay once to unlock" },
  { label: "Whitelist", value: "whitelist", hint: "Specific wallets only" },
];

const LICENSE_OPTIONS: { label: string; value: LicenseDefault; hint: string }[] = [
  {
    label: "Non-commercial",
    value: "non-commercial",
    hint: "Free to use, no commercial rights.",
  },
  {
    label: "Commercial · no derivatives",
    value: "commercial-no-derivatives",
    hint: "Buyers can use commercially, no remixes.",
  },
  {
    label: "Commercial · remix OK",
    value: "commercial-remix",
    hint: "Buyers can use + derive, royalties flow back.",
  },
  {
    label: "All rights reserved",
    value: "all-rights",
    hint: "View only. No license granted on registration.",
  },
];

export default function SettingsPage() {
  const wallet = useWallet();
  const { account, connected } = wallet;
  const network = useNetwork();
  const { label: networkLabel } = useNetworkController();

  const [settings, setSettings] = useState<UserSettings>(SETTINGS_DEFAULTS);
  const [inventory, setInventory] = useState<LocalDataInventory>({
    bookmarks: 0,
    drafts: 0,
    uploadRecords: 0,
    ipRegistrations: 0,
  });
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [evmAddress, setEvmAddress] = useState<string | null>(null);

  useEffect(() => {
    setSettings(readSettings());
    setInventory(readLocalDataInventory());

    // Try to read injected EVM provider address (read-only — won't trigger prompt)
    const eth = (window as unknown as { ethereum?: { selectedAddress?: string } })
      .ethereum;
    if (eth?.selectedAddress) setEvmAddress(eth.selectedAddress);
  }, []);

  function update<K extends keyof UserSettings>(key: K, value: UserSettings[K]) {
    const next = { ...settings, [key]: value };
    setSettings(next);
    writeSettings({ [key]: value });
    setSavedAt(Date.now());
  }

  function handleClear(label: string, fn: () => void) {
    if (!confirm(`Clear ${label}? This only removes data from this browser.`))
      return;
    fn();
    setInventory(readLocalDataInventory());
  }

  function handleResetSettings() {
    if (!confirm("Reset all preferences to defaults?")) return;
    setSettings(resetSettings());
    setSavedAt(Date.now());
  }

  function handleNuke() {
    if (
      !confirm(
        "Wipe ALL aptbox local data — settings, bookmarks, drafts, upload records, IP registrations? Your wallets and on-chain data are untouched. This cannot be undone."
      )
    )
      return;
    clearAllLocalData();
    setSettings(SETTINGS_DEFAULTS);
    setInventory(readLocalDataInventory());
    setSavedAt(Date.now());
  }

  const royaltyPct = (settings.defaultRoyaltyBps / 100).toFixed(1);

  return (
    <div className="flex min-h-screen flex-col bg-black text-zinc-100">
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

      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-10 sm:px-6 sm:py-14">
        {/* Hero */}
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-wider text-violet-300">
              <SettingsIcon className="h-4 w-4" />
              <span>Settings</span>
            </div>
            <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
              Identity, defaults, wallet.
            </h1>
            <p className="max-w-2xl text-sm text-zinc-400">
              Defaults applied to new uploads + IP registrations. Per-asset
              overrides still work — change anything per-file at upload time.
            </p>
          </div>
          {savedAt && (
            <span className="text-[11px] text-emerald-400">
              Saved · {timeAgo(savedAt)}
            </span>
          )}
        </div>

        {/* Identity */}
        <Section title="Creator profile" eyebrow="Identity">
          <Field label="Display name" hint="Shown on marketplace listings">
            <input
              type="text"
              value={settings.displayName}
              onChange={(e) => update("displayName", e.target.value)}
              placeholder={
                account ? `${account.address.toString().slice(0, 8)}…` : "Your name"
              }
              maxLength={64}
              className={INPUT_CLS}
            />
          </Field>
          <Field label="Bio" hint="A line about your work">
            <textarea
              value={settings.bio}
              onChange={(e) => update("bio", e.target.value)}
              rows={2}
              maxLength={280}
              placeholder="Independent researcher publishing peer-reviewed neuro datasets."
              className={INPUT_CLS}
            />
            <div className="mt-1 text-right text-[10px] text-zinc-500">
              {settings.bio.length}/280
            </div>
          </Field>
        </Section>

        {/* Upload defaults */}
        <Section title="Upload defaults" eyebrow="New uploads">
          <Field
            label="Default access"
            hint="Selected automatically on the upload page"
          >
            <div className="grid grid-cols-3 gap-2">
              {ACCESS_OPTIONS.map((o) => (
                <button
                  key={o.value}
                  type="button"
                  onClick={() => update("defaultAccess", o.value)}
                  className={CHIP_CLS(settings.defaultAccess === o.value)}
                >
                  <div className="font-medium">{o.label}</div>
                  <div className="mt-0.5 text-[10px] opacity-70">{o.hint}</div>
                </button>
              ))}
            </div>
          </Field>

          <Field label="Default expiration">
            <select
              value={settings.defaultExpirationHours}
              onChange={(e) =>
                update("defaultExpirationHours", Number(e.target.value))
              }
              className={INPUT_CLS}
            >
              {HOURS_OPTIONS.map((o) => (
                <option key={o.value} value={o.value} className="bg-zinc-900">
                  {o.label}
                </option>
              ))}
            </select>
          </Field>

          <Toggle
            label="Encrypt private uploads"
            hint="Once CDR is wired, all non-public uploads encrypt by default"
            value={settings.encryptByDefault}
            onChange={(v) => update("encryptByDefault", v)}
          />
        </Section>

        {/* License defaults */}
        <Section title="License defaults" eyebrow="Story Protocol">
          <Field label="Default license type">
            <div className="space-y-1.5">
              {LICENSE_OPTIONS.map((o) => (
                <button
                  key={o.value}
                  type="button"
                  onClick={() => update("defaultLicense", o.value)}
                  className={`w-full rounded-lg border px-3 py-2 text-left text-sm transition ${
                    settings.defaultLicense === o.value
                      ? "border-violet-500/40 bg-violet-500/10 text-violet-100"
                      : "border-white/5 bg-white/[0.02] text-zinc-300 hover:bg-white/[0.05]"
                  }`}
                >
                  <div className="font-medium">{o.label}</div>
                  <div className="mt-0.5 text-[11px] text-zinc-500">{o.hint}</div>
                </button>
              ))}
            </div>
          </Field>

          <Field
            label="Default royalty"
            hint="Applied when license type allows commercial use"
          >
            <div className="space-y-2">
              <input
                type="range"
                min={0}
                max={2500}
                step={50}
                value={settings.defaultRoyaltyBps}
                onChange={(e) =>
                  update("defaultRoyaltyBps", Number(e.target.value))
                }
                className="w-full accent-violet-500"
              />
              <div className="flex items-center justify-between text-[11px] text-zinc-400">
                <span>0%</span>
                <span className="font-semibold text-violet-300">
                  {royaltyPct}%
                </span>
                <span>25%</span>
              </div>
            </div>
          </Field>
        </Section>

        {/* Notifications */}
        <Section title="Notifications" eyebrow="Coming soon · placeholder">
          <Toggle
            label="Email me when someone licenses my IP"
            hint="Email pipeline not wired yet"
            value={settings.notifyOnLicense}
            onChange={(v) => update("notifyOnLicense", v)}
          />
          <Toggle
            label="Email me when royalties land"
            hint="Triggers on Story royalty events"
            value={settings.notifyOnRoyalty}
            onChange={(v) => update("notifyOnRoyalty", v)}
          />
        </Section>

        {/* Wallets */}
        <Section title="Connected wallets" eyebrow="Identity">
          <WalletRow
            label="Aptos"
            tint="violet"
            connected={connected}
            address={account?.address.toString()}
            hint="Used for Shelby storage + aptbox::registry"
          />
          <WalletRow
            label="EVM (Story)"
            tint="cyan"
            connected={Boolean(evmAddress)}
            address={evmAddress}
            hint="Used for SPG NFT collection + IP registration"
          />
          <div className="rounded-lg border border-white/5 bg-white/[0.02] p-3 text-[11px] text-zinc-500">
            Active network: <span className="font-medium text-zinc-300">
              {networkLabel(network)}
            </span>
            . Change in the top-right network switcher.
          </div>
        </Section>

        {/* Local data */}
        <Section title="Local data" eyebrow="This browser">
          <InventoryRow
            label="Bookmarks"
            count={inventory.bookmarks}
            onClear={() =>
              handleClear("all bookmarks", () => {
                clearBookmarks();
              })
            }
          />
          <InventoryRow
            label="Memory pack drafts"
            count={inventory.drafts}
            onClear={() =>
              handleClear("all drafts", () => {
                clearDrafts();
              })
            }
          />
          <InventoryRow
            label="Upload records"
            count={inventory.uploadRecords}
            hint="Recently-uploaded files in the sidebar"
          />
          <InventoryRow
            label="IP registrations cache"
            count={inventory.ipRegistrations}
            hint="On-chain — clearing here only resets the cache"
          />
        </Section>

        {/* Danger zone */}
        <section className="mt-10">
          <h2 className="text-[11px] font-semibold uppercase tracking-wider text-red-400">
            Danger zone
          </h2>
          <div className="mt-3 space-y-2 rounded-2xl border border-red-500/30 bg-red-500/[0.04] p-4">
            <DangerRow
              label="Reset preferences"
              hint="Settings only — bookmarks, drafts, and upload records are untouched."
              actionLabel="Reset"
              onClick={handleResetSettings}
            />
            <DangerRow
              label="Wipe all local data"
              hint="Settings, bookmarks, drafts, upload records, IP cache. Wallets and on-chain data are untouched."
              actionLabel="Wipe"
              destructive
              onClick={handleNuke}
            />
          </div>
        </section>
      </main>
    </div>
  );
}

/* ---------------- Reusable subcomponents ---------------- */

function Section({
  title,
  eyebrow,
  children,
}: {
  title: string;
  eyebrow: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-10">
      <div className="text-[11px] font-semibold uppercase tracking-wider text-violet-300">
        {eyebrow}
      </div>
      <h2 className="mt-1 text-lg font-semibold text-zinc-100">{title}</h2>
      <div className="ax-card mt-3 space-y-4 p-5">{children}</div>
    </section>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <label className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
          {label}
        </label>
        {hint && <span className="text-[10px] text-zinc-500">{hint}</span>}
      </div>
      {children}
    </div>
  );
}

function Toggle({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint?: string;
  value: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-3 rounded-lg border border-white/5 bg-white/[0.02] px-3 py-3 transition hover:border-white/15">
      <div className="min-w-0 flex-1">
        <div className="text-sm text-zinc-100">{label}</div>
        {hint && <div className="text-[11px] text-zinc-500">{hint}</div>}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={value}
        onClick={() => onChange(!value)}
        className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition ${
          value ? "bg-violet-600" : "bg-white/10"
        }`}
      >
        <span
          className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition ${
            value ? "translate-x-5" : "translate-x-0.5"
          }`}
        />
      </button>
    </label>
  );
}

function WalletRow({
  label,
  address,
  connected,
  hint,
  tint,
}: {
  label: string;
  address?: string | null;
  connected: boolean;
  hint: string;
  tint: "violet" | "cyan";
}) {
  const dot = tint === "cyan" ? "bg-[#41B5FF]" : "bg-violet-400";
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-white/5 bg-white/[0.02] p-3">
      <div className="flex min-w-0 items-center gap-3">
        <span className={`h-2 w-2 shrink-0 rounded-full ${dot}`} />
        <div className="min-w-0">
          <div className="text-sm font-medium text-zinc-100">{label}</div>
          <div className="text-[11px] text-zinc-500">{hint}</div>
        </div>
      </div>
      <div className="shrink-0 text-right">
        {connected && address ? (
          <code className="font-mono text-[11px] text-zinc-300">
            {address.slice(0, 6)}…{address.slice(-4)}
          </code>
        ) : (
          <span className="text-[11px] text-zinc-500">Not connected</span>
        )}
      </div>
    </div>
  );
}

function InventoryRow({
  label,
  count,
  hint,
  onClear,
}: {
  label: string;
  count: number;
  hint?: string;
  onClear?: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-white/5 bg-white/[0.02] p-3">
      <div className="min-w-0">
        <div className="text-sm font-medium text-zinc-100">
          {label} <span className="font-mono text-xs text-zinc-500">· {count}</span>
        </div>
        {hint && <div className="text-[11px] text-zinc-500">{hint}</div>}
      </div>
      {onClear && (
        <button
          type="button"
          onClick={onClear}
          disabled={count === 0}
          className="rounded-md border border-white/10 bg-white/[0.03] px-2.5 py-1 text-xs font-medium text-zinc-300 transition hover:border-red-500/30 hover:bg-red-500/10 hover:text-red-300 disabled:opacity-40"
        >
          Clear
        </button>
      )}
    </div>
  );
}

function DangerRow({
  label,
  hint,
  actionLabel,
  onClick,
  destructive,
}: {
  label: string;
  hint: string;
  actionLabel: string;
  onClick: () => void;
  destructive?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-red-500/20 bg-black/40 p-3">
      <div className="min-w-0">
        <div className="text-sm font-medium text-zinc-100">{label}</div>
        <div className="text-[11px] text-zinc-500">{hint}</div>
      </div>
      <button
        type="button"
        onClick={onClick}
        className={`shrink-0 rounded-md px-3 py-1.5 text-xs font-semibold transition ${
          destructive
            ? "bg-red-600 text-white hover:bg-red-500"
            : "border border-red-500/40 bg-red-500/10 text-red-200 hover:bg-red-500/20"
        }`}
      >
        {actionLabel}
      </button>
    </div>
  );
}

const INPUT_CLS =
  "w-full rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-violet-500/50 focus:bg-white/[0.05] focus:outline-none focus:ring-2 focus:ring-violet-500/20";

function CHIP_CLS(active: boolean) {
  return `rounded-lg border px-3 py-2.5 text-left text-xs transition active:scale-[0.98] ${
    active
      ? "border-violet-500/40 bg-violet-500/10 text-violet-100"
      : "border-white/5 bg-white/[0.02] text-zinc-300 hover:bg-white/[0.05]"
  }`;
}

function timeAgo(ms: number): string {
  const diff = Date.now() - ms;
  if (diff < 5_000) return "just now";
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  return `${hr}h ago`;
}
