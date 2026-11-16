/**
 * contract-emit — COORDINATION-THESIS build item 5 (contract compiler).
 *
 * (lane-id, repos, owned-files, gates, receipt-path, laws-ref) → the
 * paste-ready worker contract block used all session. Kills hand-written
 * dispatch drift.
 */

export interface ContractInput {
  laneId: string;
  repos: string[];
  ownedFiles: string[];
  gates: string[];
  receiptPath: string;
  lawsRef: string;
  /** optional extras pasted verbatim into the block */
  task?: string;
  waitGates?: string[];
  courts?: string[];
  ports?: string[];
}

/**
 * Emit the dispatch contract block. Shape matches the session's skeleton:
 * repos / owned files / gates / courts / wait-gates / receipt / laws /
 * standing vocabulary.
 */
export function emitContract(input: ContractInput): string {
  const lines = [
    `# Lane ${input.laneId}`,
    input.task ? `TASK: ${input.task}` : "",
    `REPOS: ${input.repos.map((r) => `- ${r}`).join(" ")}`,
    `OWNED FILES: ${input.ownedFiles.map((f) => `- ${f}`).join(" ")}`,
    `GATES: ${input.gates.map((g) => `- ${g}`).join(" ")}`,
    input.courts?.length
      ? `COURTS: ${input.courts.map((c) => `- ${c}`).join(" ")}`
      : "",
    input.waitGates?.length
      ? `WAIT-GATES: ${input.waitGates.map((w) => `- ${w}`).join(" ")}`
      : "",
    input.ports?.length ? `PORTS: ${input.ports.join(", ")}` : "",
    `RECEIPT: ${input.receiptPath}`,
    `LAWS: ${input.lawsRef}`,
    `VOCABULARY: ALIVE | PARTIAL_ALIVE | PASS | BLOCKED | UNVERIFIED | PARTIAL — ` +
      `every claim cites command + exit; UNVERIFIED default; never round up.`,
    `RULES: commit NOTHING (coordinator owns git); no worktrees; disclose ` +
      `any SLA unblock of another lane's file in BOTH receipts.`,
  ];
  return lines.filter((l) => l.length > 0).join("\n");
}
