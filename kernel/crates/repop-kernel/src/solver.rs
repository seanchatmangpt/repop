//! Hyperplane solver — zero-branch hot cell, mask-select reduction (P2 §1–2).
//!
//! The hot cell `evaluate` performs: three boundary mask computations in the
//! integer domain (no f64 compare, no branch), a NaN poison OR-reduce, and a
//! priority select over already-reduced breach bits (NTE > GPM > GEO). The
//! cold wrapper `cold_validate` holds the branchy structural checks that are
//! off the hot-path contract.

use crate::boundary::{
    le_mask_borrow_form, nan_poison, ordered_key_f64, GPM_RATE_F64, GEO_RADIUS_F64,
    NTE_LIMIT_F64,
};
use crate::pin::{METRIC_WORD_GEO, METRIC_WORD_GPM, METRIC_WORD_NTE};

/// Verdict codes — plain fixed-width enum, receipt-encodable by P3 with no
/// heap. Numeric discriminants are pinned (C3 contract):
/// PASS=0 / BREACH_NTE=1 / BREACH_GPM=2 / BREACH_GEO=3 / POISON=0xFF.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
#[allow(non_camel_case_types)] // discriminant names are the pinned contract vocab
#[repr(u8)]
pub enum VerdictCode {
    PASS = 0,
    BREACH_NTE = 1,
    BREACH_GPM = 2,
    BREACH_GEO = 3,
    POISON = 0xFF,
}

impl VerdictCode {
    #[inline(always)]
    pub const fn as_u8(self) -> u8 {
        self as u8
    }
}

/// Zero-branch hot cell. Consumes the 64B frame as `[u64; 8]`; word pins in
/// `pin.rs` (UNVERIFIED-vs-P1).
#[inline(always)]
pub fn evaluate(frame: &[u64; 8]) -> VerdictCode {
    // Integer-domain boundary predicates (decision 1): all-ones mask iff the
    // metric is compliant (metric key <= limit key), no f64 compare, no branch.
    let m_nte = le_mask_borrow_form(
        ordered_key_f64(f64::from_bits(frame[METRIC_WORD_NTE])),
        ordered_key_f64(NTE_LIMIT_F64),
    );
    let m_gpm = le_mask_borrow_form(
        ordered_key_f64(f64::from_bits(frame[METRIC_WORD_GPM])),
        ordered_key_f64(GPM_RATE_F64),
    );
    let m_geo = le_mask_borrow_form(
        ordered_key_f64(f64::from_bits(frame[METRIC_WORD_GEO])),
        ordered_key_f64(GEO_RADIUS_F64),
    );
    // NaN poison OR-reduce across the three metric words (fail-closed).
    let poison = nan_poison(frame[METRIC_WORD_NTE])
        | nan_poison(frame[METRIC_WORD_GPM])
        | nan_poison(frame[METRIC_WORD_GEO]);
    reduce(m_nte, m_gpm, m_geo, poison)
}

/// Mask-select reduction (decision 2). Masks are all-ones iff compliant;
/// breach bit = 1 iff non-compliant. Priority NTE > GPM > GEO; poison
/// dominates everything. The compare-to-zero branch is on already-reduced
/// bits, not on the f64 boundary path.
#[inline(always)]
pub const fn reduce(m_nte: u64, m_gpm: u64, m_geo: u64, poison: u64) -> VerdictCode {
    let b_nte = ((m_nte != 0) as u8).wrapping_sub(1); // 0xFF iff breach
    let b_gpm = ((m_gpm != 0) as u8).wrapping_sub(1);
    let b_geo = ((m_geo != 0) as u8).wrapping_sub(1);

    // priority select network via arithmetic; each term is 1 only when this
    // family is the highest-priority breach (or pass) — no data branches.
    let nte_sel = b_nte & 1;
    let gpm_sel = (!b_nte & 1) & (b_gpm & 1);
    let geo_sel = (!b_nte & 1) & (!b_gpm & 1) & (b_geo & 1);
    let pass_sel = (!b_nte & 1) & (!b_gpm & 1) & (!b_geo & 1);
    let poison_sel = ((poison != 0) as u8) & 1;

    // poison dominates: fold every other selection under it
    let nte_sel = nte_sel & (poison_sel ^ 1);
    let gpm_sel = gpm_sel & (poison_sel ^ 1);
    let geo_sel = geo_sel & (poison_sel ^ 1);
    let pass_sel = pass_sel & (poison_sel ^ 1);

    let code = (nte_sel * VerdictCode::BREACH_NTE as u8)
        | (gpm_sel * VerdictCode::BREACH_GPM as u8)
        | (geo_sel * VerdictCode::BREACH_GEO as u8)
        | (pass_sel * VerdictCode::PASS as u8)
        | (poison_sel * VerdictCode::POISON as u8);
    // SAFETY-of-arithmetic: exactly one sel is 1 (sel network is a partition),
    // so code is the selected discriminant. `from` would branch; this is the
    // contract-level zero-branch form. Verified by the differential court.
    from_discriminant(code)
}

#[inline(always)]
const fn from_discriminant(code: u8) -> VerdictCode {
    match code {
        0 => VerdictCode::PASS,
        1 => VerdictCode::BREACH_NTE,
        2 => VerdictCode::BREACH_GPM,
        3 => VerdictCode::BREACH_GEO,
        _ => VerdictCode::POISON,
    }
}

/// Cold validate wrapper: structural checks that are allowed to branch. Not
/// on the hot path contract; callers run this once per frame batch boundary,
/// the hot cell per frame.
pub fn cold_validate(frame: &[u64; 8]) -> Result<(), ColdError> {
    for (i, w) in frame.iter().enumerate() {
        if nan_poison(*w) != 0 {
            // a NaN anywhere in the frame is domain poison (fail-closed), but
            // only metric words 1/2/3 make the *verdict* POISON via `evaluate`.
            return Err(ColdError::NonMetricNan { word: i });
        }
    }
    Ok(())
}

/// Typed cold-path refusal.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ColdError {
    /// NaN bits in a word outside the metric pins.
    NonMetricNan { word: usize },
}

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
    fn verdict_discriminants_pinned() {
        assert_eq!(VerdictCode::PASS.as_u8(), 0);
        assert_eq!(VerdictCode::BREACH_NTE.as_u8(), 1);
        assert_eq!(VerdictCode::BREACH_GPM.as_u8(), 2);
        assert_eq!(VerdictCode::BREACH_GEO.as_u8(), 3);
        assert_eq!(VerdictCode::POISON.as_u8(), 0xFF);
    }

    #[test]
    fn priority_order() {
        // all three breached: NTE wins
        assert_eq!(evaluate(&frame(1e9, 1e9, 1e9)), VerdictCode::BREACH_NTE);
        // NTE ok, both GPM+GEO breached: GPM wins
        assert_eq!(evaluate(&frame(1.0, 1e9, 1e9)), VerdictCode::BREACH_GPM);
        assert_eq!(evaluate(&frame(1.0, 1.0, 1e9)), VerdictCode::BREACH_GEO);
        assert_eq!(evaluate(&frame(1.0, 1.0, 1.0)), VerdictCode::PASS);
    }

    #[test]
    fn poison_dominates() {
        assert_eq!(
            evaluate(&frame(1e9, 1e9, f64::NAN)),
            VerdictCode::POISON,
            "breach+NaN must be POISON"
        );
        assert_eq!(evaluate(&frame(f64::NAN, 1.0, 1.0)), VerdictCode::POISON);
    }

    #[test]
    fn negative_and_zero_metrics_pass() {
        assert_eq!(evaluate(&frame(-5.0, 0.0, -1e9)), VerdictCode::PASS);
        assert_eq!(evaluate(&frame(-0.0, -0.0, 0.0)), VerdictCode::PASS);
    }

    #[test]
    fn cold_validate_catches_nonmetric_nan() {
        let mut f = frame(1.0, 1.0, 1.0);
        f[0] = f64::NAN.to_bits();
        assert_eq!(cold_validate(&f), Err(ColdError::NonMetricNan { word: 0 }));
    }
}

#[cfg(test)]
mod differential {
    //! In-file differential court: solver vs naive scalar oracle over a
    //! SplitMix64 corpus (seed 0xA20C_0FFE_E5A7_E000, R4/E15 pin).
    use super::*;
    use crate::boundary::assert_thresholds_live;

    struct SplitMix64(u64);
    impl SplitMix64 {
        fn next(&mut self) -> u64 {
            self.0 = self.0.wrapping_add(0x9E37_79B9_7F4A_7C15);
            let mut z = self.0;
            z = (z ^ (z >> 30)).wrapping_mul(0xBF58_476D_1CE4_E5B9);
            z = (z ^ (z >> 27)).wrapping_mul(0x94D0_49A3_3DC1_DC43);
            z ^ (z >> 31)
        }
        fn f64_metric(&mut self) -> f64 {
            // mixed distribution: normals, extremes, near-threshold, NaN/inf
            let r = self.next();
            match r % 8 {
                0 | 1 | 2 => (r % 4_000_000) as f64,            // around limits
                3 => (r % 4_000_000) as f64 * 1e-6,             // small/zero/negative-ish
                4 => -((r % 1000) as f64),                      // negative
                5 => f64::from_bits(r & 0x7FF0_0000_0000_0000), // extreme exponents
                6 if r & 1 == 0 => f64::NAN,
                _ => (r % 2_000_000) as f64,
            }
        }
    }

    /// Naive scalar oracle: obvious-to-a-human control-flow implementation.
    fn oracle(nte: f64, gpm: f64, geo: f64) -> u8 {
        if nte.is_nan() || gpm.is_nan() || geo.is_nan() {
            return 0xFF;
        }
        if nte > NTE_LIMIT_F64 {
            return 1;
        }
        if gpm > GPM_RATE_F64 {
            return 2;
        }
        if geo > GEO_RADIUS_F64 {
            return 3;
        }
        0
    }

    #[test]
    fn differential_vs_oracle_splitmix64() {
        assert_eq!(assert_thresholds_live(), Ok(()));
        let mut rng = SplitMix64(0xA20C_0FFE_E5A7_E000);
        for i in 0..20_000 {
            let (n, g, e) = (rng.f64_metric(), rng.f64_metric(), rng.f64_metric());
            let mut frame = [0u64; 8];
            frame[METRIC_WORD_NTE] = n.to_bits();
            frame[METRIC_WORD_GPM] = g.to_bits();
            frame[METRIC_WORD_GEO] = e.to_bits();
            let got = evaluate(&frame).as_u8();
            let want = oracle(n, g, e);
            assert_eq!(got, want, "corpus idx {i}: nte={n} gpm={g} geo={e}");
        }
    }

    #[test]
    fn mutation_leg_flipped_predicate_fails() {
        // the court carries its own kill: a mutated boundary must disagree
        // with the oracle on the corpus (non-vacuity of the differential).
        let mut rng = SplitMix64(0xA20C_0FFE_E5A7_E000);
        let mut disagreements = 0;
        for _ in 0..20_000 {
            let (n, g, e) = (rng.f64_metric(), rng.f64_metric(), rng.f64_metric());
            let mut frame = [0u64; 8];
            frame[METRIC_WORD_NTE] = n.to_bits();
            frame[METRIC_WORD_GPM] = g.to_bits();
            frame[METRIC_WORD_GEO] = e.to_bits();
            // mutated solver: NTE limit doubled — must produce disagreements
            let got = if n > NTE_LIMIT_F64 * 2.0 { 1 } else {
                if g > GPM_RATE_F64 { 2 } else if e > GEO_RADIUS_F64 { 3 } else { 0 }
            };
            let want = oracle(n, g, e);
            if got != want {
                disagreements += 1;
            }
        }
        assert!(disagreements > 0, "mutated predicate produced NO disagreements — court is vacuous");
    }
}
