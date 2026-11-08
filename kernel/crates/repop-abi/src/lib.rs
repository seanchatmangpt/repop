//! repop-abi — pinned 64-byte frame layouts for the repop kernel boundary.
//!
//! Single source of truth for the three 64-byte frames that cross the
//! kernel/worker/client wire: `IntentFrame` (frame.rs), `HyperplaneRegister`
//! (hyperplane.rs), `ReceiptFrame` (receipt.rs). Envelope law shared by all
//! three (plan 01-abi, decisions 3/5):
//!
//! - exactly 64 bytes, `#[repr(C, align(64))]`, compile-time size/offset courts
//! - little-endian fields, fixed-width only, zero JSON, zero alloc on the codec path
//! - FNV-1a32 digest at offset 60..64 over bytes `[0x00, 0x3C)` — covers every
//!   field, excludes itself and nothing else (both trailing bytes 58..60 are
//!   in-span, bytes 60..64 are the digest itself)
//! - unknown `alg_id`/`magic`/`version` decodes as a typed refusal, never silent
//!
//! Layout truth lives in [`layout_spec`] (field tables + contiguity consts);
//! codecs in [`frame`]/[`hyperplane`]/[`receipt`] derive their encode/decode
//! from those constants. TS mirror and pack gates project from `layout_spec`.
//! Do not hand-edit the tables in `layout_spec.rs`.

#![no_std]
#![forbid(unsafe_op_in_unsafe_fn)]
#![deny(missing_docs)]

pub mod endian;
pub mod frame;
pub mod hyperplane;
pub mod layout_spec;
pub mod receipt;

/// Typed, fail-closed refusals for every decode/validate/seal path.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum AbiError {
    /// Leading u16 does not match the frame's pinned magic.
    BadMagic {
        /// Expected magic constant for the frame kind.
        expected: u16,
        /// Observed leading u16 (LE-decoded).
        observed: u16,
    },
    /// `version` field is not a value this layout pins.
    BadVersion {
        /// Pinned layout version.
        expected: u16,
        /// Observed version field.
        observed: u16,
    },
    /// `alg_id` is outside the pinned seam (`0x0000` keyed-BLAKE3, `0x0001`
    /// ML-DSA-65). Reserved for `receipt::ReceiptFrame`.
    UnsupportedAlgorithm {
        /// Observed alg_id value.
        observed: u16,
    },
    /// FNV-1a32 digest over `[0x00, 0x3C)` does not match bytes 60..64.
    DigestMismatch {
        /// Digest recomputed over the received span.
        computed: u32,
        /// Digest carried in the frame.
        stored: u32,
    },
    /// A reserved/pad field was non-zero on read (law: zero on write,
    /// refused on read — silent drift is how layouts rot).
    NonZeroReserved {
        /// Byte offset of the offending reserved field start.
        offset: usize,
    },
    /// A `HyperplaneRegister` normal vector is degenerate (all-zero) — the
    /// plane does not define a half-space and every projection would be 0.
    DegenerateNormal,
    /// Caller passed a buffer shorter than [`FRAME_SIZE`].
    BufferTooShort {
        /// Required length ([`FRAME_SIZE`]).
        expected: usize,
        /// Observed length.
        observed: usize,
    },
}

impl AbiError {
    /// Stable wire-identifiable refusal class name (used by the TS mirror's
    /// typed result union and the pack refusal-class gates).
    pub fn class(&self) -> &'static str {
        match self {
            AbiError::BadMagic { .. } => "BadMagic",
            AbiError::BadVersion { .. } => "BadVersion",
            AbiError::UnsupportedAlgorithm { .. } => "UnsupportedAlgorithm",
            AbiError::DigestMismatch { .. } => "DigestMismatch",
            AbiError::NonZeroReserved { .. } => "NonZeroReserved",
            AbiError::DegenerateNormal { .. } => "DegenerateNormal",
            AbiError::BufferTooShort { .. } => "BufferTooShort",
        }
    }
}

/// Every frame is exactly 64 bytes (cache-line aligned, plan decision 3).
pub const FRAME_SIZE: usize = 64;

/// Offset of the FNV-1a32 digest field.
pub const DIGEST_OFFSET: usize = 60;

/// Digest span: `[0x00, 0x3C)` — the first 60 bytes (plan decision 5).
pub const DIGEST_SPAN: usize = 60;

/// FNV-1a 32-bit offset basis.
pub const FNV1A32_OFFSET_BASIS: u32 = 2166136261;

/// FNV-1a 32-bit prime.
pub const FNV1A32_PRIME: u32 = 16777619;

/// Compute the pinned FNV-1a32 integrity digest over the first
/// [`DIGEST_SPAN`] bytes of `frame_bytes`.
pub fn compute_digest(frame_bytes: &[u8; FRAME_SIZE]) -> u32 {
    fnv1a32(&frame_bytes[..DIGEST_SPAN])
}

/// FNV-1a 32-bit over an arbitrary byte span (exported for courts/mirror
/// parity; the codec path itself uses [`endian`] primitives only).
pub fn fnv1a32(bytes: &[u8]) -> u32 {
    let mut hash = FNV1A32_OFFSET_BASIS;
    for b in bytes {
        hash ^= u32::from(*b);
        hash = hash.wrapping_mul(FNV1A32_PRIME);
    }
    hash
}
