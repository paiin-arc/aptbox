/**
 * Correctness gate for AI training provenance domain logic.
 *
 * Run: node --experimental-strip-types --disable-warning=MODULE_TYPELESS_PACKAGE_JSON scripts/verify-provenance.mts
 */
import { AccountAddress, Network } from "@aptos-labs/ts-sdk";
import {
  decryptAesGcm,
  encryptAesGcm,
  generateAesKey,
  sha256File,
} from "../src/lib/crypto.ts";
import {
  buildTrainingSet,
  createTrainingCertificate,
  normalizeShelbyActivities,
  verifyTrainingCertificate,
} from "../src/lib/provenance.ts";

let failures = 0;

function check(label: string, condition: boolean, detail?: unknown) {
  if (!condition) failures++;
  console.log(`${condition ? "pass" : "FAIL"}  ${label}`);
  if (!condition && detail != null) console.log(`        ${String(detail)}`);
}

async function rejects(label: string, fn: () => Promise<unknown>) {
  try {
    await fn();
    check(label, false, "expected rejection");
  } catch {
    check(label, true);
  }
}

const bytes = new TextEncoder().encode("aptbox provenance dataset");
const blob = new Blob([bytes]);
const accountAddress = AccountAddress.fromString(`0x${"0".repeat(61)}abc`);

console.log("\n-- encryption --");
const key = await generateAesKey();
check("AES key is 256-bit hex", /^[0-9a-f]{64}$/.test(key));
const encrypted1 = await encryptAesGcm(bytes, key);
const encrypted2 = await encryptAesGcm(bytes, key);
const decrypted = await decryptAesGcm(encrypted1, key);
check("round trip decrypts", new TextDecoder().decode(decrypted) === "aptbox provenance dataset");
check("random IV changes ciphertext", Buffer.compare(Buffer.from(encrypted1), Buffer.from(encrypted2)) !== 0);
check("ciphertext differs from plaintext", Buffer.compare(Buffer.from(encrypted1.slice(12, 12 + bytes.length)), Buffer.from(bytes)) !== 0);
await rejects("wrong key rejects", async () => {
  await decryptAesGcm(encrypted1, await generateAesKey());
});

console.log("\n-- original hash --");
const h1 = await sha256File(blob);
const h2 = await sha256File(blob);
check("original SHA-256 is stable", h1.hex === h2.hex);
check("original SHA-256 is 32 bytes", h1.bytes.length === 32);

console.log("\n-- training-set commitment --");
const datasetA = {
  fileId: "2",
  datasetCommitment: "a".repeat(64),
  shelbyCid: "aptbox/a.bin",
};
const datasetB = {
  fileId: "1",
  datasetCommitment: "b".repeat(64),
  shelbyCid: "aptbox/b.bin",
};
const set1 = await buildTrainingSet([datasetA, datasetB]);
const set2 = await buildTrainingSet([datasetB, datasetA]);
const set3 = await buildTrainingSet([
  datasetA,
  { ...datasetB, datasetCommitment: "c".repeat(64) },
]);
check("selection order does not change commitment", set1.commitment === set2.commitment);
check("different dataset changes commitment", set1.commitment !== set3.commitment);
await rejects("empty training set rejects", async () => buildTrainingSet([]));
await rejects("duplicate dataset rejects", async () => buildTrainingSet([datasetA, datasetA]));

console.log("\n-- certificate --");
const cert = await createTrainingCertificate({
  network: Network.SHELBYNET,
  signerAddress: "0xabc",
  modelRunId: "run-1",
  trainingSet: set1,
});
const verdict = await verifyTrainingCertificate(cert);
check("valid certificate verifies", verdict.ok);
const tampered = { ...cert, modelRunId: "run-2" };
const tamperedVerdict = await verifyTrainingCertificate(tampered);
check("tampered certificate rejects", !tamperedVerdict.ok);
const badDataset = {
  ...cert,
  datasets: [{ ...cert.datasets[0], datasetCommitment: "d".repeat(64) }],
};
const badDatasetVerdict = await verifyTrainingCertificate(badDataset);
check("modified dataset commitment rejects", !badDatasetVerdict.ok);
const badSet = { ...cert, trainingSetCommitment: "e".repeat(64) };
const badSetVerdict = await verifyTrainingCertificate(badSet);
check("modified training-set commitment rejects", !badSetVerdict.ok);
const badVersion = { ...cert, version: 99 };
const badVersionVerdict = await verifyTrainingCertificate(badVersion);
check("schema version rejects", !badVersionVerdict.ok);

console.log("\n-- activity normalization --");
const normalized = normalizeShelbyActivities([
  {
    type: "commit_object",
    eventType: "ObjectCommittedEvent",
    eventIndex: 0,
    transactionHash: "0x1",
    transactionVersion: 1,
    objectName: "@0xabc/aptbox/a.bin",
    owner: accountAddress,
    binding: { kind: "blob", blobUid: 1n },
    timestamp: "2026-01-01T00:00:00Z",
  },
  {
    type: "delete_object",
    eventType: "ObjectDeletedEvent",
    eventIndex: 1,
    transactionHash: "0x2",
    transactionVersion: 2,
    objectName: "@0xabc/aptbox/a.bin",
    owner: accountAddress,
    binding: { kind: "blob", blobUid: 1n },
    timestamp: "2026-01-01T00:00:01Z",
  },
]);
check("commit activity maps to pinned", normalized[0].category === "pinned");
check("delete activity maps to deleted", normalized[1].category === "deleted");
check("empty activity history normalizes", normalizeShelbyActivities([]).length === 0);

console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`}\n`);
process.exit(failures === 0 ? 0 : 1);
