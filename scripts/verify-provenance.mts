/**
 * Correctness gate for AI training provenance domain logic.
 *
 * Run: node --experimental-strip-types --disable-warning=MODULE_TYPELESS_PACKAGE_JSON scripts/verify-provenance.mts
 */
import { Account, AccountAddress, Network, SigningSchemeInput } from "@aptos-labs/ts-sdk";
import {
  DecryptionError,
  decryptAesGcm,
  encryptAesGcm,
  isWellFormedAesKey,
  generateAesKey,
  sha256File,
} from "../src/lib/crypto.ts";
import {
  attachCertificateSignature,
  buildKeyBackup,
  buildTrainingSet,
  certificateSigningMessage,
  certificateSigningNonce,
  certificateVerdictState,
  createTrainingCertificate,
  encryptionBadge,
  encryptionKeyId,
  normalizeShelbyActivities,
  parseKeyBackup,
  parseModelHashInput,
  shelbyObjectToActivity,
  verifyTrainingCertificate,
} from "../src/lib/provenance.ts";
import {
  compareTrainingSetToCertificate,
  verifyCertificateFull,
  verifyCertificateOnChain,
} from "../src/lib/trainingSets.ts";
import {
  decideForExistingSet,
  registryDatasetEntries,
  selectionEligibility,
} from "../src/lib/trainingSelection.ts";

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

// A single mistyped character must produce a friendly DecryptionError, not a
// raw OperationError (which the dev overlay surfaces as a crash).
const oneCharOff = key.slice(0, -1) + (key.endsWith("0") ? "1" : "0");
try {
  await decryptAesGcm(encrypted1, oneCharOff);
  check("one-character-off key rejects", false, "expected rejection");
} catch (e) {
  check("one-character-off key → DecryptionError(authentication-failed)",
    e instanceof DecryptionError && e.reason === "authentication-failed", (e as Error)?.name);
  check("…with a user-facing message", /doesn't unlock this dataset/.test((e as Error).message));
}
try {
  await decryptAesGcm(encrypted1, key.slice(0, 63));
  check("63-char key rejects", false, "expected rejection");
} catch (e) {
  check("63-char key → DecryptionError(malformed-key), says how many chars",
    e instanceof DecryptionError && e.reason === "malformed-key" && /has 63/.test((e as Error).message));
}
check("pasted key with 0x prefix and whitespace still decrypts",
  new TextDecoder().decode(await decryptAesGcm(encrypted1, `  0x${key}\n`)) === "aptbox provenance dataset");
check("isWellFormedAesKey accepts 0x/whitespace, rejects bad lengths",
  isWellFormedAesKey(` 0x${key} `) && !isWellFormedAesKey(key.slice(1)) && !isWellFormedAesKey("z".repeat(64)));

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

console.log("\n-- certificate signing --");

/** Simulates a wallet's AIP-62 signMessage: signs the UTF-8 full message. */
function walletSign(account: Account, message: string, nonce: string, address = account.accountAddress.toString()) {
  const fullMessage = `APTOS\naddress: ${address}\nmessage: ${message}\nnonce: ${nonce}`;
  return {
    fullMessage,
    nonce,
    signature: account.sign(new TextEncoder().encode(fullMessage)),
  };
}

async function issue(account: Account, overrides: Partial<Parameters<typeof createTrainingCertificate>[0]> = {}) {
  const unsigned = await createTrainingCertificate({
    network: Network.SHELBYNET,
    signerAddress: account.accountAddress.toString(),
    modelRunId: "run-1",
    trainingSet: set1,
    trainingSetTxHash: "0x" + "7".repeat(64),
    registryTxHash: "0x" + "8".repeat(64),
    ...overrides,
  });
  const out = walletSign(account, certificateSigningMessage(unsigned), certificateSigningNonce(unsigned));
  return attachCertificateSignature(unsigned, { publicKey: account.publicKey, ...out });
}

const legacy = Account.generate({ scheme: SigningSchemeInput.Ed25519, legacy: true });
const singleKey = Account.generate({ scheme: SigningSchemeInput.Ed25519, legacy: false });
const attacker = Account.generate({ scheme: SigningSchemeInput.Ed25519, legacy: true });

const cert = await issue(legacy);
const verdict = await verifyTrainingCertificate(cert);
check("signed certificate verifies (legacy Ed25519)", verdict.ok, JSON.stringify(verdict));
check("legacy key uses ed25519 scheme", cert.signature?.scheme === "ed25519");
const skCert = await issue(singleKey);
const skVerdict = await verifyTrainingCertificate(skCert);
check("signed certificate verifies (SingleKey account)", skVerdict.ok, JSON.stringify(skVerdict));
check("SingleKey uses single-key scheme", skCert.signature?.scheme === "single-key");
check("survives JSON round trip", (await verifyTrainingCertificate(JSON.parse(JSON.stringify(cert)))).ok);

console.log("\n-- certificate forgery --");
const unsigned = { ...cert, signature: undefined };
check("unsigned certificate rejects", !(await verifyTrainingCertificate(unsigned)).ok);
check("unsigned draft passes only when explicitly allowed",
  (await verifyTrainingCertificate(unsigned, { requireSignature: false })).ok);

check("edited body (digest NOT recomputed) rejects",
  !(await verifyTrainingCertificate({ ...cert, modelRunId: "run-2" })).ok);

// The attack the old scheme allowed: edit, recompute the digest, keep going.
const reDigested = await createTrainingCertificate({
  network: Network.SHELBYNET,
  signerAddress: legacy.accountAddress.toString(),
  modelRunId: "run-2-forged",
  trainingSet: set1,
});
const forged = { ...reDigested, signature: cert.signature };
const forgedVerdict = await verifyTrainingCertificate(forged);
check("edited body WITH recomputed digest rejects (signature no longer matches)", !forgedVerdict.ok);

check("injected trainingSetTxHash rejects",
  !(await verifyTrainingCertificate({ ...cert, trainingSetTxHash: "0x" + "9".repeat(64) })).ok);

// Attacker signs a certificate that claims the victim as signer.
const impersonation = await createTrainingCertificate({
  network: Network.SHELBYNET,
  signerAddress: legacy.accountAddress.toString(),
  modelRunId: "run-1",
  trainingSet: set1,
});
const impOut = walletSign(attacker, certificateSigningMessage(impersonation), certificateSigningNonce(impersonation), legacy.accountAddress.toString());
const impSigned = attachCertificateSignature(impersonation, { publicKey: attacker.publicKey, ...impOut });
const impVerdict = await verifyTrainingCertificate(impSigned);
check("attacker key claiming victim address rejects", !impVerdict.ok);
check("…and says the key doesn't own the address",
  impVerdict.checks.some((c) => c.label === "Key owns signer address" && c.status === "fail"), JSON.stringify(impVerdict.checks));

const otherCert = await issue(legacy, { modelRunId: "run-other" });
check("signature from another certificate rejects",
  !(await verifyTrainingCertificate({ ...cert, signature: otherCert.signature })).ok);

const wrongAddrOut = walletSign(legacy, certificateSigningMessage(cert), certificateSigningNonce(cert), attacker.accountAddress.toString());
check("signed-message address mismatch rejects",
  !(await verifyTrainingCertificate(attachCertificateSignature({ ...cert }, { publicKey: legacy.publicKey, ...wrongAddrOut }))).ok);

const garbledSig = { ...cert, signature: { ...cert.signature!, signature: "0x" + "00".repeat(64) } };
check("garbage signature bytes reject", !(await verifyTrainingCertificate(garbledSig)).ok);

check("v1 certificate rejects", !(await verifyTrainingCertificate({ ...cert, version: 1 })).ok);
// Regression: a rejection with zero checks rendered as "verified".
for (const [label, input] of [
  ["v1", { ...cert, version: 1 }],
  ["null", null],
  ["string", "nope"],
] as const) {
  const r = await verifyTrainingCertificate(input);
  check(`rejected ${label} certificate leaves a failing check (verdict can't read as verified)`,
    !r.ok && certificateVerdictState(r.checks) === "failed", JSON.stringify(r.checks));
}
check("schema version rejects", !(await verifyTrainingCertificate({ ...cert, version: 99 })).ok);
check("modified dataset commitment rejects", !(await verifyTrainingCertificate({
  ...cert,
  datasets: [{ ...cert.datasets[0], datasetCommitment: "d".repeat(64) }],
})).ok);
check("modified training-set commitment rejects",
  !(await verifyTrainingCertificate({ ...cert, trainingSetCommitment: "e".repeat(64) })).ok);

const noTsTx = await issue(legacy, { trainingSetTxHash: undefined });
const noTsVerdict = await verifyTrainingCertificate(noTsTx);
check("missing training-set tx still verifies but warns",
  noTsVerdict.ok && noTsVerdict.warnings.some((w) => /not committed on-chain/.test(w)), JSON.stringify(noTsVerdict));
check("registry tx is never presented as training-set tx",
  noTsTx.trainingSetTxHash === undefined && noTsTx.registryTxHash === "0x" + "8".repeat(64));

console.log("\n-- on-chain comparison --");
const signerLong = legacy.accountAddress.toStringLong();
const onChain = {
  commitment: set1.commitment,
  creator: signerLong,
  fileIds: ["1", "2"],
  datasetCommitments: ["b".repeat(64), "a".repeat(64)],
  createdAt: 1,
};
const allPass = (cs: { status: string }[]) => cs.every((c) => c.status === "pass");
check("matching on-chain record passes", allPass(compareTrainingSetToCertificate(onChain, cert)));
check("missing on-chain record fails", !allPass(compareTrainingSetToCertificate(null, cert)));
check("different creator fails",
  !allPass(compareTrainingSetToCertificate({ ...onChain, creator: attacker.accountAddress.toStringLong() }, cert)));
check("extra on-chain dataset fails",
  !allPass(compareTrainingSetToCertificate({ ...onChain, fileIds: [...onChain.fileIds, "3"], datasetCommitments: [...onChain.datasetCommitments, "c".repeat(64)] }, cert)));
check("swapped hash on-chain fails",
  !allPass(compareTrainingSetToCertificate({ ...onChain, datasetCommitments: ["a".repeat(64), "b".repeat(64)] }, cert)));

console.log("\n-- full certificate verification (verifier page) --");
{
  const REG = "0x2251165b1dd4124e02304bd781779070e87af21aa86f69c1f6d452d4d8bd2e5c";
  process.env.NEXT_PUBLIC_REGISTRY_ADDRESS_SHELBYNET = REG;
  const good = await issue(legacy);
  delete process.env.NEXT_PUBLIC_REGISTRY_ADDRESS_SHELBYNET;

  const setRecord = {
    commitment: set1.commitment,
    creator: legacy.accountAddress.toStringLong(),
    fileIds: ["1", "2"],
    datasetCommitments: ["b".repeat(64), "a".repeat(64)],
    createdAt: 1,
  };
  const files: Record<string, { fileId: string; contentHash: string; uploader: string; shelbyCid: string } | null> = {
    "1": { fileId: "1", contentHash: "b".repeat(64), uploader: setRecord.creator, shelbyCid: "aptbox/b.bin" },
    "2": { fileId: "2", contentHash: "a".repeat(64), uploader: setRecord.creator, shelbyCid: "aptbox/a.bin" },
  };
  const deps = (o: Record<string, unknown> = {}) => ({
    fetchSet: async () => setRecord,
    fetchFile: async (_n: unknown, id: string) => files[id],
    registryAddressFor: () => REG,
    aptosConfigFor: () => undefined,
    ...o,
  });
  const down = async () => { throw new Error("fullnode unreachable"); };

  const ok = await verifyCertificateFull(good, deps());
  check("valid cert + matching chain → verified", ok.state === "verified", JSON.stringify(ok.checks));
  check("…every dataset row passes", ok.datasets.length === 2 && ok.datasets.every((d) => d.status === "pass"));
  check("…includes registry + on-chain + dataset checks",
    ["Registry deployment", "Training set on-chain", "Datasets in registry"].every((l) => ok.checks.some((c) => c.label === l && c.status === "pass")));
  check("accepts the pasted JSON string", (await verifyCertificateFull(JSON.stringify(good), deps())).state === "verified");

  const bad = await verifyCertificateFull("{ not json", deps());
  check("invalid JSON → failed with a format message", bad.state === "failed" && /valid JSON/.test(bad.checks[0].detail ?? ""));
  check("empty input → failed, asks for a certificate", /Paste or drop/.test((await verifyCertificateFull("  ", deps())).checks[0].detail ?? ""));
  check("JSON array → failed", (await verifyCertificateFull("[]", deps())).state === "failed");

  check("edited certificate → failed",
    (await verifyCertificateFull({ ...good, modelRunId: "other" }, deps())).state === "failed");
  check("edited network → failed (covered by signature)",
    (await verifyCertificateFull({ ...good, network: "mainnet" }, deps())).state === "failed");

  check("training-set lookup outage → incomplete, not failed",
    (await verifyCertificateFull(good, deps({ fetchSet: down }))).state === "incomplete");
  check("dataset lookup outage → incomplete, not failed",
    (await verifyCertificateFull(good, deps({ fetchFile: down }))).state === "incomplete");
  check("training set confirmed absent → failed",
    (await verifyCertificateFull(good, deps({ fetchSet: async () => null }))).state === "failed");

  const deletedRun = await verifyCertificateFull(good, deps({ fetchFile: async (_n: unknown, id: string) => (id === "1" ? null : files[id]) }));
  check("dataset later deleted → still verified, with a warning",
    deletedRun.state === "verified" && deletedRun.warnings.some((w) => /deleted by their uploader/.test(w)), JSON.stringify(deletedRun));
  check("…and that row is marked skip, not pass",
    deletedRun.datasets.find((d) => d.fileId === "1")?.status === "skip");

  const swapped = await verifyCertificateFull(good, deps({
    fetchFile: async (_n: unknown, id: string) => (id === "1" ? { ...files["1"]!, contentHash: "f".repeat(64) } : files[id]),
  }));
  check("registry hash differs from certificate → failed", swapped.state === "failed");
  check("…and names the offending row", swapped.datasets.find((d) => d.fileId === "1")?.status === "fail");
  check("registry blob name differs → failed", (await verifyCertificateFull(good, deps({
    fetchFile: async (_n: unknown, id: string) => ({ ...files[id]!, shelbyCid: "aptbox/other.bin" }),
  }))).state === "failed");

  const otherReg = await verifyCertificateFull(good, deps({ registryAddressFor: () => "0x1" }));
  check("certificate from another registry deployment → incomplete, explains why",
    otherReg.state === "incomplete" && otherReg.checks.some((c) => c.label === "Registry deployment" && /references registry/.test(c.detail ?? "")));
  check("v1 certificate → failed", (await verifyCertificateFull({ ...good, version: 1 }, deps())).state === "failed");
}

console.log("\n-- training sets from registered datasets (2a) --");
{
  const me = legacy.accountAddress.toString();
  const other = attacker.accountAddress.toString();
  const pub = { uploader: other, accessType: 0 };
  const paid = { uploader: other, accessType: 1 };
  const wl = { uploader: other, accessType: 2 };
  const mine = { uploader: me, accessType: 1 };

  check("public dataset: selectable even without a wallet", selectionEligibility(pub, undefined, undefined).selectable);
  check("paid dataset, no wallet → not selectable", selectionEligibility(paid, undefined, undefined).reason === "no-wallet");
  check("paid dataset not purchased → not selectable", selectionEligibility(paid, me, false).reason === "not-purchased");
  check("paid dataset, access unknown yet → not selectable", !selectionEligibility(paid, me, undefined).selectable);
  check("paid dataset purchased → selectable", selectionEligibility(paid, me, true).reason === "purchased");
  check("restricted dataset, not on list → not selectable", selectionEligibility(wl, me, false).reason === "not-whitelisted");
  check("restricted dataset, on list → selectable", selectionEligibility(wl, me, true).reason === "whitelisted");
  check("own paid dataset → selectable without a purchase", selectionEligibility(mine, me, false).reason === "owner");
  check("owner match ignores address format (short vs long)",
    selectionEligibility({ uploader: legacy.accountAddress.toStringLong(), accessType: 2 }, me, false).reason === "owner");
  check("unknown access mode → not selectable", !selectionEligibility({ uploader: other, accessType: 3 }, me, true).selectable);

  // Same datasets must give the same commitment whichever path built them,
  // otherwise a registry-built set could never match an upload-built one.
  const registryFiles = [
    { fileId: "2", contentHash: "a".repeat(64), shelbyCid: "aptbox/a.bin" },
    { fileId: "1", contentHash: "b".repeat(64), shelbyCid: "aptbox/b.bin" },
  ];
  const fromRegistry = await buildTrainingSet(registryDatasetEntries(registryFiles));
  check("registry-built commitment == upload-built commitment for the same datasets",
    fromRegistry.commitment === set1.commitment, `${fromRegistry.commitment} vs ${set1.commitment}`);

  const rec = { commitment: set1.commitment, creator: legacy.accountAddress.toStringLong(), fileIds: [], datasetCommitments: [], createdAt: 42 };
  check("no existing record → register", decideForExistingSet(null, me).action === "register");
  const reuse = decideForExistingSet(rec, me);
  check("existing record by me → reuse (no new tx)", reuse.action === "reuse" && reuse.createdAt === 42);
  const blocked = decideForExistingSet({ ...rec, creator: attacker.accountAddress.toStringLong() }, me);
  check("existing record by someone else → blocked, names the creator",
    blocked.action === "blocked" && blocked.creator === attacker.accountAddress.toStringLong());

  // A reused set's certificate has no tx hash; once the chain confirms the
  // record, the verifier must not claim it "was not committed on-chain".
  const REG = "0x2251165b1dd4124e02304bd781779070e87af21aa86f69c1f6d452d4d8bd2e5c";
  process.env.NEXT_PUBLIC_REGISTRY_ADDRESS_SHELBYNET = REG;
  const reusedCert = await issue(legacy, { trainingSetTxHash: undefined, registryTxHash: undefined });
  delete process.env.NEXT_PUBLIC_REGISTRY_ADDRESS_SHELBYNET;
  const r = await verifyCertificateFull(reusedCert, {
    fetchSet: async () => ({ ...rec, fileIds: ["1", "2"], datasetCommitments: ["b".repeat(64), "a".repeat(64)] }),
    fetchFile: async (_n: unknown, id: string) => ({
      fileId: id,
      contentHash: id === "1" ? "b".repeat(64) : "a".repeat(64),
      uploader: rec.creator,
      shelbyCid: id === "1" ? "aptbox/b.bin" : "aptbox/a.bin",
    }),
    registryAddressFor: () => REG,
    aptosConfigFor: () => undefined,
  });
  check("reused set (no tx hash) + confirmed on-chain → verified", r.state === "verified", JSON.stringify(r.checks));
  check("…without the false 'not committed on-chain' warning",
    !r.warnings.some((w) => /not committed on-chain/.test(w)) && r.warnings.some((w) => /confirmed on-chain/.test(w)), JSON.stringify(r.warnings));
}

console.log("\n-- model hash (2c) --");
{
  const H = "ab".repeat(32);
  check("empty → empty (optional)", parseModelHashInput("   ").state === "empty");
  const ok = parseModelHashInput(`  0x${H.toUpperCase()}\n`);
  check("0x prefix, whitespace, upper-case → valid, normalised", ok.state === "valid" && ok.hex === H, JSON.stringify(ok));
  const short = parseModelHashInput(H.slice(0, 63));
  check("63 chars → invalid, says how many", short.state === "invalid" && /has 63/.test(short.error));
  const bad = parseModelHashInput("z".repeat(64));
  check("non-hex → invalid", bad.state === "invalid" && /hex characters/.test(bad.error));
  check("SHA-512-length value → invalid", parseModelHashInput("a".repeat(128)).state === "invalid");

  // Round trip: a model file hashed on /train must match what
  // /verify/certificate computes from the same file. Both use sha256File.
  const weights = new Blob([new Uint8Array(3 * 1024 * 1024 + 17).map((_, i) => (i * 31) % 251)]);
  const onTrain = await sha256File(weights);
  const parsed = parseModelHashInput(onTrain.hex);
  const modelCert = await issue(legacy, { modelHash: parsed.state === "valid" ? parsed.hex : undefined });
  const onVerifier = await sha256File(weights);
  check("certificate pins the hashed model", modelCert.modelHash === onTrain.hex);
  check("verifier recomputes the same hash from the same file", onVerifier.hex === modelCert.modelHash);
  check("…and the signed certificate still verifies", (await verifyTrainingCertificate(modelCert)).ok);
  const tweaked = new Uint8Array(await weights.arrayBuffer());
  tweaked[tweaked.length - 1] ^= 1;
  check("a one-byte-different model file does NOT match", (await sha256File(new Blob([tweaked]))).hex !== modelCert.modelHash);
  check("swapping the model hash in the certificate breaks verification",
    !(await verifyTrainingCertificate({ ...modelCert, modelHash: "cd".repeat(32) })).ok);
}

console.log("\n-- encryption badge --");
{
  const receipt = { keyId: "aes256:x" } as never;
  check("upload with receipt → encrypted", encryptionBadge({ encryptionReceipt: receipt }) === "encrypted");
  check("Shelby says AES_GCM_V1 → encrypted", encryptionBadge({ storageEncryption: "AES_GCM_V1" }) === "encrypted");
  check("Shelby says Unencrypted → unencrypted", encryptionBadge({ storageEncryption: "Unencrypted" }) === "unencrypted");
  // Regression: a registry dataset has no receipt. Encrypted dataset #6 was
  // labelled "publicly readable" because missing receipt meant "unencrypted".
  check("no receipt + no lookup → unknown, never 'unencrypted'", encryptionBadge({}) === "unknown");
  check("no receipt + encrypted on Shelby → encrypted (the #6 case)",
    encryptionBadge({ encryptionReceipt: undefined, storageEncryption: "AES_GCM_V1" }) === "encrypted");
}

console.log("\n-- verdict states --");
const P = { label: "a", status: "pass" } as const;
const F = { label: "b", status: "fail" } as const;
const U = { label: "c", status: "unavailable" } as const;
const S = { label: "d", status: "skip" } as const;
check("all pass → verified", certificateVerdictState([P, P, S]) === "verified");
check("unavailable → incomplete (amber), not failed", certificateVerdictState([P, U]) === "incomplete");
check("fail beats unavailable → failed", certificateVerdictState([U, F, P]) === "failed");

// This script runs without a registry address configured, so the on-chain
// lookup genuinely cannot run. That must come back as unavailable, not fail.
const lookup = await verifyCertificateOnChain(cert, Network.SHELBYNET as never);
check("lookup that can't run → unavailable", lookup.length === 1 && lookup[0].status === "unavailable", JSON.stringify(lookup));
check("…so a valid signed cert is incomplete, not failed",
  certificateVerdictState([...verdict.checks, ...lookup]) === "incomplete");
check("…but a forged cert with the same outage is still failed",
  certificateVerdictState([...forgedVerdict.checks, ...lookup]) === "failed");
check("confirmed absence on-chain is still a hard fail",
  certificateVerdictState(compareTrainingSetToCertificate(null, cert)) === "failed");

console.log("\n-- key backup --");
const backupKey = await generateAesKey();
const ciphertext = await encryptAesGcm(bytes, backupKey);
const backup = buildKeyBackup({
  network: "shelbynet",
  keys: [{
    originalFilename: "a.csv",
    datasetCommitment: h1.hex,
    shelbyCid: "aptbox/a.csv",
    keyId: encryptionKeyId(backupKey),
    keyHex: backupKey,
  }],
});
const restored = parseKeyBackup(JSON.parse(JSON.stringify(backup)));
const roundTrip = await decryptAesGcm(ciphertext, restored.keys[0].keyHex);
check("backed-up key decrypts the dataset", new TextDecoder().decode(roundTrip) === "aptbox provenance dataset");
check("backup carries full 64-char key, not just keyId", restored.keys[0].keyHex.length === 64);
await rejects("corrupted key in backup rejects", async () =>
  parseKeyBackup({ ...backup, keys: [{ ...backup.keys[0], keyHex: "0".repeat(64) }] }));
await rejects("non-backup JSON rejects", async () => parseKeyBackup({ hello: "world" }));
await rejects("building backup with mismatched keyId rejects", async () =>
  buildKeyBackup({ network: "shelbynet", keys: [{ ...backup.keys[0], keyId: "aes256:00000000:00000000" }] }));

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

const fromListing = shelbyObjectToActivity({
  key: "aptbox/a.bin",
  encryption: "AES_GCM_V1" as never,
  storedSize: 148218,
  committedAtMicros: 1791356226971992,
});
check("object-listing fallback is marked as derived", fromListing.derivedFrom === "object-listing" && fromListing.source === "shelby");
check("object-listing fallback converts µs commit time", fromListing.timestamp === new Date(1791356226971.992).toISOString(), fromListing.timestamp);
check("object-listing fallback reports encryption", fromListing.label.includes("AES_GCM_V1"));
check("missing commit time leaves timestamp empty",
  shelbyObjectToActivity({ key: "k", encryption: "Unencrypted" as never, storedSize: 1, committedAtMicros: 0 }).timestamp === undefined);

console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`}\n`);
process.exit(failures === 0 ? 0 : 1);
