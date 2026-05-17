import { StubPage } from "@/components/StubPage";

export default function VerifiedStoragePage() {
  return (
    <StubPage
      eyebrow="Verified Storage"
      title="Trust infrastructure for your data."
      description="Files in aptbox are stored on Shelby — a decentralized storage network with cryptographic verification, replication, and proof of retrieval. This page exposes that trust surface so you can see exactly how your data is being held."
      bullets={[
        "Replication across storage providers — no single point of failure.",
        "Continuous proof of retrieval — verifiable that the bytes are still there.",
        "Encryption at rest, with per-file expiration controls.",
        "Verification logs you can audit any time.",
      ]}
      metrics={[
        { label: "Availability", value: "98.9%", accent: "verified" },
        { label: "Replication", value: "3×", accent: "verified" },
        { label: "Proof status", value: "Verified", accent: "verified" },
        { label: "Encryption", value: "AES-256", accent: "licensed" },
      ]}
      actions={[
        { label: "Upload to verified storage", href: "/upload", primary: true },
        { label: "View pending blobs", href: "/cleanup" },
      ]}
    />
  );
}
