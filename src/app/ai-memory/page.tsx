import { StubPage } from "@/components/StubPage";

export default function AiMemoryHubPage() {
  return (
    <StubPage
      eyebrow="AI Memory Hub"
      title="Package and license intelligence."
      description="Upload memory datasets, agent context, workflows, and prompt packs as first-class, verifiable assets. Other agents and creators can license them — you get attribution and revenue every time they're used."
      bullets={[
        ".memory, .agent, .workflow, .promptpack, .dataset — supported as first-class types.",
        "Verifiable provenance: every memory pack ships with its creator wallet and content hash.",
        "License usage per query, per agent, or per organization.",
        "Royalty splits when your pack is bundled into a larger module.",
      ]}
      metrics={[
        { label: "Memory packs", value: "—", accent: "ai" },
        { label: "Agents using", value: "—", accent: "ai" },
        { label: "Queries this month", value: "—" },
        { label: "Revenue", value: "—", accent: "royalty" },
      ]}
      actions={[
        { label: "Upload memory pack", href: "/upload", primary: true },
        { label: "Browse marketplace", href: "/marketplace" },
      ]}
    />
  );
}
