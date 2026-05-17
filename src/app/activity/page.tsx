import { StubPage } from "@/components/StubPage";

export default function ActivityPage() {
  return (
    <StubPage
      eyebrow="Activity"
      title="Every event, every signature."
      description="A full feed of uploads, registrations, license grants, royalty payouts, and access events. Filterable, exportable, and anchored to on-chain transactions."
      bullets={[
        "Uploads, IP registrations, license grants, and revocations in one timeline.",
        "Royalty payouts and revenue events linked to the originating asset.",
        "Filter by network, asset, counterparty, or event type.",
        "Every entry links to its on-chain transaction for independent verification.",
      ]}
      actions={[{ label: "Back to Workspace", href: "/", primary: true }]}
    />
  );
}
