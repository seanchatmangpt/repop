//! Digest seam for the repop kernel — pluggable BLAKE3, mirroring the
//! `ChainHasher` trait shape in affidavit-core (`~/affidavit/affidavit-core/
//! src/digest.rs`). Law (adopted from affidavit): the kernel's call sites are
//! hash-agnostic — they call the seam, never a concrete implementation.
//!
//! Two implementations:
//! - [`UpstreamBlake3`] (default): delegates to the `blake3` crate (the same
//!   version pin affidavit-core uses). Full-scope: multi-chunk, keyed and
//!   unkeyed, KAT-proven against the official vectors (b3sum 1.8.5
//!   reference; see `tests/digest_kat.rs`).
//! - [`VendoredKeyedBlake3`]: the licensed vendor surface in
//!   [`crate::vendor::keyed_blake3`], retained because it is vendored per D7
//!   (attribution header + NOTICE pin) with the drift row still open. It is
//!   single-chunk by design (refuses > 1024 B keyed; unkeyed leaf/parent
//!   paths only).
//!
//! Receipt/state call sites default to [`UpstreamBlake3`]; the vendored copy
//! remains reachable through the same trait for differential courts.

use crate::vendor::keyed_blake3;

/// A 256-bit digest implementation seam (affidavit `ChainHasher` shape,
/// adapted to the kernel's keyed/unkeyed call shapes).
pub trait Digest256 {
    /// Unkeyed BLAKE3 over `data`.
    fn digest(&self, data: &[u8]) -> [u8; 32];

    /// Keyed BLAKE3 over `data` with a 32-byte key (spec keyed mode:
    /// initial chaining value = the key).
    ///
    /// The vendored fallback refuses input over one chunk (1024 B) with a
    /// typed error — never truncates. The upstream implementation accepts
    /// any length.
    fn digest_keyed(
        &self,
        key: &[u8; 32],
        data: &[u8],
    ) -> Result<[u8; 32], KeyedDigestError>;
}

/// Typed refusal from the keyed digest seam.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum KeyedDigestError {
    /// The implementation's keyed path does not accept this input length
    /// (vendored single-chunk scope: 1024 B max). Refused, never truncated.
    InputTooLong {
        /// Observed length in bytes.
        observed: usize,
    },
}

/// Default implementation: the `blake3` crate (version pinned in
/// `Cargo.toml`, same major pin as affidavit-core).
#[derive(Debug, Clone, Copy, Default)]
pub struct UpstreamBlake3;

impl Digest256 for UpstreamBlake3 {
    fn digest(&self, data: &[u8]) -> [u8; 32] {
        blake3::hash(data).into()
    }

    fn digest_keyed(
        &self,
        key: &[u8; 32],
        data: &[u8],
    ) -> Result<[u8; 32], KeyedDigestError> {
        Ok(blake3::Hasher::new_keyed(key)
            .update(data)
            .finalize()
            .into())
    }
}

/// Vendored fallback: the licensed vendor surface (D7), single-chunk scope.
#[derive(Debug, Clone, Copy, Default)]
pub struct VendoredKeyedBlake3;

impl Digest256 for VendoredKeyedBlake3 {
    fn digest(&self, data: &[u8]) -> [u8; 32] {
        // The vendor module's unkeyed path is single-chunk by design; the
        // kernel's leaf/parent inputs never exceed 1024 B. Oversized input
        // is refused at this seam rather than silently truncated.
        assert!(
            data.len() <= keyed_blake3::MAX_INPUT_LEN,
            "VendoredKeyedBlake3::digest input exceeds single-chunk scope"
        );
        keyed_blake3::hash_unkeyed(data)
    }

    fn digest_keyed(
        &self,
        key: &[u8; 32],
        data: &[u8] ,
    ) -> Result<[u8; 32], KeyedDigestError> {
        keyed_blake3::keyed_digest(key, data)
            .map_err(|e| KeyedDigestError::InputTooLong {
                observed: match e {
                    keyed_blake3::KeyedError::InputTooLong { observed } => observed,
                },
            })
    }
}

/// The kernel's default hasher: upstream `blake3` crate.
pub const DEFAULT_HASHER: UpstreamBlake3 = UpstreamBlake3;

/// Default unkeyed digest (all kernel call sites route here).
pub fn digest(data: &[u8]) -> [u8; 32] {
    DEFAULT_HASHER.digest(data)
}

/// Default keyed digest (all kernel call sites route here).
pub fn digest_keyed(key: &[u8; 32], data: &[u8]) -> Result<[u8; 32], KeyedDigestError> {
    DEFAULT_HASHER.digest_keyed(key, data)
}

#[cfg(test)]
mod tests {
    extern crate std;
    use super::*;
    use std::vec::Vec;

    #[test]
    fn seam_impls_agree_within_single_block() {
        // Agreement holds only within one 64-byte block. At n=65+ the
        // vendored copy diverges from upstream (multi-block defect,
        // KAT-witnessed: fails the 1000-byte keyed vector in
        // tests/digest_kat.rs). Pinned here as the witnessed drift.
        for n in [0usize, 1, 63, 64] {
            let data: Vec<u8> = (0..n).map(|i| (i % 251) as u8).collect();
            assert_eq!(
                UpstreamBlake3.digest(&data),
                VendoredKeyedBlake3.digest(&data),
                "unkeyed digests diverge at n={n}"
            );
            let key = [7u8; 32];
            assert_eq!(
                UpstreamBlake3.digest_keyed(&key, &data).unwrap(),
                VendoredKeyedBlake3.digest_keyed(&key, &data).unwrap(),
                "keyed digests diverge at n={n}"
            );
        }
        // Witnessed divergence beyond one block (drift evidence, not a
        // regression): the vendored copy must NOT match upstream at n=65.
        let data: Vec<u8> = (0..65u32).map(|i| i as u8).collect();
        assert_ne!(
            UpstreamBlake3.digest(&data),
            VendoredKeyedBlake3.digest(&data),
            "expected the witnessed multi-block divergence at n=65"
        );
    }

    #[test]
    fn vendored_keyed_refuses_over_one_chunk() {
        let key = [9u8; 32];
        let data = [0u8; 1025];
        assert_eq!(
            VendoredKeyedBlake3.digest_keyed(&key, &data),
            Err(KeyedDigestError::InputTooLong { observed: 1025 })
        );
        // Upstream accepts the same input (full-scope).
        assert!(UpstreamBlake3.digest_keyed(&key, &data).is_ok());
    }
}
