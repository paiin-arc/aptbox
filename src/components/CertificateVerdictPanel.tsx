import type { CertificateCheck, CertificateVerdictState } from "@/lib/provenance";

export type CertificateVerdict = {
  state: CertificateVerdictState;
  checks: CertificateCheck[];
  warnings: string[];
};

const SIGNATURE_CHECKS = new Set([
  "Structure & training-set commitment",
  "Integrity digest",
  "Signed message",
  "Signature",
  "Key owns signer address",
]);

function verdictHeadline(verdict: CertificateVerdict): string {
  if (verdict.state === "verified") return "Certificate verified";
  if (verdict.state === "failed") return "Certificate failed verification";
  const signatureOk = verdict.checks
    .filter((c) => SIGNATURE_CHECKS.has(c.label))
    .every((c) => c.status === "pass");
  return signatureOk
    ? "Signature valid · on-chain check unavailable"
    : "Could not fully verify: some checks couldn't run";
}

const ICON = { pass: "✓", fail: "✗", unavailable: "?", skip: "–" } as const;
const TONE = {
  pass: "text-emerald-700",
  fail: "text-red-700",
  unavailable: "text-amber-700",
  skip: "text-ink-subtle",
} as const;

export function CheckIcon({ status }: { status: CertificateCheck["status"] }) {
  return <span className={`w-3 shrink-0 font-bold ${TONE[status]}`}>{ICON[status]}</span>;
}

/** ✓ / ✗ / ? checklist with a three-state headline (verified / incomplete / failed). */
export function CertificateVerdictPanel({
  verdict,
  incompleteHint = "Re-issue the certificate to check again.",
}: {
  verdict: CertificateVerdict;
  incompleteHint?: string;
}) {
  const palette = {
    verified: { box: "border-emerald-500/30 bg-emerald-500/10", title: "text-emerald-800" },
    incomplete: { box: "border-amber-300 bg-amber-50", title: "text-amber-900" },
    failed: { box: "border-red-300 bg-red-50", title: "text-red-800" },
  }[verdict.state];
  return (
    <div className={`mt-3 rounded-lg border p-3 text-xs ${palette.box}`}>
      <div className={`font-semibold ${palette.title}`}>{verdictHeadline(verdict)}</div>
      {verdict.state === "incomplete" && (
        <div className="mt-1 text-amber-800">
          Nothing here indicates tampering. Some checks needed the network or a newer
          contract and couldn&apos;t run. {incompleteHint}
        </div>
      )}
      <ul className="mt-2 space-y-1">
        {verdict.checks.map((c, i) => (
          <li key={i} className="flex gap-2">
            <CheckIcon status={c.status} />
            <span>
              <span className="font-medium">{c.label}</span>
              {c.detail && <span className="text-ink-muted"> · {c.detail}</span>}
            </span>
          </li>
        ))}
      </ul>
      {verdict.warnings.map((w, i) => (
        <div key={i} className="mt-2 text-amber-800">
          ⚠ {w}
        </div>
      ))}
    </div>
  );
}
