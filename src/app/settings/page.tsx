import { StubPage } from "@/components/StubPage";

export default function SettingsPage() {
  return (
    <StubPage
      eyebrow="Settings"
      title="Identity, defaults, and wallet."
      description="Configure your creator identity, default license terms, payout wallets, and network preferences. Settings here are the defaults applied to new uploads — everything is still per-asset overridable."
      bullets={[
        "Creator profile — display name, bio, public links.",
        "Default upload settings — visibility, expiration, license type.",
        "Connected wallets and payout preferences.",
        "Network defaults (shelbynet, testnet) and API keys.",
      ]}
      actions={[{ label: "Back to Workspace", href: "/", primary: true }]}
    />
  );
}
