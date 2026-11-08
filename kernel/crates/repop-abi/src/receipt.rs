//! `ReceiptFrame` — 64B receipt envelope (the PQC seam, plan 01-abi
//! decision 1/2): the wire carries a 32B keyed-BLAKE3 binding of the 229B
//! `UnsealedReceipt`; the ML-DSA-65 seal applies server-side at the trust
//! boundary and is addressed by the same `alg_id` field.

use crate::endian as le;
use crate::layout_spec::{
    ALG_ID_KEYED_BLAKE3, ALG_ID_ML_DSA_65, LAYOUT_VERSION, RECEIPT_FIELDS, RECEIPT_MAGIC,
};
use crate::{AbiError, FRAME_SIZE};

/// 64B receipt envelope. Layout: [`crate::layout_spec::RECEIPT_FIELDS`].
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
#[repr(C, align(64))]
pub struct ReceiptFrame {
    /// 0..2 — pinned magic 0x5246 ("RF").
    pub magic: u16,
    /// 2..4 — pinned layout version.
    pub version: u16,
    /// 4..6 — algorithm seam: 0x0000 keyed-BLAKE3, 0x0001 ML-DSA-65.
    pub alg_id: u16,
    /// 6..8 — reserved; zero on write, pinned-but-ignored on read per plan,
    /// refused here (stricter than plan: reserved drift is layout rot).
    pub flags: u16,
    /// 8..40 — 32B keyed-BLAKE3 binding of the 229B UnsealedReceipt.
    pub binding: [u8; 32],
    /// 40..56 — admissions Merkle root prefix.
    pub admissions_root_prefix: [u8; 16],
    /// 56..58 — monotonic per-issuer sequence, mod 2^16.
    pub frame_seq: u16,
    /// 58..60 — variable-length annex length; zero now (law).
    pub payload_len: u16,
}

impl ReceiptFrame {
    /// Well-formed keyed-BLAKE3 (tier-0) envelope at `version` 1.
    pub fn new_keyed_blake3(
        binding: [u8; 32],
        admissions_root_prefix: [u8; 16],
        frame_seq: u16,
    ) -> Self {
        Self {
            magic: RECEIPT_MAGIC,
            version: LAYOUT_VERSION,
            alg_id: ALG_ID_KEYED_BLAKE3,
            flags: 0,
            binding,
            admissions_root_prefix,
            frame_seq,
            payload_len: 0,
        }
    }

    /// Well-formed ML-DSA-65 (tier-1, server trust boundary) envelope.
    pub fn new_ml_dsa_65(
        binding: [u8; 32],
        admissions_root_prefix: [u8; 16],
        frame_seq: u16,
    ) -> Self {
        Self {
            alg_id: ALG_ID_ML_DSA_65,
            ..Self::new_keyed_blake3(binding, admissions_root_prefix, frame_seq)
        }
    }

    /// Encode into the 64-byte wire buffer (LE), unsealed. Zero alloc.
    pub fn encode_into(&self, out: &mut [u8; FRAME_SIZE]) {
        *out = [0u8; FRAME_SIZE];
        le::put_u16(out, RECEIPT_FIELDS[0].offset, self.magic);
        le::put_u16(out, RECEIPT_FIELDS[1].offset, self.version);
        le::put_u16(out, RECEIPT_FIELDS[2].offset, self.alg_id);
        le::put_u16(out, RECEIPT_FIELDS[3].offset, self.flags);
        le::put_bytes(out, RECEIPT_FIELDS[4].offset, &self.binding);
        le::put_bytes(out, RECEIPT_FIELDS[5].offset, &self.admissions_root_prefix);
        le::put_u16(out, RECEIPT_FIELDS[6].offset, self.frame_seq);
        le::put_u16(out, RECEIPT_FIELDS[7].offset, self.payload_len);
    }

    /// Encode and seal: FNV-1a32 over `[0x00, 0x3C)` written at offset 60.
    pub fn seal(&self, out: &mut [u8; FRAME_SIZE]) {
        self.encode_into(out);
        let digest = crate::compute_digest(out);
        le::put_u32(out, crate::DIGEST_OFFSET, digest);
    }

    /// Decode from a sealed 64-byte buffer, fail-closed: magic, version,
    /// `alg_id` seam, digest, reserved-zero + `payload_len == 0` law.
    pub fn decode(buf: &[u8; FRAME_SIZE]) -> Result<Self, AbiError> {
        let magic = le::get_u16(buf, RECEIPT_FIELDS[0].offset);
        if magic != RECEIPT_MAGIC {
            return Err(AbiError::BadMagic { expected: RECEIPT_MAGIC, observed: magic });
        }
        let version = le::get_u16(buf, RECEIPT_FIELDS[1].offset);
        if version != LAYOUT_VERSION {
            return Err(AbiError::BadVersion { expected: LAYOUT_VERSION, observed: version });
        }
        let alg_id = le::get_u16(buf, RECEIPT_FIELDS[2].offset);
        if alg_id != ALG_ID_KEYED_BLAKE3 && alg_id != ALG_ID_ML_DSA_65 {
            return Err(AbiError::UnsupportedAlgorithm { observed: alg_id });
        }
        Self::verify_digest(buf)?;
        let flags = le::get_u16(buf, RECEIPT_FIELDS[3].offset);
        if flags != 0 {
            return Err(AbiError::NonZeroReserved { offset: RECEIPT_FIELDS[3].offset });
        }
        let payload_len = le::get_u16(buf, RECEIPT_FIELDS[7].offset);
        if payload_len != 0 {
            return Err(AbiError::NonZeroReserved { offset: RECEIPT_FIELDS[7].offset });
        }
        Ok(Self {
            magic,
            version,
            alg_id,
            flags,
            binding: le::get_bytes(buf, RECEIPT_FIELDS[4].offset),
            admissions_root_prefix: le::get_bytes(buf, RECEIPT_FIELDS[5].offset),
            frame_seq: le::get_u16(buf, RECEIPT_FIELDS[6].offset),
            payload_len,
        })
    }

    /// Decode from an unsealed (length-checked) byte slice prefix.
    pub fn decode_prefix(buf: &[u8]) -> Result<Self, AbiError> {
        if buf.len() < FRAME_SIZE {
            return Err(AbiError::BufferTooShort {
                expected: FRAME_SIZE,
                observed: buf.len(),
            });
        }
        let mut framed = [0u8; FRAME_SIZE];
        framed.copy_from_slice(&buf[..FRAME_SIZE]);
        Self::decode(&framed)
    }

    /// Verify the FNV-1a32 digest over `[0x00, 0x3C)` against bytes 60..64.
    pub fn verify_digest(buf: &[u8; FRAME_SIZE]) -> Result<u32, AbiError> {
        let computed = crate::compute_digest(buf);
        let stored = le::get_u32(buf, crate::DIGEST_OFFSET);
        if computed != stored {
            return Err(AbiError::DigestMismatch { computed, stored });
        }
        Ok(computed)
    }

    /// Structural validation: binding must be non-zero and `alg_id` known.
    /// A zero binding would "verify" an absent receipt — refused.
    pub fn validate(&self) -> Result<(), AbiError> {
        if self.alg_id != ALG_ID_KEYED_BLAKE3 && self.alg_id != ALG_ID_ML_DSA_65 {
            return Err(AbiError::UnsupportedAlgorithm { observed: self.alg_id });
        }
        if self.binding == [0u8; 32] {
            return Err(AbiError::DegenerateNormal);
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample(alg: u16) -> ReceiptFrame {
        let mut f = ReceiptFrame::new_keyed_blake3([7u8; 32], [0xAAu8; 16], 11);
        f.alg_id = alg;
        f
    }

    #[test]
    fn round_trip_both_tiers() {
        for alg in [ALG_ID_KEYED_BLAKE3, ALG_ID_ML_DSA_65] {
            let f = sample(alg);
            let mut buf = [0u8; FRAME_SIZE];
            f.seal(&mut buf);
            assert_eq!(ReceiptFrame::decode(&buf).expect("decodes"), f);
        }
    }

    #[test]
    fn unknown_alg_id_refused() {
        let mut buf = [0u8; FRAME_SIZE];
        sample(0xFFFF).seal(&mut buf);
        assert!(matches!(
            ReceiptFrame::decode(&buf),
            Err(AbiError::UnsupportedAlgorithm { observed: 0xFFFF })
        ));
    }

    #[test]
    fn mutation_is_digest_mismatch() {
        let mut buf = [0u8; FRAME_SIZE];
        sample(ALG_ID_KEYED_BLAKE3).seal(&mut buf);
        buf[9] ^= 0x40;
        assert!(matches!(
            ReceiptFrame::decode(&buf),
            Err(AbiError::DigestMismatch { .. })
        ));
    }

    #[test]
    fn zero_binding_refused() {
        let f = ReceiptFrame::new_keyed_blake3([0u8; 32], [1u8; 16], 0);
        assert!(matches!(f.validate(), Err(AbiError::DegenerateNormal)));
    }

    #[test]
    fn envelope_shape_pins() {
        // plan-pinned map: digest at 60..64 over [0x00,0x3C); binding 32B at 8.
        let f = sample(ALG_ID_KEYED_BLAKE3);
        let mut buf = [0u8; FRAME_SIZE];
        f.seal(&mut buf);
        assert_eq!(le::get_u16(&buf, 0), 0x5246);
        assert_eq!(buf[8], 7);
        assert_eq!(buf[39], 7);
        assert_eq!(buf[40], 0xAA);
        assert_eq!(buf[55], 0xAA);
        assert_eq!(le::get_u32(&buf, 60), crate::compute_digest(&buf));
        assert_eq!(buf[56..58], 11u16.to_le_bytes());
    }
}
