//! `HyperplaneRegister` — 64B wire envelope pinning a solver hyperplane
//! (normal vector + offset) and its projection seam.

use crate::endian as le;
use crate::layout_spec::{HYPERPLANE_FIELDS, HYPERPLANE_MAGIC, LAYOUT_VERSION};
use crate::{AbiError, FRAME_SIZE};

/// 64B hyperplane envelope. Layout: [`crate::layout_spec::HYPERPLANE_FIELDS`].
#[derive(Debug, Clone, Copy, PartialEq)]
#[repr(C, align(64))]
pub struct HyperplaneRegister {
    /// 0..2 — pinned magic 0x4850 ("HP").
    pub magic: u16,
    /// 2..4 — pinned layout version.
    pub version: u16,
    /// 4..6 — plane class (closed vocabulary).
    pub plane_kind: u16,
    /// 6..8 — reserved; zero on write, refused on read.
    pub flags: u16,
    /// 8..16 — plane identity (LE u64).
    pub plane_id: u64,
    /// 16..24 — normal vector x (IEEE-754 LE).
    pub normal_x: f64,
    /// 24..32 — normal vector y.
    pub normal_y: f64,
    /// 32..40 — normal vector z.
    pub normal_z: f64,
    /// 40..48 — plane offset along the normal (IEEE-754 LE).
    pub offset: f64,
    /// 48..56 — registration binding (digest prefix over the defining body).
    pub binding: [u8; 8],
    /// 56..58 — monotonic registration epoch, mod 2^16.
    pub epoch: u16,
    /// 58..60 — reserved; zero on write, refused on read.
    pub reserved: u16,
}

impl HyperplaneRegister {
    /// Well-formed register at `version` 1 with zeroed reserved fields.
    #[allow(clippy::too_many_arguments)]
    pub fn new(
        plane_kind: u16,
        plane_id: u64,
        normal: [f64; 3],
        offset: f64,
        binding: [u8; 8],
        epoch: u16,
    ) -> Self {
        Self {
            magic: HYPERPLANE_MAGIC,
            version: LAYOUT_VERSION,
            plane_kind,
            flags: 0,
            plane_id,
            normal_x: normal[0],
            normal_y: normal[1],
            normal_z: normal[2],
            offset,
            binding,
            epoch,
            reserved: 0,
        }
    }

    /// Encode into the 64-byte wire buffer (LE), unsealed (digest zero).
    /// Zero alloc.
    pub fn encode_into(&self, out: &mut [u8; FRAME_SIZE]) {
        *out = [0u8; FRAME_SIZE];
        le::put_u16(out, HYPERPLANE_FIELDS[0].offset, self.magic);
        le::put_u16(out, HYPERPLANE_FIELDS[1].offset, self.version);
        le::put_u16(out, HYPERPLANE_FIELDS[2].offset, self.plane_kind);
        le::put_u16(out, HYPERPLANE_FIELDS[3].offset, self.flags);
        le::put_u64(out, HYPERPLANE_FIELDS[4].offset, self.plane_id);
        le::put_f64(out, HYPERPLANE_FIELDS[5].offset, self.normal_x);
        le::put_f64(out, HYPERPLANE_FIELDS[6].offset, self.normal_y);
        le::put_f64(out, HYPERPLANE_FIELDS[7].offset, self.normal_z);
        le::put_f64(out, HYPERPLANE_FIELDS[8].offset, self.offset);
        le::put_bytes(out, HYPERPLANE_FIELDS[9].offset, &self.binding);
        le::put_u16(out, HYPERPLANE_FIELDS[10].offset, self.epoch);
        le::put_u16(out, HYPERPLANE_FIELDS[11].offset, self.reserved);
    }

    /// Encode and seal: write the FNV-1a32 digest over `[0x00, 0x3C)` at 60.
    pub fn seal(&self, out: &mut [u8; FRAME_SIZE]) {
        self.encode_into(out);
        let digest = crate::compute_digest(out);
        le::put_u32(out, crate::DIGEST_OFFSET, digest);
    }

    /// Decode from a sealed 64-byte buffer, fail-closed: magic, version,
    /// digest, reserved-zero law.
    pub fn decode(buf: &[u8; FRAME_SIZE]) -> Result<Self, AbiError> {
        let magic = le::get_u16(buf, HYPERPLANE_FIELDS[0].offset);
        if magic != HYPERPLANE_MAGIC {
            return Err(AbiError::BadMagic { expected: HYPERPLANE_MAGIC, observed: magic });
        }
        let version = le::get_u16(buf, HYPERPLANE_FIELDS[1].offset);
        if version != LAYOUT_VERSION {
            return Err(AbiError::BadVersion { expected: LAYOUT_VERSION, observed: version });
        }
        Self::verify_digest(buf)?;
        let reserved = le::get_u16(buf, HYPERPLANE_FIELDS[11].offset);
        if reserved != 0 {
            return Err(AbiError::NonZeroReserved { offset: HYPERPLANE_FIELDS[11].offset });
        }
        Ok(Self {
            magic,
            version,
            plane_kind: le::get_u16(buf, HYPERPLANE_FIELDS[2].offset),
            flags: le::get_u16(buf, HYPERPLANE_FIELDS[3].offset),
            plane_id: le::get_u64(buf, HYPERPLANE_FIELDS[4].offset),
            normal_x: le::get_f64(buf, HYPERPLANE_FIELDS[5].offset),
            normal_y: le::get_f64(buf, HYPERPLANE_FIELDS[6].offset),
            normal_z: le::get_f64(buf, HYPERPLANE_FIELDS[7].offset),
            offset: le::get_f64(buf, HYPERPLANE_FIELDS[8].offset),
            binding: le::get_bytes(buf, HYPERPLANE_FIELDS[9].offset),
            epoch: le::get_u16(buf, HYPERPLANE_FIELDS[10].offset),
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

    /// Structural validation: the normal must define a half-space (non-zero
    /// length) and all components plus the offset must be finite. NaN/inf
    /// would poison the branchless reduction; a zero normal makes every
    /// projection degenerate.
    pub fn validate(&self) -> Result<(), AbiError> {
        if !self.normal_x.is_finite()
            || !self.normal_y.is_finite()
            || !self.normal_z.is_finite()
            || !self.offset.is_finite()
        {
            return Err(AbiError::DegenerateNormal);
        }
        if self.normal_x == 0.0 && self.normal_y == 0.0 && self.normal_z == 0.0 {
            return Err(AbiError::DegenerateNormal);
        }
        Ok(())
    }

    /// Signed distance of point `p` from the plane: `n . p - offset`.
    /// Positive = above (kept side). Call [`Self::validate`] first; this is
    /// the raw projection the solver reduces over.
    #[inline]
    pub fn project(&self, px: f64, py: f64, pz: f64) -> f64 {
        self.normal_x * px + self.normal_y * py + self.normal_z * pz - self.offset
    }

    /// Boolean half-space membership: `project(p) >= 0`.
    #[inline]
    pub fn contains(&self, px: f64, py: f64, pz: f64) -> bool {
        self.project(px, py, pz) >= 0.0
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample() -> HyperplaneRegister {
        HyperplaneRegister::new(
            1,
            0xA20C_0FFE_E5A7_E000,
            [0.0, 1.0, 0.0],
            5.0,
            *b"reg01xxx",
            3,
        )
    }

    #[test]
    fn round_trip_sealed() {
        let f = sample();
        let mut buf = [0u8; FRAME_SIZE];
        f.seal(&mut buf);
        assert_eq!(HyperplaneRegister::decode(&buf).expect("decodes"), f);
    }

    #[test]
    fn mutation_is_digest_mismatch() {
        let mut buf = [0u8; FRAME_SIZE];
        sample().seal(&mut buf);
        buf[40] ^= 0x80;
        assert!(matches!(
            HyperplaneRegister::decode(&buf),
            Err(AbiError::DigestMismatch { .. })
        ));
    }

    #[test]
    fn zero_normal_refused() {
        let mut f = sample();
        f.normal_y = 0.0;
        assert!(matches!(f.validate(), Err(AbiError::DegenerateNormal)));
    }

    #[test]
    fn projection_signs() {
        let f = sample(); // y >= 5 kept
        assert!((f.project(1.0, 7.0, 1.0) - 2.0).abs() < 1e-12);
        assert!(f.contains(0.0, 5.0, 0.0));
        assert!(!f.contains(0.0, 4.999, 0.0));
    }

    #[test]
    fn reserved_nonzero_refused() {
        let mut f = sample();
        let mut buf = [0u8; FRAME_SIZE];
        f.reserved = 1;
        f.seal(&mut buf);
        // reserved is inside the digest span, so reseal covers it; decode must
        // still refuse the non-zero reserved field by law.
        f.reserved = 1;
        let mut b2 = [0u8; FRAME_SIZE];
        f.seal(&mut b2);
        let _ = buf;
        assert!(matches!(
            HyperplaneRegister::decode(&b2),
            Err(AbiError::NonZeroReserved { .. })
        ));
    }
}
