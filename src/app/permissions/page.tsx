import { StubPage } from "@/components/StubPage";

export default function PermissionsPage() {
  return (
    <StubPage
      eyebrow="Permissions"
      title="Programmable access control."
      description="Decide who can read, train on, derive from, or commercially use each asset — and revoke access any time. Permissions are enforced on-chain and travel with the file."
      bullets={[
        "Per-file toggles: public, private, AI training, commercial rights, derivative rights.",
        "Allow-list specific wallets or token holders without spinning up groups.",
        "Time-boxed access — links that expire on a schedule.",
        "Revoke any grant in one signature; previous downloads can't continue.",
      ]}
      metrics={[
        { label: "Private", value: "—" },
        { label: "AI-allowed", value: "—", accent: "ai" },
        { label: "Commercial", value: "—", accent: "licensed" },
        { label: "Revocable links", value: "—" },
      ]}
      actions={[
        { label: "Configure a file", href: "/", primary: true },
        { label: "Share secure link", href: "/upload" },
      ]}
    />
  );
}
