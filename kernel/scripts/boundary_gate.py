#!/usr/bin/env python3
"""boundary_gate.py — P5 court gate: mutation campaign driver (lane C5)."""
import argparse, hashlib, json, os, shutil, subprocess, sys, time

EXIT_OK, EXIT_COURT_FAIL, EXIT_INTEGRITY, EXIT_CONFIG = 0, 1, 2, 3
KERNEL = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TMP_ROOT = "/tmp/boundary_gate"
LEDGER = os.path.join(KERNEL, "scripts", "boundary_gate_ledger.json")
CRATE = "repop-kernel"
KTEST = "crates/repop-kernel"

# court -> (subject file, find, replace). Find must match exactly once.
MUTATIONS = {}
MUTATIONS["differential-oracle"] = (
    KTEST + "/src/solver.rs",
    "ordered_key_f64(f64::from_bits(frame[METRIC_WORD_NTE])),\n        ordered_key_f64(NTE_LIMIT_F64),",
    "ordered_key_f64(NTE_LIMIT_F64),\n        ordered_key_f64(f64::from_bits(frame[METRIC_WORD_NTE])),",
)
MUTATIONS["cas-registry"] = (
    KTEST + "/src/state.rs",
    "expected.wrapping_add(1)",
    "expected",
)
MUTATIONS["boundary-sweep"] = (
    KTEST + "/src/boundary.rs",
    "pub const NTE_LIMIT_F64: f64 = 1_000_000.0;",
    "pub const NTE_LIMIT_F64: f64 = 1000000.0000000002;",
)
MUTATIONS["receipt-emit"] = (
    KTEST + "/src/receipt.rs",
    "if bytes[4] != UNSEALED_RECEIPT_VERSION {",
    "if false {",
)
MUTATIONS["admissions-root"] = (
    KTEST + "/src/receipt.rs",
    "for block in leaves.chunks(cap) {",
    "for block in leaves.chunks(2) {",
)
MUTATIONS["refusal-typing"] = (
    KTEST + "/src/refuse.rs",
    "RegistryExhausted,",
    "RegistryExhaustedMutant,",
)

# court -> test target name (cargo test --test <name>)
COURTS = {}
COURTS["differential-oracle"] = "solver_differential_courts"
COURTS["cas-registry"] = "cas_differential_courts"
COURTS["boundary-sweep"] = "boundary_sweep_courts"
COURTS["receipt-emit"] = "receipt_differential_courts"
COURTS["admissions-root"] = "receipt_differential_courts"
COURTS["refusal-typing"] = "cas_differential_courts"


def sha256_tree(root, relskip=()):
    out = {}
    for dirpath, dirnames, filenames in os.walk(root):
        dirnames[:] = [d for d in dirnames if d not in ("target", ".git")]
        for fn in filenames:
            if any(fn.endswith(s) for s in relskip):
                continue
            p = os.path.join(dirpath, fn)
            rel = os.path.relpath(p, root)
            h = hashlib.sha256()
            with open(p, "rb") as f:
                h.update(f.read())
            out[rel] = h.hexdigest()
    return out


def cargo_test(kernel_root, test_name, extra_env=None):
    """Run one court target; returns (exit_code, tail_output)."""
    env = dict(os.environ)
    env["CARGO_TARGET_DIR"] = os.path.join(
        TMP_ROOT, "targets", "%s-%d" % (test_name, int(time.time())))
    env["RUSTFLAGS"] = ""  # ensure own-env independence
    if extra_env:
        env.update(extra_env)
    os.makedirs(TMP_ROOT, exist_ok=True)
    try:
        p = subprocess.run(
            ["cargo", "test", "-p", CRATE, "--test", test_name],
            cwd=kernel_root, env=env, capture_output=True, text=True, timeout=600,
        )
        tail = (p.stdout + p.stderr)[-2000:]
        return p.returncode, tail
    except subprocess.TimeoutExpired:
        return 124, "timeout after 600s"
    except FileNotFoundError:
        return 127, "cargo not found"


def run_one_mutation(court, mutate_baseline_tail=None, keep_sandbox=False):
    """Sandbox one mutation. Returns ledger dict row for the court."""
    subject, find, replace = MUTATIONS[court]
    test_name = COURTS[court]
    row = {"court": court, "subject": subject, "test": test_name}

    # 0. subject present? (exit 2 loud if not)
    abs_subject = os.path.join(KERNEL, subject)
    if not os.path.exists(abs_subject):
        row["standing"] = "BLOCKED"
        row["exit"] = EXIT_INTEGRITY
        row["why"] = "SUBJECT_MISSING"
        return row, EXIT_INTEGRITY

    # 1. canonical integrity manifest BEFORE anything
    before = sha256_tree(KERNEL)
    os.makedirs(TMP_ROOT, exist_ok=True)

    # 2. sandbox copy (kernel workspace only)
    sandbox = os.path.join(TMP_ROOT, "%s-%d" % (court, int(time.time())))
    if os.path.exists(sandbox):
        shutil.rmtree(sandbox)
    shutil.copytree(KERNEL, sandbox, ignore=shutil.ignore_patterns("target", "*.json"))
    try:
        # 3. apply mutation — must match exactly once, else exit 3
        sp = os.path.join(sandbox, subject)
        with open(sp, "r", encoding="utf-8") as f:
            src = f.read()
        n = src.count(find)
        if n != 1:
            row["standing"] = "BLOCKED"
            row["exit"] = EXIT_CONFIG
            row["why"] = "MUTATION_MATCH_%d" % n
            return row, EXIT_CONFIG
        with open(sp, "w", encoding="utf-8") as f:
            f.write(src.replace(find, replace))

        # 4. baseline on canonical tree (court must pass unmutated)
        base_code, base_tail = cargo_test(KERNEL, test_name)
        row["baseline_exit"] = base_code
        if base_code != 0:
            row["standing"] = "UNVERIFIED"
            row["exit"] = EXIT_COURT_FAIL
            row["why"] = "BASELINE_RED"
            row["tail"] = base_tail[-800:]
            return row, EXIT_COURT_FAIL

        # 5. mutation run in sandbox (own /tmp CARGO_TARGET_DIR)
        mut_code, mut_tail = cargo_test(sandbox, test_name)
        row["mutation_exit"] = mut_code
        row["killed"] = mut_code != 0
        row["standing"] = "ALIVE" if mut_code != 0 else "VACUOUS"
        row["exit"] = EXIT_OK if mut_code != 0 else EXIT_COURT_FAIL
        row["tail"] = mut_tail[-400:]
        return row, row["exit"]
    finally:
        # 6. restore proof: canonical sha256 must be byte-identical; mtime bump
        after = sha256_tree(KERNEL)
        for rel, h in before.items():
            p = os.path.join(KERNEL, rel)
            if after.get(rel) != h:
                raise SystemExit("RESTORE FAILURE: %s changed — fail-closed exit 2" % rel)
            if os.path.exists(p):
                st = os.stat(p)
                os.utime(p, (st.st_atime, time.time() + 1))
        if (not keep_sandbox) and os.path.exists(sandbox):
            shutil.rmtree(sandbox, ignore_errors=True)


def self_check():
    """G/P two-arm flip proof of the gate machinery itself (no kernel needed).

    Arm G (green): baseline subject passes, gate machinery reports exit 0.
    Arm P (poison): the named mutation flips the probe court -> exit 1 kill.
    Arm X (restore): a tampered canonical file after the manifest is detected
    -> fail-closed EXIT_INTEGRITY.
    """
    sc_root = os.path.join(TMP_ROOT, "selfcheck")
    subj_dir = os.path.join(sc_root, "subj")
    os.makedirs(subj_dir, exist_ok=True)
    subject_py = os.path.join(subj_dir, "mini_solver.py")
    probe_py = os.path.join(subj_dir, "probe.py")

    def write_subject(text):
        with open(subject_py, "w") as f:
            f.write(text)

    write_subject("LIMIT = 10.0\n\ndef ok(x):\n    return x <= LIMIT\n")

    # probe court: subprocess-run the subject, assert boundary behavior
    def run_probe(root):
        ns = {}
        exec(open(os.path.join(root, "subj", "mini_solver.py")).read(), ns)
        cases = [(9.999, True), (10.0, True), (10.001, False)]
        for x, want in cases:
            if ns["ok"](x) != want:
                return 1
        return 0

    results = {}
    # Arm G: green baseline
    before = sha256_tree(subj_dir)
    results["G_baseline_green"] = run_probe(sc_root)
    after = sha256_tree(subj_dir)
    assert before == after, "self-check: canonical changed with no mutation"
    # Arm P: poison — widen the limit; probe must flip
    with open(subject_py) as f:
        src = f.read()
    assert src.count("LIMIT = 10.0") == 1
    with open(subject_py, "w") as f:
        f.write(src.replace("LIMIT = 10.0", "LIMIT = 10.5"))
    results["P_mutation_kills"] = run_probe(sc_root)
    # restore subject exactly, fail-closed
    with open(subject_py, "w") as f:
        f.write(src)
    after2 = sha256_tree(subj_dir)
    if before != after2:
        print("SELF-CHECK Arm X: restore failure detected — exit 2")
        return EXIT_INTEGRITY
    # Arm X: tamper detection — mutate AFTER manifest, detect, restore
    tampered = src.replace("LIMIT = 10.0", "LIMIT = 99.0")
    with open(subject_py, "f" if False else "w") as f:
        f.write(tampered)
    if sha256_tree(subj_dir) == before:
        print("SELF-CHECK Arm X: tamper NOT detected — vacuous court")
        return EXIT_COURT_FAIL
    with open(subject_py, "w") as f:
        f.write(src)
    ok = (
        results["G_baseline_green"] == 0
        and results["P_mutation_kills"] == 1
    )
    print("SELF-CHECK arms:", json.dumps(results), "-> ", "PASS" if ok else "FAIL")
    return EXIT_OK if ok else EXIT_COURT_FAIL


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--mutate", metavar="COURT", help="run one court's mutation leg")
    ap.add_argument("--self-check", action="store_true", help="G/P/X flip-proof of the gate itself")
    ap.add_argument("--shim-court-only", action="store_true",
                    help="mutation legs only (skip nothing; alias for campaign)")
    ap.add_argument("--ledger", default=LEDGER, help="kill-rate ledger JSON path")
    args = ap.parse_args()

    if args.self_check:
        sys.exit(self_check())

    courts = list(MUTATIONS)
    if args.mutate:
        if args.mutate not in MUTATIONS:
            print("unknown court: %s" % args.mutate)
            sys.exit(EXIT_CONFIG)
        courts = [args.mutate]

    ledger_path = args.ledger
    rows = []
    worst = EXIT_OK
    for court in courts:
        row, code = run_one_mutation(court)
        rows.append(row)
        print("%-20s standing=%-9s baseline=%s mutation=%s why=%s"
              % (court, row.get("standing"), row.get("baseline_exit"),
                 row.get("mutation_exit"), row.get("why", "-")))
        worst = max(worst, code)

    killed = sum(1 for r in rows if r.get("killed"))
    missing = sum(1 for r in rows if r.get("why") == "SUBJECT_MISSING")
    ledger = {
        "standing": {EXIT_OK: "ALIVE", EXIT_COURT_FAIL: "VACUOUS",
                     EXIT_INTEGRITY: "BLOCKED", EXIT_CONFIG: "BLOCKED"}[worst],
        "gate_exit": worst,
        "courts_total": len(rows),
        "killed": killed,
        "subject_missing": missing,
        "rows": rows,
        "ts": time.strftime("%Y-%m-%dT%H:%M:%S%z"),
    }
    with open(ledger_path, "w") as f:
        json.dump(ledger, f, indent=2)
    print("ledger -> %s (kill %d/%d, subject_missing %d)"
          % (ledger_path, killed, len(rows), missing))
    sys.exit(worst)


if __name__ == "__main__":
    main()
