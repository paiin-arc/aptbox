/**
 * Correctness gate for "My training sets" transaction parsing.
 *
 * Run: node --experimental-strip-types --disable-warning=MODULE_TYPELESS_PACKAGE_JSON scripts/verify-my-training-sets.mts
 */
import { dedupeRegistrations, parseTrainingSetTx } from "../src/lib/myTrainingSets.ts";

const REG = "0x2251165b1dd4124e02304bd781779070e87af21aa86f69c1f6d452d4d8bd2e5c";
const COMMITMENT = "0x" + "5bba98e1".padEnd(64, "a");
const rawCommitment = "0x" + "5bba98e1".padEnd(64, "a");

function mkTx(over: Record<string, unknown> = {}) {
  return {
    hash: "0xabc123",
    success: true,
    timestamp: "1791356580942172", // µs
    sender: `0x${"2768".padEnd(64, "6")}`,
    payload: { function: `${REG}::registry::register_training_set` },
    events: [
      {
        type: "0x2251165b1dd4124e02304bd781779070e87af21aa86f69c1f6d452d4d8bd2e5c::registry::TrainingSetRegistered",
        data: {
          creator: "0x" + "2768".padEnd(64, "6"),
          dataset_count: "2",
          training_set_commitment: rawCommitment,
        },
      },
    ],
    ...over,
  } as never;
}

let failures = 0;
function check(label: string, condition: boolean, detail?: unknown) {
  if (!condition) failures++;
  console.log(`${condition ? "pass" : "FAIL"}  ${label}`);
  if (!condition && detail != null) console.log(`        ${String(detail)}`);
}

const good = parseTrainingSetTx(mkTx() as never, REG);
check("extracts commitment, count, tx hash", good?.commitment === rawCommitment.replace(/^0x/, "") && good.datasetCount === 2 && good.txHash === "0xabc123");
check("creator address taken from the event", good?.creator === "0x" + "2768".padEnd(64, "6"));
check("microsecond timestamps are normalised to seconds", good?.createdAt === Math.floor(1791356580942172 / 1e6));

const wrongFn = parseTrainingSetTx(mkTx({ payload: { function: `${REG}::registry::register_files_batch` } }) as never, REG);
check("non-training-set function ignored", wrongFn === null);

const failed = parseTrainingSetTx(mkTx({ success: false }) as never, REG);
check("failed transaction ignored", failed === null);

const otherReg = parseTrainingSetTx(
  mkTx({ payload: { function: `0xabc::registry::register_training_set` } }) as never,
  REG
);
check("transaction on another registry ignored", otherReg === null);

const noEvent = parseTrainingSetTx(mkTx({ events: [] }) as never, REG);
check("missing event ignored", noEvent === null);

const csv = dedupeRegistrations([
  { commitment: COMMITMENT.replace(/^0x/, ""), datasetCount: 1, txHash: "0x1", createdAt: 100, creator: "x" },
  { commitment: COMMITMENT.replace(/^0x/, ""), datasetCount: 1, txHash: "0x2", createdAt: 200, creator: "x" },
  { commitment: "ab".repeat(32), datasetCount: 3, txHash: "0x3", createdAt: 50, creator: "x" },
]);
check("dedupe keeps newest per commitment", csv.length === 2 && csv[0].createdAt === 200);

console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`}`);
process.exit(failures === 0 ? 0 : 1);
