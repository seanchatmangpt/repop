//! Court 1 — solver differential vs scalar oracle (court name: `differential-oracle`).
//!
//! P5 gates table: baseline run must pass on the unmutated kernel; the named
//! mutation (swap the solver reduce-op comparison in `src/solver.rs`, e.g.
//! `le_mask_borrow_form(a, b)` -> `le_mask_borrow_form(b, a)`) must FLIP this
//! suite. Gate: `kernel/scripts/boundary_gate.py --mutate differential-oracle`.

mod common;

use common::{encode_frame, gen_corpus, oracle_mirror, LANE_SOLVER};
use repop_kernel::VerdictCode;
use repop_kernel::solver::ColdError;
use repop_kernel::{evaluate, cold_validate};

const CORPUS_N: usize = 512;

#[test]
fn solver_matches_scalar_oracle_over_corpus() {
    repop_kernel::boundary::assert_thresholds_live().expect("thresholds live");
    let corpus = gen_corpus(LANE_SOLVER, CORPUS_N);
    for row in &corpus {
        let frame = encode_frame(row);
        let kernel_verdict = evaluate(&frame);
        let mirror = oracle_mirror::evaluate(row);
        assert_eq!(
            kernel_verdict, mirror,
            "kernel/mirror divergence at row {row:?}"
        );
    }
}

#[test]
fn solver_refuses_nan_metrics_fail_closed() {
    let mut f = [0u64; 8];
    f[repop_kernel::METRIC_WORD_NTE] = f64::NAN.to_bits();
    f[repop_kernel::METRIC_WORD_GPM] = 0.1f64.to_bits();
    f[repop_kernel::METRIC_WORD_GEO] = 5.0f64.to_bits();
    assert_eq!(evaluate(&f), VerdictCode::POISON);
    // +inf is a legal extreme (ordered key), but breaches the upper bound.
    f[repop_kernel::METRIC_WORD_NTE] = f64::INFINITY.to_bits();
    assert_eq!(evaluate(&f), VerdictCode::BREACH_NTE);
    // -inf on any metric is ordered below the limit: PASS semantics.
    f[repop_kernel::METRIC_WORD_NTE] = f64::NEG_INFINITY.to_bits();
    assert_eq!(evaluate(&f), VerdictCode::PASS);
}

#[test]
fn cold_path_rejects_nonmetric_nan() {
    let mut f = [0u64; 8];
    f[repop_kernel::METRIC_WORD_NTE] = 1.0f64.to_bits();
    f[repop_kernel::METRIC_WORD_GPM] = 0.1f64.to_bits();
    f[repop_kernel::METRIC_WORD_GEO] = 5.0f64.to_bits();
    f[0] = f64::NAN.to_bits();
    assert_eq!(cold_validate(&f), Err(ColdError::NonMetricNan { word: 0 }));
}

#[test]
fn named_threshold_consts_are_live() {
    // assert_live anti-pinned probes (P2 gate: threshold-court liveness).
    repop_kernel::boundary::assert_thresholds_live().expect("thresholds live");
    // mirror pin: mirror consts == real consts (court-bug guard)
    assert_eq!(common::NTE_LIMIT, repop_kernel::boundary::NTE_LIMIT_F64);
    assert_eq!(common::GPM_RATE, repop_kernel::boundary::GPM_RATE_F64);
    assert_eq!(common::GEO_RADIUS, repop_kernel::boundary::GEO_RADIUS_F64);
}
