//! f64 → u64 integer-domain boundary predicates (P2 decision 1).
//!
//! The solver never compares f64s on the hot path. Each metric is bitcast to a
//! monotone `ordered_key`: unsigned integer comparison on keys reproduces the
//! f64 total order exactly (negative-flip: for f < 0 invert all bits, for
//! f >= 0 flip the sign bit), so branchless integer masks are exact, not
//! approximations. NaN (any payload) maps to `NAN_POISON_KEY`, which is greater
//! than every finite key — so a NaN metric breaches every upper-bound check;
//! the poison verdict is then applied explicitly by `nan_poison` detection in
//! the reduce step (typed, fail-closed).

use core::f64;

/// All-ones iff the f64 input was NaN (any payload). Infinity is a legal
/// extreme (ordered, finite-key), NaN is poison.
pub const NAN_POISON_KEY: u64 = u64::MAX;

/// NTE (not-to-exceed) hyperplane threshold — named const, assert_live-probed
/// so a court cannot silently pass on a pinned/dead value (P2 decision 5).
pub const NTE_LIMIT_F64: f64 = 1_000_000.0;
/// GPM burn-rate threshold.
pub const GPM_RATE_F64: f64 = 100.0;
/// Geofence radius threshold.
pub const GEO_RADIUS_F64: f64 = 500.0;

/// Threshold-liveness probe (assert_live pattern): refuses a pinned/dead
/// threshold. Call from any court before trusting a differential result.
pub const fn assert_thresholds_live() -> Result<(), &'static str> {
    if !(NTE_LIMIT_F64 > 0.0) || !NTE_LIMIT_F64.is_finite() {
        return Err("NTE_LIMIT_F64 pinned/dead");
    }
    if !(GPM_RATE_F64 > 0.0) || !GPM_RATE_F64.is_finite() {
        return Err("GPM_RATE_F64 pinned/dead");
    }
    if !(GEO_RADIUS_F64 > 0.0) || !GEO_RADIUS_F64.is_finite() {
        return Err("GEO_RADIUS_F64 pinned/dead");
    }
    // trivial-pin guard: distinct, non-saturated thresholds
    if NTE_LIMIT_F64 == GPM_RATE_F64 || GPM_RATE_F64 == GEO_RADIUS_F64 {
        return Err("thresholds pinned to trivial values");
    }
    Ok(())
}

/// Monotone f64 → u64 order key. Exact total order on ±0/+0 (both map to
/// adjacent keys; -0.0 == 0.0 semantically, keys differ by 1 — documented).
#[inline(always)]
pub const fn ordered_key_f64(x: f64) -> u64 {
    let b = x.to_bits();
    // branchless negative-flip: t = 0 iff b's sign bit clear.
    let sign = b >> 63;
    // for sign=0: key = b ^ (1<<63); for sign=1: key = !b
    let flipped = !b;
    let sign_flipped = b ^ (1u64 << 63);
    // select without a branch:
    // sign=0 → sign_flipped, sign=1 → flipped
    let m = sign.wrapping_neg(); // 0 or MAX
    let key = (m & flipped) | (!m & sign_flipped);
    // NaN (any payload) → all-ones poison key, still branchless.
    key | nan_poison(b)
}

/// NaN detection on the raw bits (exponent all-ones, mantissa nonzero).
#[inline(always)]
pub const fn nan_poison(b: u64) -> u64 {
    let exp = (b >> 52) & 0x7FF;
    let mant = b & ((1u64 << 52) - 1);
    let is_nan = (exp == 0x7FF) & (mant != 0);
    (is_nan as u64).wrapping_neg() // all-ones iff NaN
}

/// Branchless unsigned `a <= b` mask via subtraction borrow (borrow-form).
/// All-ones iff a <= b; correct across the full u64 range including wrap.
#[inline(always)]
pub const fn le_mask_borrow_form(a: u64, b: u64) -> u64 {
    // unsigned a<=b == signed (a^MIN) <= (b^MIN); signed borrow-form, wrap-correct
    const M: u64 = 1u64 << 63;
    let a = a ^ M;
    let b = b ^ M;
    let s = a ^ b; // top bit set iff sign bits differ
    let d = b.wrapping_sub(a);
    // lt_ba: 1 iff b < a (signed borrow form); a<=b iff NOT b<a
    let lt_ba = ((b & !a) | (!s & d)) >> 63;
    // all-ones iff a <= b
    (lt_ba ^ 1).wrapping_neg()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ordered_key_matches_total_order() {
        let mut prev = 0u64; // ordered key of -inf is > 0, so this is below all
        for x in [
            f64::NEG_INFINITY,
            -1e300,
            -1.0,
            -0.0,
            0.0,
            1.0,
            1e300,
            f64::INFINITY,
        ] {
            let k = ordered_key_f64(x);
            assert!(k > prev, "order violated at {x}");
            prev = k;
        }
        // NaN key is above everything
        assert_eq!(ordered_key_f64(f64::NAN), NAN_POISON_KEY);
    }

    #[test]
    fn le_mask_full_range() {
        // exhaustive-ish corners including wrap ranges
        assert_eq!(le_mask_borrow_form(0, 0), u64::MAX);
        assert_eq!(le_mask_borrow_form(0, 5), u64::MAX);
        assert_eq!(le_mask_borrow_form(5, 5), u64::MAX);
        assert_eq!(le_mask_borrow_form(6, 5), 0);
        assert_eq!(le_mask_borrow_form(u64::MAX, 0), 0);
        assert_eq!(le_mask_borrow_form(0, u64::MAX), u64::MAX);
        assert_eq!(le_mask_borrow_form(u64::MAX, u64::MAX), u64::MAX);
        assert_eq!(le_mask_borrow_form(u64::MAX - 1, u64::MAX), u64::MAX);
        // near-wrap case that defeats naive top-bit-of-difference
        assert_eq!(le_mask_borrow_form(u64::MAX, u64::MAX - 1), 0);
        assert_eq!(le_mask_borrow_form((u64::MAX >> 1) + 1, 0), 0);
    }

    #[test]
    fn nan_poison_detects_all_payloads() {
        assert_eq!(nan_poison(f64::NAN.to_bits()), u64::MAX);
        assert_eq!(nan_poison(0x7FF8_0000_0000_0001), u64::MAX);
        assert_eq!(nan_poison(f64::INFINITY.to_bits()), 0); // inf: legal extreme
        assert_eq!(nan_poison(f64::NEG_INFINITY.to_bits()), 0);
        assert_eq!(nan_poison(1.0f64.to_bits()), 0);
        assert_eq!(nan_poison(0.0f64.to_bits()), 0);
    }
}
