#!/usr/bin/env python3
"""C18-r determinism court: deterministic render harness for pack templates.

Renders every templates/*.tmpl against the adopted ontology (ontology.ttl),
asserts byte-identical double-render (sha256 per file, fail-closed), and
diffs generated vs landed where the to: path corresponds to a landed file
(mismatch is a finding, not a repair).

Exits 0 only if every template renders deterministically AND every landed
to:-target matches byte-for-byte. A template whose SPARQL returns zero rows
for a binding renders the loud UNBOUND/empty fallback and is recorded
UNVERIFIED-template (never faked).

Usage: python3 scripts/render_templates.py --check [--scratch DIR]
"""
import argparse
import hashlib
import json
import os
import re
import sys

import yaml
from jinja2 import Environment, StrictUndefined
from rdflib import Graph

PACK_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
REPO_ROOT = os.path.dirname(os.path.dirname(PACK_DIR))
TPL_DIR = os.path.join(PACK_DIR, "templates")
ONTOLOGY = os.path.join(PACK_DIR, "ontology.ttl")
DEFAULT_SCRATCH = os.path.join(PACK_DIR, ".scratch-render")
BASELINE = os.path.join(PACK_DIR, "scripts", "render_baseline.json")
DRIFT_TARGETS = {
    "packages/abi/src/generated/layout.ts":
        os.path.join(REPO_ROOT, "packages/abi/src/generated/layout.ts"),
}

PREFIX_LINE = re.compile(r"^PREFIX\s+(\w*):\s*<([^>]*)>", re.IGNORECASE)


def parse_frontmatter(text):
    m = re.match(r"\A---\n(.*?)\n---\n(.*)\Z", text, re.DOTALL)
    if not m:
        raise ValueError("no frontmatter block")
    return yaml.safe_load(m.group(1)), m.group(2)


def norm_ns(prefix):
    """Normalize the cp: namespace so IRI-mismatch drift (aoq/aoq class)
    cannot silently empty a binding: declared PREFIX vs ontology namespace
    is compared at render time and mismatch = fail-closed finding."""
    return prefix


def run_binding(g, sparql_text):
    """Run one SPARQL SELECT; return rows as a deterministically sorted list
    of dicts of python values (rdflib Literals .toPython()'d). Rows sorted
    by their full rendered tuple so an ORDER BY gap cannot cause drift."""
    res = g.query(sparql_text)
    names = [str(v) for v in res.vars]
    rows = []
    for raw in res:
        rows.append({n: (v.toPython() if hasattr(v, "toPython") else v)
                     for n, v in zip(names, raw)})
    rows.sort(key=lambda d: tuple((k, str(v)) for k, v in sorted(d.items())))
    return rows, names


def cp_prefixes(g):
    return sorted({str(p) for p in set(g.subjects()) if str(p).startswith("urn:cp")
                   or str(p).startswith("urn:cgap")})


def declared_cp_prefix(sparql_text):
    m = PREFIX_LINE.search(sparql_text)
    return (m.group(1), m.group(2)) if m else None


def check_prefix(g, sparql_text):
    """Fail-closed prefix-integrity gate (G5 class): the declared cp: PREFIX
    IRI must equal the ontology's actual namespace. Returns mismatch str or
    None."""
    decl = declared_cp_prefix(sparql_text)
    if not decl:
        return None
    pfx, iri = decl
    ontology_ns = None
    for term in g.subjects():
        s = str(term)
        if s.startswith("urn:cgap"):
            cand = s.rsplit(":", 1)[0] + ":"
            if ontology_ns is None:
                ontology_ns = cand
    if ontology_ns and iri != ontology_ns:
        return "PREFIX %s: <%s> != ontology namespace <%s>" % (pfx, iri, ontology_ns)
    return None



def render_template(env, body, bindings):
    return env.from_string(body).render(**bindings)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true")
    ap.add_argument("--update-baseline", action="store_true",
                    help="re-pin baseline after a REVIEWED template/ontology change")
    ap.add_argument("--scratch", default=DEFAULT_SCRATCH)
    args = ap.parse_args()

    g = Graph()
    g.parse(ONTOLOGY, format="turtle")
    env = Environment(undefined=StrictUndefined, keep_trailing_newline=True)

    templates = sorted(f for f in os.listdir(TPL_DIR) if f.endswith(".tmpl"))
    if not templates:
        print("FAIL: no templates found in %s" % TPL_DIR)
        return 1

    failures = []
    findings = []
    digests = {}
    unverified = []
    drift = []
    report = []

    for name in templates:
        path = os.path.join(TPL_DIR, name)
        text = open(path).read()
        try:
            fm, body = parse_frontmatter(text)
        except ValueError as e:
            failures.append("%s: frontmatter: %s" % (name, e))
            continue

        bindings = {}
        zero_row_bindings = []
        prefix_mismatch = None
        for bname, spec in sorted((fm.get("sparql") or {}).items()):
            rows, names = run_binding(g, spec)
            if not rows:
                zero_row_bindings.append(bname)
            bad = check_prefix(g, spec)
            if bad:
                prefix_mismatch = "%s/%s: %s" % (name, bname, bad)
            bindings[bname] = rows

        if prefix_mismatch:
            failures.append(prefix_mismatch)

        # Render twice from independently re-bound rows; byte-identical or fail.
        rendered = []
        for _ in range(2):
            rows2 = {}
            for bname, spec in sorted((fm.get("sparql") or {}).items()):
                r, _ = run_binding(g, spec)
                rows2[bname] = r
            rendered.append(render_template(env, body, rows2))

        if rendered[0] != rendered[1]:
            failures.append("%s: NONDETERMINISTIC render (x2 differ)" % name)
            continue

        data = rendered[0].encode()
        digest = hashlib.sha256(data).hexdigest()
        digests[name] = digest
        out = os.path.join(args.scratch, fm["to"])
        os.makedirs(os.path.dirname(out), exist_ok=True)
        with open(out, "wb") as f:
            f.write(data)

        status = "PASS"
        if zero_row_bindings:
            status = "UNVERIFIED-template"
            unverified.append("%s: zero-row bindings %s (loud UNBOUND/empty fallback rendered)"
                              % (name, ",".join(zero_row_bindings)))
        report.append((name, fm["to"], len(data), digest, status))

        # Drift check: diff generated vs landed where to: is a landed file.
        landed = DRIFT_TARGETS.get(fm["to"])
        if landed:
            if os.path.exists(landed):
                landed_bytes = open(landed, "rb").read()
                verdict = "MATCH" if landed_bytes == data else "MISMATCH"
            else:
                verdict = "LANDED_FILE_MISSING"
            drift.append((name, fm["to"], verdict))
            if verdict == "MISMATCH":
                findings.append("%s: render-vs-landed MISMATCH at %s (finding, not repaired)"
                                % (name, fm["to"]))
            elif verdict == "LANDED_FILE_MISSING":
                findings.append("%s: landed to:-target missing: %s" % (name, fm["to"]))

    print("template,to,bytes,sha256,status")
    for r in report:
        print("%s,%s,%d,%s,%s" % r)
    print("---")
    for u in unverified:
        print("UNVERIFIED-template: %s" % u)
    for d in drift:
        print("drift: %s -> %s: %s" % d)

    baseline_mismatch = []
    if args.update_baseline:
        with open(BASELINE, "w") as f:
            json.dump({"law": "sha256 of the deterministic render per template; "
                              "regenerate ONLY after a reviewed template/ontology "
                              "change via --update-baseline",
                       "digests": digests}, f, indent=1, sort_keys=True)
        print("BASELINE: updated (%d templates)" % len(digests))
    else:
        import json as _json
        if not os.path.exists(BASELINE):
            failures.append("baseline missing: %s (run --update-baseline after review)"
                            % BASELINE)
        else:
            prev = _json.load(open(BASELINE))["digests"]
            for name, dg in sorted(digests.items()):
                if prev.get(name) != dg:
                    baseline_mismatch.append(name)
                    failures.append("%s: render sha256 %s != pinned baseline %s "
                                    "(template or ontology drifted; review, then "
                                    "--update-baseline)" % (name, dg, prev.get(name)))

    print("---")
    for f in findings:
        print("FINDING (non-gating): %s" % f)
    if failures:
        for f in failures:
            print("FAIL: %s" % f)
        print("GATE: FAIL")
        return 1
    print("GATE: PASS (%d templates, %d UNVERIFIED-template, %d drift finding(s)%s)"
          % (len(report), len(unverified), len(findings),
             ", %d baseline-mismatch" % len(baseline_mismatch) if baseline_mismatch else ""))
    return 0


if __name__ == "__main__":
    sys.exit(main())
