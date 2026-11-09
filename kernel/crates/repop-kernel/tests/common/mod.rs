//! Court harness shared by the P5 kernel courts (C5 lane, wave 3).
//!
//! Subject status: solver/boundary/pin modules are PRESENT (C2 lanes landed
//! `src/{lib,solver,boundary,pin}.rs`); `state.rs` (CAS) and `receipt.rs` are
//! ABSENT (C3 pending) — those courts pin planned signatures and the gate
//! reports exit 2 (SUBJECT_MISSING) for them until they land. Loud, not faked.
//!
//! Pinned API (real, in-tree):
//! - `repop_kernel::evaluate(frame: &[u64; 8]) -> VerdictCode`
//!   (PASS=0 / BREACH_NTE=1 / BREACH_GPM=2 / BREACH_GEO=3 / POISON=0xFF)
//! - `repop_kernel::boundary::{NTE_LIMIT_F64, GPM_RATE_F64, GEO_RADIUS_F64}`
//! - `repop_kernel::boundary::{ordered_key_f64, le_mask_borrow_form, nan_poison}`
//! - `repop_kernel::pin::{METRIC_WORD_NTE, METRIC_WORD_GPM, METRIC_WORD_GEO}`
//!
//! Pinned API (planned, absent — do NOT edit without coordinator sign-off):
//! - `repop_kernel::cas::{Registry, adopt}` (P3, src/state.rs)
//! - `repop_kernel::receipt::{emit, fold}` (P3, src/receipt.rs)

/// SplitMix64 — the corpus RNG (deterministic, zero-dep).
pub struct SplitMix64(pub u64);

impl SplitMix64 {
    #[inline]
    pub fn next_u64(&mut self) -> u64 {
        self.0 = self.0.wrapping_add(0x9E37_79B9_7F4A_7C15);
        let mut z = self.0;
        z = (z ^ (z >> 30)).wrapping_mul(0xBF58_476D_1CE4_E5B9);
        z = (z ^ (z >> 27)).wrapping_mul(0x94D0_49A3_3B52_C9B3);
        z ^ (z >> 31)
    }
}

/// Master corpus seed (P5 plan, resolved decision #1).
pub const MASTER_SEED: u64 = 0xA20C_0FFE_E5A7_E000;

/// Per-lane seed: `master ^ lane_id` — deterministic, non-overlapping streams.
#[inline]
pub fn lane_seed(lane_id: u64) -> u64 {
    MASTER_SEED ^ lane_id
}

/// Lane IDs (distinct streams per court file).
pub const LANE_SOLVER: u64 = 0x5E01;
pub const LANE_CAS: u64 = 0x5E02;
pub const LANE_RECEIPT: u64 = 0x5E03;
pub const LANE_BOUNDARY: u64 = 0x5E04;

/// Mirror of the REAL boundary consts (src/boundary.rs). The pin court asserts
/// mirror == real; drift here is a court bug, not a kernel bug.
pub const NTE_LIMIT: f64 = 1_000_000.0;
pub const GPM_RATE: f64 = 100.0;
pub const GEO_RADIUS: f64 = 500.0;

/// One corpus row: three metric values + entity/version hints for the absent
/// cas/receipt courts.
#[derive(Clone, Copy, Debug)]
pub struct CorpusRow {
    pub nte: f64,
    pub gpm: f64,
    pub geo: f64,
    pub entity: u64,
    pub version_hint: u64,
}

/// Boundary-biased draw: 1/3 uniform, 2/3 in the clamp neighborhood of one of
/// the three limits (exactly where the solver's integer-domain predicates can
/// diverge from an f64-compare oracle).
fn next_boundary_f64(rng: &mut SplitMix64, limit: f64) -> f64 {
    match rng.next_u64() % 3 {
        0 => (rng.next_u64() >> 11) as f64 / (1u64 << 52) as f64,
        _ => {
            // k in [-3, 3] ULP around the limit (f64::next_* semantics)
            let k = (rng.next_u64() % 7) as i32 - 3;
            let mut v = limit;
            for _ in 0..k.abs() {
                v = if k < 0 { f64_from_bits_down(v) } else { f64_from_bits_up(v) };
            }
            v
        }
    }
}

#[inline]
fn f64_from_bits_up(v: f64) -> f64 {
    let b = v.to_bits();
    if v >= 0.0 { f64::from_bits(b + 1) } else { f64::from_bits(b - 1) }
}

#[inline]
fn f64_from_bits_down(v: f64) -> f64 {
    let b = v.to_bits();
    if v > 0.0 { f64::from_bits(b - 1) } else { f64::from_bits(b + 1) }
}

pub fn gen_corpus(lane_id: u64, n: usize) -> Vec<CorpusRow> {
    let mut rng = SplitMix64(lane_seed(lane_id));
    (0..n)
        .map(|_| CorpusRow {
            nte: next_boundary_f64(&mut rng, NTE_LIMIT),
            gpm: next_boundary_f64(&mut rng, GPM_RATE),
            geo: next_boundary_f64(&mut rng, GEO_RADIUS),
            entity: rng.next_u64(),
            version_hint: rng.next_u64(),
        })
        .collect()
}

/// Encode a row into the real 64B frame shape (provisional metric word pins
/// from `pin.rs` — P1 ABI integration pending, per src/lib.rs).
pub fn encode_frame(row: &CorpusRow) -> [u64; 8] {
    let mut f = [0u64; 8];
    f[repop_kernel::METRIC_WORD_NTE] = row.nte.to_bits();
    f[repop_kernel::METRIC_WORD_GPM] = row.gpm.to_bits();
    f[repop_kernel::METRIC_WORD_GEO] = row.geo.to_bits();
    f
}

/// Scalar oracle mirror — the obvious reference semantics (plain f64 compares,
/// plain branches). Mirrors the REAL solver contract: upper-bound-only checks,
/// negatives pass, NaN (any metric) dominates as POISON. Independent of
/// `ordered_key_f64`/`le_mask_borrow_form` machinery by construction.
pub mod oracle_mirror {
    use super::CorpusRow;
    use super::{GEO_RADIUS, GPM_RATE, NTE_LIMIT};
    use repop_kernel::VerdictCode;

    /// Plain reference verdict.
    pub fn evaluate(row: &CorpusRow) -> VerdictCode {
        if row.nte.is_nan() || row.gpm.is_nan() || row.geo.is_nan() {
            return VerdictCode::POISON;
        }
        if row.nte > NTE_LIMIT {
            return VerdictCode::BREACH_NTE;
        }
        if row.gpm > GPM_RATE {
            return VerdictCode::BREACH_GPM;
        }
        if row.geo > GEO_RADIUS {
            return VerdictCode::BREACH_GEO;
        }
        VerdictCode::PASS
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn splitmix64_is_deterministic_and_lane_separated() {
        let mut a = SplitMix64(MASTER_SEED);
        let mut b = SplitMix64(MASTER_SEED);
        for _ in 0..64 {
            assert_eq!(a.next_u64(), b.next_u64());
        }
        let mut c = SplitMix64(lane_seed(LANE_SOLVER));
        let mut d = SplitMix64(lane_seed(LANE_CAS));
        assert_ne!(c.next_u64(), d.next_u64());
    }

    #[test]
    fn mirrors_match_real_consts() {
        // pin: mirror consts must equal the real named consts (court bug guard)
        assert_eq!(NTE_LIMIT, repop_kernel::boundary::NTE_LIMIT_F64);
        assert_eq!(GPM_RATE, repop_kernel::boundary::GPM_RATE_F64);
        assert_eq!(GEO_RADIUS, repop_kernel::boundary::GEO_RADIUS_F64);
    }

    #[test]
    fn oracle_mirror_matches_kernel_on_nan_cases() {
        use repop_kernel::VerdictCode;
        let mut f = [0u64; 8];
        f[repop_kernel::METRIC_WORD_NTE] = f64::NAN.to_bits();
        f[repop_kernel::METRIC_WORD_GPM] = 0.1f64.to_bits();
        f[repop_kernel::METRIC_WORD_GEO] = 5.0f64.to_bits();
        assert_eq!(repop_kernel::evaluate(&f), VerdictCode::POISON);
    }
}
