import { StubPage } from "@/components/StubPage";

export default function MonetizePage() {
  return (
    <StubPage
      eyebrow="Monetize"
      title="Turn your data into revenue."
      description="Set license terms, charge for API access, split royalties with collaborators, and track every dollar back to source. Your files don't have to live behind a free download link — they can be a revenue stream."
      bullets={[
        "Per-file license types: free, paid unlock, subscription, or API access.",
        "Royalty splits paid out automatically to collaborator wallets.",
        "Track downloads, AI agent usage, and API calls in one dashboard.",
        "Payouts in APT or ShelbyUSD — no payment processor needed.",
      ]}
      metrics={[
        { label: "Active licenses", value: "—", accent: "licensed" },
        { label: "Royalties paid", value: "—", accent: "royalty" },
        { label: "Subscriptions", value: "—" },
        { label: "AI usage", value: "—", accent: "ai" },
      ]}
      actions={[
        { label: "Register IP first", href: "/ip-vault", primary: true },
        { label: "See pricing examples", href: "/marketplace" },
      ]}
    />
  );
}
