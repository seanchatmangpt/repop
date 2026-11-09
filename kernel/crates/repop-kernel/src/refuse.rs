//! Typed refusal taxonomy for the repop kernel (P3 plan, closed enum).
//!
//! Law: refusals are a closed enum, never `Result<_, ()>` or strings; every
//! refusal is replayable from its fields (entity, expected, actual / expected,
//! got), so a refusal can be re-derived from the receipt log without
//! re-executing the failed transition.

#![no_std]

/// Closed refusal taxonomy (P3 resolved decision 5).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Refusal {
    /// CAS version conflict: the stored version was not `expected`.
    VersionConflict {
        /// Entity whose version conflicted.
        entity: u64,
        /// Version the caller expected.
        expected: u64,
        /// Version actually stored (the winner's version).
        actual: u64,
    },
    /// A lease ticket was already consumed: double-spend refused at the
    /// runtime boundary (the typestate is the primary guard; this is the
    /// FFI-facing check).
    LeaseAlreadySpent,
    /// The caller's receipt sequence does not match the kernel's monotonic
    /// `receipt_seq` counter (fetch_add Relaxed): a receipt would be lost or
    /// duplicated.
    ReceiptSequenceGap {
        /// Sequence the kernel expects next.
        expected: u64,
        /// Sequence the caller presented.
        got: u64,
    },
    /// The per-entity registry is at [`crate::state::REGISTRY_CAP`] entities.
    RegistryExhausted,
    /// A version counter reached `u64::MAX`; no monotonic advance exists.
    VersionOverflow {
        /// Entity whose counter saturated.
        entity: u64,
        /// The saturated version.
        at: u64,
    },
    /// A lease carried `tick >= tick_ceiling`: no live lease can emit it
    /// (authority invariant; mirrors cgap §5's exhausted-lease law).
    ExhaustedLease {
        /// Claimed tick.
        tick: u64,
        /// Claimed ceiling.
        tick_ceiling: u64,
    },
}
