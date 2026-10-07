"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AppBackdrop } from "@/components/AppBackdrop";
import { AptboxIcon } from "@/components/AptboxIcon";
import { ConnectWalletButton } from "@/components/ConnectWalletButton";
import { NetworkSwitcher } from "@/components/NetworkSwitcher";
import {
  CertificateVerdictPanel,
  CheckIcon,
} from "@/components/CertificateVerdictPanel";
import { formatBytes, sha256File } from "@/lib/crypto";
import { NETWORK_LABEL } from "@/lib/networks";
import { normalizeHashHex } from "@/lib/verify";
import {
  CERTIFICATE_HANDOFF_KEY,
  verifyCertificateFull,
  type FullCertificateVerification,
} from "@/lib/trainingSets";

type ModelCheck =
  | { phase: "idle" }
  | { phase: "hashing"; name: string; pct: number }
  | { phase: "done"; name: string; size: number; hex: string; match: boolean };

export default function VerifyCertificatePage() {
  const [text, setText] = useState("");
  const [result, setResult] = useState<FullCertificateVerification | null>(null);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [fromTrain, setFromTrain] = useState(false);
  const [model, setModel] = useState<ModelCheck>({ phase: "idle" });
  const fileRef = useRef<HTMLInputElement>(null);
  const modelRef = useRef<HTMLInputElement>(null);

  const verify = useCallback(async (input: string) => {
    setBusy(true);
    setModel({ phase: "idle" });
    try {
      setResult(await verifyCertificateFull(input));
    } finally {
      setBusy(false);
    }
  }, []);

  // Certificate handed off from /train ("Open in verifier"). Read once, then
  // clear it so a reload doesn't silently re-verify a stale certificate.
  useEffect(() => {
    const handed = sessionStorage.getItem(CERTIFICATE_HANDOFF_KEY);
    if (!handed) return;
    sessionStorage.removeItem(CERTIFICATE_HANDOFF_KEY);
    void Promise.resolve().then(() => {
      const pretty = JSON.stringify(JSON.parse(handed), null, 2);
      setText(pretty);
      setFromTrain(true);
      return verify(pretty);
    });
  }, [verify]);

  async function loadFile(file: File) {
    if (file.size > 1024 * 1024) {
      setResult({
        state: "failed",
        checks: [{ label: "Certificate format", status: "fail", detail: `${file.name} is ${formatBytes(file.size)}. Certificates are small JSON files. Did you mean to check a model file?` }],
        warnings: [],
        datasets: [],
      });
      return;
    }
    const content = await file.text();
    setText(content);
    setFromTrain(false);
    await verify(content);
  }

  async function checkModel(file: File) {
    const expected = result?.certificate?.modelHash;
    if (!expected) return;
    setModel({ phase: "hashing", name: file.name, pct: 0 });
    const { hex } = await sha256File(file, (p) => {
      if (p.totalBytes > 0) {
        setModel({ phase: "hashing", name: file.name, pct: Math.round((p.hashedBytes / p.totalBytes) * 100) });
      }
    });
    setModel({
      phase: "done",
      name: file.name,
      size: file.size,
      hex,
      match: hex === normalizeHashHex(expected),
    });
  }

  const cert = result?.certificate;
  const net = result?.network;

  return (
    <div className="relative flex min-h-dvh flex-col text-ink">
      <AppBackdrop />
      <header className="relative z-10 sticky top-0 flex w-full items-center justify-between border-b border-line bg-surface/80 px-4 py-3 backdrop-blur-md sm:px-6 sm:py-4">
        <Link href="/" className="flex items-center gap-2">
          <AptboxIcon className="h-8 w-8 text-ink" />
          <span className="text-lg font-semibold tracking-tight">Dataset Locker</span>
        </Link>
        <div className="flex items-center gap-1.5 sm:gap-2">
          <NetworkSwitcher />
          <ConnectWalletButton />
        </div>
      </header>

      <main className="relative z-10 mx-auto flex w-full max-w-3xl flex-1 flex-col gap-5 p-4 sm:p-6">
        <div>
          <div className="text-2xs font-semibold uppercase tracking-wider text-royal-deep">
            AI Training Provenance
          </div>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-ink sm:text-3xl">
            Verify a training certificate
          </h1>
          <p className="mt-2 text-sm text-ink-muted">
            Someone sent you a certificate claiming a model was trained on specific
            datasets? Check it here: the issuer&apos;s wallet signature, the training set
            on Aptos, and every dataset&apos;s SHA-256 in the registry. No wallet needed.
          </p>
        </div>

        <section
          className={`rounded-xl border-2 border-dashed p-4 shadow-sm transition ${
            dragging ? "border-royal bg-royal/5" : "border-line bg-surface-raised"
          }`}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            const f = e.dataTransfer.files?.[0];
            if (f) void loadFile(f);
          }}
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs font-medium text-ink-muted">
              Drop a certificate <code>.json</code> here, choose a file, or paste it below
            </span>
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="rounded-lg border border-line bg-surface px-3 py-1.5 text-xs font-medium hover:bg-surface-sunken"
            >
              Choose file
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void loadFile(f);
                e.target.value = "";
              }}
            />
          </div>
          <textarea
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              setFromTrain(false);
            }}
            spellCheck={false}
            placeholder='{ "version": 2, "certificateId": "aptbox-cert-…", … }'
            className="mt-3 h-40 w-full resize-y rounded-lg border border-line bg-surface p-3 font-mono text-2xs text-ink placeholder:text-ink-subtle"
          />
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => void verify(text)}
              disabled={busy || !text.trim()}
              className="rounded-lg bg-royal px-4 py-2 text-xs font-semibold text-surface hover:bg-royal-deep disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy ? "Verifying…" : "Verify certificate"}
            </button>
            {(text || result) && (
              <button
                type="button"
                onClick={() => {
                  setText("");
                  setResult(null);
                  setModel({ phase: "idle" });
                  setFromTrain(false);
                }}
                className="rounded-lg border border-line bg-surface px-3 py-2 text-xs font-medium text-ink-muted hover:bg-surface-sunken"
              >
                Clear
              </button>
            )}
            {fromTrain && (
              <span className="text-2xs text-ink-subtle">Loaded from the Train page.</span>
            )}
          </div>
        </section>

        {result && (
          <section className="rounded-xl border border-line bg-surface-raised p-4 shadow-sm">
            <div className="text-xs font-semibold uppercase tracking-wide text-royal-deep">
              Result
            </div>
            <CertificateVerdictPanel verdict={result} incompleteHint="Try again in a moment." />

            {cert && (
              <dl className="mt-4 grid gap-x-4 gap-y-2 text-xs sm:grid-cols-[auto_1fr]">
                <Row label="Model / run">{String(cert.modelRunId ?? "")}</Row>
                <Row label="Issued by" mono>{String(cert.signerAddress ?? "")}</Row>
                <Row label="Issued at">
                  {cert.createdAt ? new Date(cert.createdAt).toLocaleString() : "unknown"}
                </Row>
                <Row label="Network">
                  {net ? NETWORK_LABEL[net] : String(cert.network ?? "unknown")}
                </Row>
                <Row label="Training set" mono>{String(cert.trainingSetCommitment ?? "")}</Row>
                <Row label="Training-set tx" mono>
                  {cert.trainingSetTxHash ?? <span className="font-sans text-amber-800">none: not committed on-chain</span>}
                </Row>
                {cert.registryTxHash && <Row label="Registry tx" mono>{cert.registryTxHash}</Row>}
                <Row label="Model hash" mono>
                  {cert.modelHash ?? <span className="font-sans text-ink-subtle">not pinned</span>}
                </Row>
              </dl>
            )}
          </section>
        )}

        {result && result.datasets.length > 0 && (
          <section className="rounded-xl border border-line bg-surface-raised p-4 shadow-sm">
            <div className="text-xs font-semibold uppercase tracking-wide text-royal-deep">
              Datasets ({result.datasets.length})
            </div>
            <ul className="mt-3 space-y-2">
              {result.datasets.map((d, i) => (
                <li key={i} className="flex gap-2 rounded-lg border border-line bg-surface-sunken p-3 text-xs">
                  <CheckIcon status={d.status} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <span className="truncate font-semibold" title={d.shelbyCid}>
                        {d.shelbyCid.split("/").pop() || "(unnamed)"}
                      </span>
                      {d.fileId && net && d.status !== "skip" && (
                        <Link
                          href={`/f/${d.fileId}?n=${net}`}
                          className="shrink-0 text-2xs font-semibold text-royal hover:underline"
                        >
                          Open dataset #{d.fileId}
                        </Link>
                      )}
                    </div>
                    <div className="mt-1 break-all font-mono text-2xs text-ink-muted">
                      SHA-256 {d.datasetCommitment}
                    </div>
                    <div className="mt-1 text-ink-muted">{d.detail}</div>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}

        {cert && result?.state !== "failed" && (
          <section className="rounded-xl border border-line bg-surface-raised p-4 shadow-sm">
            <div className="text-xs font-semibold uppercase tracking-wide text-royal-deep">
              Check the model file (optional)
            </div>
            {cert.modelHash ? (
              <>
                <p className="mt-1 text-xs text-ink-muted">
                  The certificate pins a model hash. Drop the model weights you received to
                  confirm they&apos;re the same file. It&apos;s hashed in your browser and never uploaded.
                </p>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => modelRef.current?.click()}
                    disabled={model.phase === "hashing"}
                    className="rounded-lg border border-royal px-3 py-2 text-xs font-semibold text-royal-deep hover:bg-royal/10 disabled:opacity-50"
                  >
                    Choose model file
                  </button>
                  <input
                    ref={modelRef}
                    type="file"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) void checkModel(f);
                      e.target.value = "";
                    }}
                  />
                  {model.phase === "hashing" && (
                    <span className="text-xs text-ink-muted">
                      Hashing {model.name}… {model.pct}%
                    </span>
                  )}
                </div>
                {model.phase === "done" && (
                  <div
                    className={`mt-3 rounded-lg border p-3 text-xs ${
                      model.match
                        ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-900"
                        : "border-red-300 bg-red-50 text-red-900"
                    }`}
                  >
                    <div className="font-semibold">
                      {model.match
                        ? `✓ ${model.name} matches the certificate's model hash`
                        : `✗ ${model.name} is NOT the model this certificate describes`}
                    </div>
                    <div className="mt-1 break-all font-mono text-2xs">
                      {formatBytes(model.size)} · SHA-256 {model.hex}
                    </div>
                  </div>
                )}
              </>
            ) : (
              <p className="mt-1 text-xs text-ink-muted">
                This certificate doesn&apos;t pin a model hash, so there&apos;s no model file to
                check against. It only attests which datasets the run used.
              </p>
            )}
          </section>
        )}

        <section className="rounded-xl border border-line bg-surface-raised p-4 text-xs text-ink-muted shadow-sm">
          <div className="font-semibold text-ink">What a verified certificate proves, and what it doesn&apos;t</div>
          <ul className="mt-2 list-disc space-y-1 pl-4">
            <li>
              <strong>Proves</strong> the signer&apos;s wallet issued exactly this certificate:
              any edit breaks the signature.
            </li>
            <li>
              <strong>Proves</strong> the training set was committed on Aptos by that wallet,
              and each dataset is registered with the listed SHA-256.
            </li>
            <li>
              <strong>Does not prove</strong> the model was actually trained only on these
              datasets. That is the issuer&apos;s claim, now signed and attributable to them.
            </li>
          </ul>
          <div className="mt-2">
            Checking a single data file instead?{" "}
            <Link href="/verify" className="font-semibold text-royal hover:underline">
              Check a file →
            </Link>
          </div>
        </section>
      </main>
    </div>
  );
}

function Row({
  label,
  mono,
  children,
}: {
  label: string;
  mono?: boolean;
  children: React.ReactNode;
}) {
  return (
    <>
      <dt className="font-medium text-ink-subtle">{label}</dt>
      <dd className={`break-all ${mono ? "font-mono text-2xs" : ""}`}>{children}</dd>
    </>
  );
}
