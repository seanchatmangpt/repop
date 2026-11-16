import { describe, expect, it } from "vitest";
import { emitContract } from "./contract-emit.ts";

describe("emitContract — the dispatch skeleton as a function", () => {
  it("reproduces the session's contract block shape", () => {
    const block = emitContract({
      laneId: "REPOP-SUBSTRATE",
      repos: ["/Users/sac/repop (canonical)", "/Users/sac/srve/servengine-frontend (prior art)"],
      ownedFiles: [
        "packages/substrate/**",
        "scripts/vacuity_check.sh",
        "docs/jira/v26.11.9-integration/receipts/SUBSTRATE-1.md",
      ],
      gates: [
        "pnpm --filter @repop/substrate test",
        "pnpm --filter @repop/substrate typecheck",
        "bash scripts/vacuity_check.sh --name substrate-vacuity --baseline-cmd 'python3 scripts/test_file_convention_gate.py' --mutate 'touch packages/substrate/src/bad.test.js' --restore 'rm -f packages/substrate/src/bad.test.js'",
      ],
      receiptPath: "docs/jira/v26.11.9-integration/receipts/SUBSTRATE-1.md",
      lawsRef: "COORDINATION-THESIS.md Laws 1-6 + SOP-TAI-OPS-001 SOP-002/SOP-005",
      task: "build the four coordination-substrate artifacts",
      courts: ["vacuity court: gate must flip under mutation"],
    });
    expect(block).toContain("# Lane REPOP-SUBSTRATE");
    expect(block).toMatch(/^REPOS: - \/Users\/sac\/repop \(canonical\)/m);
    expect(block).toMatch(/^OWNED FILES: - packages\/substrate\/\*\*/m);
    expect(block).toMatch(/^GATES: - pnpm --filter @repop\/substrate test/m);
    expect(block).toMatch(/^RECEIPT: docs\/jira\/v26\.11\.9-integration\/receipts\/SUBSTRATE-1\.md$/m);
    expect(block).toContain("VOCABULARY: ALIVE | PARTIAL_ALIVE | PASS | BLOCKED | UNVERIFIED | PARTIAL");
    expect(block).toContain("commit NOTHING");
  });

  it("omits sections that are absent rather than emitting empty labels", () => {
    const minimal = emitContract({
      laneId: "MIN",
      repos: ["/r"],
      ownedFiles: ["f.ts"],
      gates: ["true"],
      receiptPath: "r.md",
      lawsRef: "L",
    });
    expect(minimal).not.toContain("COURTS:");
    expect(minimal).not.toContain("WAIT-GATES:");
    expect(minimal).not.toContain("PORTS:");
  });
});
