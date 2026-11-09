//! Court 4 — boundary sweep court (court name: `boundary-sweep`).
//!
//! P5 gates row `boundary-sweep`: named mutation widens one clamp threshold by
//! +1 ULP in `src/boundary.rs`; an off-by-one case must flip this suite.
//! Gate: `kernel/scripts/boundary_gate.py --mutate boundary-sweep`.

mod common;

use common::{encode_frame, gen_corpus, oracle_mirror, SplitMix64, MASTER_SEED, LANE_BOUNDARY};
use repop_kernel::VerdictCode;
use repop_kernel::boundary::{assert_thresholds_live, le_mask_borrow_form, ordered_key_f64, NAN_POISON_KEY};
use repop_kernel::{evaluate, METRIC_WORD_GEO, METRIC_WORD_GPM, METRIC_WORD_NTE};

const CORPUS_N: usize = 1024;

#[test]
fn threshold_liveness_probe() {
    assert_thresholds_live().expect("thresholds live");
}

#[test]
fn ulp_sweep_around_all_three_limits() {
    // For each limit L: L-1 ULP => PASS, L exactly => PASS (upper-bound-only),
    // L+1 ULP => breach of that family.
    for (limit, word) in [
        (common::NTE_LIMIT, METRIC_WORD_NTE as usize),
        (common::GPM_RATE, METRIC_WORD_GPM as usize),
        (common::GEO_RADIUS, METRIC_WORD_GEO as usize),
    ] {
        let mut f = [0u64; 8];
        f[word] = ulp_down(limit).to_bits();
        assert_eq!(evaluate(&f), VerdictCode::PASS, "{limit} - 1 ULP must pass");
        f[word] = limit.to_bits();
        assert_eq!(evaluate(&f), VerdictCode::PASS, "{limit} exactly must pass");
        f[word] = ulp_up(limit).to_bits();
        let v = evaluate(&f);
        assert_ne!(v, VerdictCode::PASS, "{limit} + 1 ULP must breach");
    }
}

#[test]
fn key_total_order_holds_across_sweep() {
    // ordered_key_f64 must reproduce the f64 total order exactly (NaN maps to
    // the poison key, checked separately).
    let mut xs: Vec<f64> = vec![
        0.0, 1.0, -1.0, common::NTE_LIMIT, common::GPM_RATE,
        common::GEO_RADIUS, f64::MIN, f64::MAX, f64::NEG_INFINITY,
        f64::INFINITY, 5e-324,
    ];
    xs.extend(gen_corpus(LANE_BOUNDARY, CORPUS_N).iter().map(|r| r.nte));
    // ±0.0 adjacency (documented in src/boundary.rs): keys differ by 1 but are
    // semantically equal — checked separately, excluded from strict ordering.
    assert_eq!(ordered_key_f64(0.0), ordered_key_f64(-0.0) + 1);
    xs.sort_by(f64::total_cmp);
    // total order differential: whenever x1 < x2 (f64 total order), the keys
    // must strictly increase. ±0 pairs skipped (documented adjacency).
    let mut sorted = xs.clone();
    sorted.sort_by(f64::total_cmp);
    for w in sorted.windows(2) {
        let (a, b) = (w[0], w[1]);
        let (ka, kb) = (ordered_key_f64(a), ordered_key_f64(b));
        if a == b || (a == 0.0 && b == 0.0) {
            continue;
        }
        assert!(
            ka < kb,
            "key order diverges from f64 total order: {a} -> {ka:#x}, {b} -> {kb:#x}"
        );
    }
    assert_eq!(ordered_key_f64(f64::NAN), NAN_POISON_KEY);
}

#[test]
fn le_mask_matches_key_compare_over_sweep() {
    // Direct differential: the branchless mask must equal the plain key
    // compare over a boundary-biased sweep of (a, b) pairs.
    let mut rng = SplitMix64(MASTER_SEED ^ 0xABCD);
    for _ in 0..4096 {
        let a = draw(&mut rng);
        let b = draw(&mut rng);
        let ka = ordered_key_f64(a);
        let kb = ordered_key_f64(b);
        assert_eq!(
            le_mask_borrow_form(ka, kb) != 0,
            ka <= kb,
            "le_mask diverges from key compare at a={a} b={b}"
        );
    }
}

#[test]
fn full_corpus_differential_against_mirror() {
    let corpus = gen_corpus(LANE_BOUNDARY, CORPUS_N);
    for row in &corpus {
        let f = encode_frame(row);
        assert_eq!(evaluate(&f), oracle_mirror::evaluate(row), "row {row:?}");
    }
}

fn draw(rng: &mut SplitMix64) -> f64 {
    match rng.next_u64() % 4 {
        0 => (rng.next_u64() >> 11) as f64 / (1u64 << 52) as f64,
        1 => common::NTE_LIMIT,
        2 => ulp_up(ulp_up(common::GPM_RATE)),
        _ => -common::GEO_RADIUS,
    }
}

fn ulp_up(v: f64) -> f64 {
    let b = v.to_bits();
    f64::from_bits(if b >= 0x8000_0000_0000_0000 { b - 1 } else { b + 1 })
}

fn ulp_down(v: f64) -> f64 {
    let b = v.to_bits();
    f64::from_bits(if b >= 0x8000_0000_0000_0000 { b + 1 } else { b - 1 })
}
