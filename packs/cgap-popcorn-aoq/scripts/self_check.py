#!/usr/bin/env python3
"""Structural self-check for packs/cgap-popcorn-aoq/ontology.ttl — fails loud.

C16b: checks all THREE pinned frames (IntentFrame 11 rows / HyperplaneRegister 12 /
ReceiptFrame 9, + envelope digest rows) against the registry of truth
kernel/crates/repop-abi/src/layout_spec.rs, whose tables are mirrored in PINNED below.
"""
import os, re, sys
from rdflib import Graph, URIRef

# C17-r: anchor on this script's location (pack scripts/ dir), never process cwd —
# the check must pass identically from any invocation directory.
ONT = os.path.join(os.path.dirname(os.path.abspath(__file__)), os.pardir, "ontology.ttl")

PINNED = {
    # frame individual: (class, magic, [(name, offset, width, wireKind)])
    "frameIntent": ("IntentFrame", 0x4946, [
        ("magic", 0, 2, "wkU16LE"), ("version", 2, 2, "wkU16LE"),
        ("intent_kind", 4, 2, "wkU16LE"), ("flags", 6, 2, "wkU16LE"),
        ("hyperplane_id", 8, 8, "wkU64LE"), ("threshold", 16, 8, "wkF64LE"),
        ("weight", 24, 8, "wkF64LE"), ("issuer", 32, 8, "wkBytes8"),
        ("payload_binding", 40, 16, "wkBytes16"), ("frame_seq", 56, 2, "wkU16LE"),
        ("reserved", 58, 2, "wkU16LE"), ("digest", 60, 4, "wkU32LE")]),
    "frameHyperplane": ("HyperplaneRegister", 0x4850, [
        ("magic", 0, 2, "wkU16LE"), ("version", 2, 2, "wkU16LE"),
        ("plane_kind", 4, 2, "wkU16LE"), ("flags", 6, 2, "wkU16LE"),
        ("plane_id", 8, 8, "wkU64LE"), ("normal_x", 16, 8, "wkF64LE"),
        ("normal_y", 24, 8, "wkF64LE"), ("normal_z", 32, 8, "wkF64LE"),
        ("offset", 40, 8, "wkF64LE"), ("binding", 48, 8, "wkBytes8"),
        ("epoch", 56, 2, "wkU16LE"), ("reserved", 58, 2, "wkU16LE"),
        ("digest", 60, 4, "wkU32LE")]),
    "frameReceipt": ("ReceiptFrame", 0x5246, [
        ("magic", 0, 2, "wkU16LE"), ("version", 2, 2, "wkU16LE"),
        ("alg_id", 4, 2, "wkU16LE"), ("flags", 6, 2, "wkU16LE"),
        ("binding", 8, 32, "wkBytes32"), ("admissions_root_prefix", 40, 16, "wkBytes16"),
        ("frame_seq", 56, 2, "wkU16LE"), ("payload_len", 58, 2, "wkU16LE"),
        ("digest", 60, 4, "wkU32LE")]),
}

g = Graph()
try:
    g.parse(ONT, format="turtle")
except Exception as e:
    print("PARSE FAIL:", e); sys.exit(2)
print("PARSE_OK", len(g), "triples")

text = open(ONT).read()
NS = re.search(r'@prefix cp: <([^>]+)>', text).group(1)
if not re.fullmatch(r"urn:[a-z0-9][a-z0-9-]*:", NS):
    print("NS_SHAPE_FAIL", repr(NS)); sys.exit(2)
if str(dict(g.namespaces())["cp"]) != NS:
    print("REBIND_FAIL", repr(NS), repr(dict(g.namespaces())["cp"])); sys.exit(2)
declared = [l.split()[1].rstrip(':') for l in text.splitlines() if l.startswith("@prefix")]
if not set(declared) <= {"cp","rdf","rdfs","owl","sh","xsd","prov"}:
    print("EXTRA_PREFIX_FAIL", declared); sys.exit(2)
print("NS_OK single pack-scoped prefix", NS)

# entity surface: NodeShape target classes + their property paths (zod-projection
# consumers; declared by the SHACL shapes themselves, not as standalone subjects)
ENTITY_TERMS = {"WorkOrder","NteRecord","GpmReading","GeofenceRegion",
    "orderId","nteLimit","gpmLimit","tier","nteValue","observedAt",
    "gpmValue","breachFlag","radiusMeters","regionId"}

def C(x): return URIRef(NS + x)
def V(s, p): return g.value(s, URIRef(NS + p))

# every referenced cp: term must be a declared subject (undefined-ref sweep)
subj = set(g.subjects(None, None))
missing = set()
for s, p, o in g:
    for t in (p, o):
        if isinstance(t, URIRef) and str(t).startswith(NS):
            local = str(t)[len(NS):]
            if t not in subj and local not in ENTITY_TERMS:
                missing.add(local)
if missing:
    print("UNDEFINED_REF_FAIL", sorted(missing)); sys.exit(2)
print("REFS_OK every referenced cp: term is declared")

# per-frame pinned layout: exact rows + contiguity 0 -> 64
for fid, (cls, magic, rows) in PINNED.items():
    ind = C(fid)
    if int(V(ind, "value")) != magic:
        print("MAGIC_FAIL", fid, V(ind, "value"), "!=", magic); sys.exit(2)
    if str(V(ind, "constantId")) != cls + "-MAGIC":
        print("CLASS_FAIL", fid, V(ind, "constantId")); sys.exit(2)
    got = {}
    for f in g.subjects(C("fieldOf"), ind):
        o, s, n = V(f, "offset"), V(f, "sizeBytes"), V(f, "nextOffset")
        if None in (o, s, n):
            print("INCOMPLETE_ROW", f); sys.exit(2)
        rn, wk = V(f, "rustName"), V(f, "wireKind")
        if rn is None or wk is None:
            print("ROW_META_FAIL", f); sys.exit(2)
        got[int(o)] = (int(s), int(n), str(rn), str(wk).split('#')[-1].split(':')[-1])
    if len(got) != len(rows):
        print("ROWCOUNT_FAIL", fid, len(got), "!=", len(rows)); sys.exit(2)
    cur, seen = 0, set()
    while True:
        if cur not in got:
            print("GAP_FAIL", fid, cur); sys.exit(2)
        s, n, name, wk = got[cur]; seen.add(cur)
        if n != cur + s:
            print("CHAIN_BREAK", fid, cur, got[cur]); sys.exit(2)
        cur = n
        if cur == 64: break
        if cur in seen:
            print("DUP_FAIL", fid, cur); sys.exit(2)
    for name, off, width, wk in rows:
        if off not in got:
            print("ROW_MISSING", fid, name, off); sys.exit(2)
        s, n, gname, gwk = got[off]
        if (s, gname, gwk) != (width, name, wk):
            print("ROW_MISMATCH", fid, off, (s, gname, gwk), "!=", (width, name, wk)); sys.exit(2)
    print("FRAME_OK", fid, cls, hex(magic), len(rows), "rows contiguous 0->64")

# closed enums with exact member counts
ONE = URIRef("http://www.w3.org/2002/07/owl#oneOf")
RD = "http://www.w3.org/1999/02/22-rdf-syntax-ns#"
expected = {"FrameType": 3, "StatusCode": 9, "AgentTier": 3, "HookName": 3,
            "ActorMessageKind": 5, "WireKind": 7}
for e, n_exp in expected.items():
    lst = g.value(C(e), ONE); n = 0
    while lst is not None and lst != URIRef(RD + "nil"):
        n += 1; lst = g.value(lst, URIRef(RD + "rest"))
    if n != n_exp:
        print("ENUM_FAIL", e, n, "!=", n_exp); sys.exit(2)
    print("ENUM_OK", e, n, "members")

# pinned constants: status band + wire constants
for i in range(1, 10):
    v = int(V(C(f"scA00{i}"), "value"))
    if v != 0x5250A000 + i:
        print("BAND_FAIL", i, hex(v)); sys.exit(2)
print("BAND_OK 0x5250A001..A009")
for iri, want, name in [("cIntentMagic", 0x4946, "intent-magic"),
                        ("cHyperplaneMagic", 0x4850, "hyperplane-magic"),
                        ("cReceiptMagic", 0x5246, "receipt-magic"),
                        ("cVersion", 1, "version"),
                        ("cFrameSize", 64, "frame-size"),
                        ("algBlake3", 0x0000, "algBlake3"),
                        ("algMlDsa", 0x0001, "algMlDsa"),
                        ("cFnvOffsetBasis", 2166136261, "fnv-basis"),
                        ("cFnvPrime", 16777619, "fnv-prime")]:
    v = int(V(C(iri), "value"))
    if v != want:
        print("CONST_FAIL", name, hex(v), "!=", hex(want)); sys.exit(2)
print("CONST_OK magics {0x4946,0x4850,0x5246} / version 1 / size 64 / algId {0,1} / FNV 2166136261,16777619")

# NodeShapes + demo bounds (NTE 800 / GPM 0.22 / geofence 200m)
SH = "http://www.w3.org/ns/shacl#"
shapes = sorted(str(s).split(':')[-1] for s in g.subjects(URIRef(SH + "targetClass"), None))
if shapes != ["GeofenceRegionShape", "GpmReadingShape", "NteRecordShape", "WorkOrderShape"]:
    print("SHAPE_FAIL", shapes); sys.exit(2)
def has_bound(shape, pred, val):
    for _, _, pr in g.triples((C(shape), URIRef(SH + "property"), None)):
        for o in g.objects(pr, URIRef(SH + pred)):
            if float(o) == val: return True
    return False
if not has_bound("WorkOrderShape", "maxInclusive", 800):
    print("DEMO_FAIL NTE 800 missing"); sys.exit(2)
if not has_bound("WorkOrderShape", "minInclusive", 0.22):
    print("DEMO_FAIL GPM 0.22 missing"); sys.exit(2)
if not has_bound("NteRecordShape", "maxInclusive", 800):
    print("DEMO_FAIL NteRecord 800 missing"); sys.exit(2)
if not has_bound("GeofenceRegionShape", "maxInclusive", 200):
    print("DEMO_FAIL geofence 200m missing"); sys.exit(2)
print("SHAPES_OK 4 NodeShapes; DEMO_OK NTE 800 / GPM 0.22 / geofence 200m")
print("ALL_GATES_PASS")
