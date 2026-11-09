//! Provisional ABI word pins for the 64B IntentFrame ([u64; 8]).
//!
//! UNVERIFIED-vs-P1: these word positions are C3's provisional pin pending
//! P1's pinned `@repop/abi` layout. A change here is an integration event,
//! not solver drift (P2 plan §Dependencies). Each pin is a single named const
//! so the integration swap is one-line edits.

/// Metric word carrying the NTE (not-to-exceed) f64 value.
pub const METRIC_WORD_NTE: usize = 1;
/// Metric word carrying the GPM (burn-rate) f64 value.
pub const METRIC_WORD_GPM: usize = 2;
/// Metric word carrying the geofence-distance f64 value.
pub const METRIC_WORD_GEO: usize = 3;

/// Standing marker for the pins above. Never referenced by hot-path code;
/// exists so courts can assert the UNVERIFIED status is visible, not silent.
pub const WORD_PIN_STANDING: &str =
    "UNVERIFIED-vs-P1: metric words 1/2/3 provisional, see pin.rs";

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn pins_in_bounds() {
        assert!(METRIC_WORD_NTE < 8 && METRIC_WORD_GPM < 8 && METRIC_WORD_GEO < 8);
        assert!(WORD_PIN_STANDING.starts_with("UNVERIFIED"));
    }
}
