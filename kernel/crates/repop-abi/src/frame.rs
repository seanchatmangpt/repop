//! `IntentFrame` — 64B wire envelope carrying a solver intent.

use crate::endian as le;
use crate::layout_spec::{
    INTENT_FIELDS, INTENT_MAGIC, LAYOUT_VERSION,
};
use crate::{
    AbiError, FRAME_SIZE,
};

/// 64B intent envelope. Layout: [`crate::layout_spec::INTENT_FIELDS`].
#[derive(Debug, Clone, Copy, PartialEq)]
#[repr(C, align(64))]
pub struct IntentFrame {
    /// 0..2 — pinned magic 0x4946 ("IF").
    pub magic: u16,
    /// 2..4 — pinned layout version.
    pub version: u16,
    /// 4..6 — solver intent class (closed vocabulary, upstream of kernel).
    pub intent_kind: u16,
    /// 6..8 — reserved; zero on write, refused on read.
    pub flags: u16,
    /// 8..16 — target hyperplane id (LE u64).
    pub hyperplane_id: u64,
    /// 16..24 — decision boundary (IEEE-754 LE).
    pub threshold: f64,
    /// 24..32 — intent weight in the reduction (IEEE-754 LE).
    pub weight: f64,
    /// 32..40 — issuer identity bytes.
    pub issuer: [u8; 8],
    /// 40..56 — payload binding (keyed digest prefix of the referenced body).
    pub payload_binding: [u8; 16],
    /// 56..58 — monotonic per-issuer sequence, mod 2^16.
    pub frame_seq: u16,
    /// 58..60 — reserved; zero on write, refused on read.
    pub reserved: u16,
}

impl IntentFrame {
    /// Well-formed frame at `version` 1 with zeroed reserved fields.
    pub fn new(
        intent_kind: u16,
        hyperplane_id: u64,
        threshold: f64,
        weight: f64,
        issuer: [u8; 8],
        payload_binding: [u8; 16],
        frame_seq: u16,
    ) -> Self {
        Self {
            magic: INTENT_MAGIC,
            version: LAYOUT_VERSION,
            intent_kind,
            flags: 0,
            hyperplane_id,
            threshold,
            weight,
            issuer,
            payload_binding,
            frame_seq,
            reserved: 0,
        }
    }

    /// Encode into the 64-byte wire buffer (LE), computing nothing — the
    /// digest is set by [`Self::seal`]. Zero alloc.
    pub fn encode_into(&self, out: &mut [u8; FRAME_SIZE]) {
        *out = [0u8; FRAME_SIZE];
        le::put_u16(out, INTENT_FIELDS[0].offset, self.magic);
        le::put_u16(out, INTENT_FIELDS[1].offset, self.version);
        le::put_u16(out, INTENT_FIELDS[2].offset, self.intent_kind);
        le::put_u16(out, INTENT_FIELDS[3].offset, self.flags);
        le::put_u64(out, INTENT_FIELDS[4].offset, self.hyperplane_id);
        le::put_f64(out, INTENT_FIELDS[5].offset, self.threshold);
        le::put_f64(out, INTENT_FIELDS[6].offset, self.weight);
        le::put_bytes(out, INTENT_FIELDS[7].offset, &self.issuer);
        le::put_bytes(out, INTENT_FIELDS[8].offset, &self.payload_binding);
        le::put_u16(out, INTENT_FIELDS[9].offset, self.frame_seq);
        le::put_u16(out, INTENT_FIELDS[10].offset, self.reserved);
    }

    /// Encode and seal: encode into `out`, then write the FNV-1a32 digest of
    /// bytes `[0x00, 0x3C)` at offset 60.
    pub fn seal(&self, out: &mut [u8; FRAME_SIZE]) {
        self.encode_into(out);
        let digest = crate::compute_digest(out);
        le::put_u32(out, crate::DIGEST_OFFSET, digest);
    }

    /// Decode from a sealed 64-byte buffer, fail-closed: magic, version,
    /// reserved-zero law, then digest over `[0x00, 0x3C)`.
    pub fn decode(buf: &[u8; FRAME_SIZE]) -> Result<Self, AbiError> {
        let magic = le::get_u16(buf, INTENT_FIELDS[0].offset);
        if magic != INTENT_MAGIC {
            return Err(AbiError::BadMagic { expected: INTENT_MAGIC, observed: magic });
        }
        let version = le::get_u16(buf, INTENT_FIELDS[1].offset);
        if version != LAYOUT_VERSION {
            return Err(AbiError::BadVersion { expected: LAYOUT_VERSION, observed: version });
        }
        Self::verify_digest(buf)?;
        let reserved = le::get_u16(buf, INTENT_FIELDS[10].offset);
        if reserved != 0 {
            return Err(AbiError::NonZeroReserved { offset: INTENT_FIELDS[10].offset });
        }
        Ok(Self {
            magic,
            version,
            intent_kind: le::get_u16(buf, INTENT_FIELDS[2].offset),
            flags: le::get_u16(buf, INTENT_FIELDS[3].offset),
            hyperplane_id: le::get_u64(buf, INTENT_FIELDS[4].offset),
            threshold: le::get_f64(buf, INTENT_FIELDS[5].offset),
            weight: le::get_f64(buf, INTENT_FIELDS[6].offset),
            issuer: le::get_bytes(buf, INTENT_FIELDS[7].offset),
            payload_binding: le::get_bytes(buf, INTENT_FIELDS[8].offset),
            frame_seq: le::get_u16(buf, INTENT_FIELDS[9].offset),
            reserved,
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

    /// Structural validation beyond decode: no extra law for intents beyond
    /// the reserved-zero rule already enforced in [`Self::decode`]; a finite
    /// threshold/weight is required (NaN/inf bytes are a refusal — they would
    /// poison the solver reduction).
    pub fn validate(&self) -> Result<(), AbiError> {
        if !self.threshold.is_finite() || !self.weight.is_finite() {
            return Err(AbiError::DegenerateNormal);
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample(seq: u16) -> IntentFrame {
        IntentFrame::new(3, 0xA20C_0FFE_E5A7_E000, 0.75, -1.5, *b"issuer01", [9u8; 16], seq)
    }

    #[test]
    fn round_trip_sealed() {
        let f = sample(42);
        let mut buf = [0u8; FRAME_SIZE];
        f.seal(&mut buf);
        let back = IntentFrame::decode(&buf).expect("sealed frame decodes");
        assert_eq!(back, f);
    }

    #[test]
    fn unsealed_decode_fails_closed() {
        let f = sample(1);
        let mut buf = [0u8; FRAME_SIZE];
        f.encode_into(&mut buf); // digest bytes remain zero
        match IntentFrame::decode(&buf) {
            Err(AbiError::DigestMismatch { .. }) => {}
            other => panic!("expected DigestMismatch, got {:?}", other.map(|_| ())),
        }
    }

    #[test]
    fn single_bit_mutation_is_digest_mismatch() {
        let f = sample(7);
        let mut buf = [0u8; FRAME_SIZE];
        f.seal(&mut buf);
        buf[17] ^= 0x01;
        assert!(matches!(
            IntentFrame::decode(&buf),
            Err(AbiError::DigestMismatch { .. })
        ));
    }

    #[test]
    fn nan_threshold_refused() {
        let mut f = sample(0);
        f.threshold = f64::NAN;
        assert!(f.validate().is_err());
    }

    #[test]
    fn short_buffer_refused() {
        let f = sample(2);
        let mut buf = [0u8; FRAME_SIZE];
        f.seal(&mut buf);
        assert!(matches!(
            IntentFrame::decode_prefix(&buf[..32]),
            Err(AbiError::BufferTooShort { .. })
        ));
    }
}
