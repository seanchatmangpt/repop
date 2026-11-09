//! repop-kernel — branchless hyperplane solver (C3, P2 plan 02-solver.md).
//!
//! no_std, zero-allocation hot path, zero-branch hot cell. The solver consumes a
//! 64-byte IntentFrame as a raw `[u64; 8]` (P1 ABI integration pending — metric
//! word pins are provisional, see `pin.rs`).
//!
//! UNVERIFIED: metric word positions 1/2/3 (NTE/GPM/geo) are provisional pins
//! pending P1's pinned layout; see `pin.rs`.

#![no_std]
#![deny(unsafe_code)]

pub mod boundary;
pub mod pin;
pub mod solver;

pub mod lease;
pub mod receipt;
pub mod refuse;
pub mod state;
pub mod vendor;

/// Affine lease typestate markers (P3).
pub use lease::{Fresh, Lease, Spent};
/// 229B unsealed receipt tier (R3 PQC seam).
pub use receipt::{emit, fold, UnsealedReceipt};
/// Closed refusal taxonomy (P3).
pub use refuse::Refusal;
/// Per-entity CAS registry + admissions accumulator (P3).
pub use state::{Admissions, Registry};
/// `cas` alias: the C5 court contract names the CAS surface
/// `repop_kernel::cas` (tests/cas_differential_courts.rs pins).
pub use state as cas;

pub use boundary::{
    assert_thresholds_live, le_mask_borrow_form, nan_poison, ordered_key_f64, GEO_RADIUS_F64,
    GPM_RATE_F64, NAN_POISON_KEY, NTE_LIMIT_F64,
};
pub use pin::{
    METRIC_WORD_GEO, METRIC_WORD_GPM, METRIC_WORD_NTE, WORD_PIN_STANDING,
};
pub use solver::{cold_validate, evaluate, VerdictCode};

#[cfg(test)]
mod tests {
    use super::*;

    fn frame(nte: f64, gpm: f64, geo: f64) -> [u64; 8] {
        let mut f = [0u64; 8];
        f[METRIC_WORD_NTE] = nte.to_bits();
        f[METRIC_WORD_GPM] = gpm.to_bits();
        f[METRIC_WORD_GEO] = geo.to_bits();
        f
    }

    #[test]
    fn pass_verdict() {
        let f = frame(10.0, 0.1, 5.0);
        assert_eq!(evaluate(&f), VerdictCode::PASS);
    }

    #[test]
    fn nte_priority_over_gpm_and_geo() {
        let f = frame(2_000_000.0, 999.0, 999.0);
        assert_eq!(evaluate(&f), VerdictCode::BREACH_NTE);
    }

    #[test]
    fn gpm_priority_over_geo() {
        let f = frame(10.0, 999.0, 999.0);
        assert_eq!(evaluate(&f), VerdictCode::BREACH_GPM);
    }

    #[test]
    fn geo_breach() {
        let f = frame(10.0, 0.1, 999.0);
        assert_eq!(evaluate(&f), VerdictCode::BREACH_GEO);
    }

    #[test]
    fn nan_is_poison_fail_closed() {
        let f = frame(f64::NAN, 0.1, 5.0);
        assert_eq!(evaluate(&f), VerdictCode::POISON);
        // inf is a legal ordered extreme: never poison, but breaches every
        // upper-bound check so it can never PASS (fail-closed preserved).
        let f = frame(10.0, f64::INFINITY, 5.0);
        assert_eq!(evaluate(&f), VerdictCode::BREACH_GPM);
    }

    #[test]
    fn thresholds_live() {
        // assert_live pattern: a pinned/dead threshold must fail here.
        assert!(boundary::NTE_LIMIT_F64.is_finite());
        assert!(boundary::NTE_LIMIT_F64 > 0.0);
        assert!(boundary::GPM_RATE_F64.is_finite() && boundary::GPM_RATE_F64 > 0.0);
        assert!(boundary::GEO_RADIUS_F64.is_finite() && boundary::GEO_RADIUS_F64 > 0.0);
    }
}
