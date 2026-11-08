//! Typed status codes for the raw C-ABI export table (P4 plan: fixed-width
//! integers only across the boundary; zero-JSON law; fail-closed — every
//! failure is a typed refusal code, never a silent zero).
//!
//! Convention: `0 = OK`; every non-zero value is a stable, wire-identifiable
//! refusal class. Placeholder bodies (until P2/P3 kernel APIs are wired)
//! return the `Err_*` code for their class so hosts can distinguish
//! "not yet wired" from real computation results.

#![allow(clippy::upper_case_acronyms)]

/// `repop_solve` / `repop_cas_*` / `repop_receipt_emit` status type.
pub type Status = u32;

/// Success.
pub const OK: Status = 0;

/// Solve rejected the intent frame (decode/validation refusal).
pub const ERR_BAD_INTENT: Status = 1;

/// Solver produced no admissible hyperplane for the intent.
pub const ERR_NO_HYPERPLANE: Status = 2;

/// CAS commit refused: version mismatch (compare-and-swap lost the race).
pub const ERR_CAS_VERSION: Status = 3;

/// CAS read refused: requested key/version absent from the registry.
pub const ERR_CAS_ABSENT: Status = 4;

/// Receipt emit refused: frame fails seal-time validation.
pub const ERR_RECEIPT_INVALID: Status = 5;

/// Internal arena exhaustion (memory.grow refused by the host).
pub const ERR_OOM: Status = 6;

/// Export is a compile-time placeholder — the P2/P3 kernel API it fronts is
/// not yet wired into the glue crate. Hosts MUST treat this as "capability
/// absent", never as a successful no-op.
pub const ERR_UNWIRED: Status = 7;
