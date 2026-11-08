//! Little-endian fixed-width put/get primitives + FNV-1a32.
//!
//! The only bytes<->scalar layer in the crate. No std, no alloc, no
//! byteorder dep — the codec path is these functions only.

/// Store `v` as 2 LE bytes at `buf[offset..offset+2]`.
#[inline]
pub fn put_u16(buf: &mut [u8], offset: usize, v: u16) {
    buf[offset] = v as u8;
    buf[offset + 1] = (v >> 8) as u8;
}

/// Load a u16 from 2 LE bytes at `buf[offset..offset+2]`.
#[inline]
pub fn get_u16(buf: &[u8], offset: usize) -> u16 {
    u16::from_le_bytes([buf[offset], buf[offset + 1]])
}

/// Store `v` as 4 LE bytes at `buf[offset..offset+4]`.
#[inline]
pub fn put_u32(buf: &mut [u8], offset: usize, v: u32) {
    buf[offset..offset + 4].copy_from_slice(&v.to_le_bytes());
}

/// Load a u32 from 4 LE bytes at `buf[offset..offset+4]`.
#[inline]
pub fn get_u32(buf: &[u8], offset: usize) -> u32 {
    let mut b = [0u8; 4];
    b.copy_from_slice(&buf[offset..offset + 4]);
    u32::from_le_bytes(b)
}

/// Store `v` as 8 LE bytes at `buf[offset..offset+8]`.
#[inline]
pub fn put_u64(buf: &mut [u8], offset: usize, v: u64) {
    buf[offset..offset + 8].copy_from_slice(&v.to_le_bytes());
}

/// Load a u64 from 8 LE bytes at `buf[offset..offset+8]`.
#[inline]
pub fn get_u64(buf: &[u8], offset: usize) -> u64 {
    let mut b = [0u8; 8];
    b.copy_from_slice(&buf[offset..offset + 8]);
    u64::from_le_bytes(b)
}

/// Store `v` as 8 LE bytes (IEEE-754 `f64::to_bits`/`from_bits` round-trip).
#[inline]
pub fn put_f64(buf: &mut [u8], offset: usize, v: f64) {
    put_u64(buf, offset, v.to_bits());
}

/// Load an `f64` from 8 LE bytes (bit-level, no float parsing).
#[inline]
pub fn get_f64(buf: &[u8], offset: usize) -> f64 {
    f64::from_bits(get_u64(buf, offset))
}

/// Copy exactly `N` bytes into `buf[offset..offset+N]`.
#[inline]
pub fn put_bytes<const N: usize>(buf: &mut [u8], offset: usize, v: &[u8; N]) {
    buf[offset..offset + N].copy_from_slice(v);
}

/// Copy exactly `N` bytes out of `buf[offset..offset+N]`.
#[inline]
pub fn get_bytes<const N: usize>(buf: &[u8], offset: usize) -> [u8; N] {
    let mut out = [0u8; N];
    out.copy_from_slice(&buf[offset..offset + N]);
    out
}

/// FNV-1a 32-bit over `bytes`. Mirrors [`crate::fnv1a32`]; kept here so the
/// endian layer is self-contained for the TS mirror parity court.
#[inline]
pub fn fnv1a32(bytes: &[u8]) -> u32 {
    let mut hash = crate::FNV1A32_OFFSET_BASIS;
    for b in bytes {
        hash ^= u32::from(*b);
        hash = hash.wrapping_mul(crate::FNV1A32_PRIME);
    }
    hash
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn fnv1a32_known_vectors() {
        // "" -> 2166136261; "a" -> 0xE40C292C (standard FNV-1a 32 vectors)
        assert_eq!(fnv1a32(b""), 2166136261);
        assert_eq!(fnv1a32(b"a"), 0xE40C_292C);
        assert_eq!(fnv1a32(b"foobar"), 0xBF9C_F968);
    }

    #[test]
    fn scalar_round_trips() {
        let mut buf = [0u8; 64];
        put_u16(&mut buf, 0, 0x5246);
        put_u32(&mut buf, 4, 0xDEAD_BEEF);
        put_u64(&mut buf, 8, 0x0123_4567_89AB_CDEF);
        put_f64(&mut buf, 16, -273.15);
        assert_eq!(get_u16(&buf, 0), 0x5246);
        assert_eq!(get_u32(&buf, 4), 0xDEAD_BEEF);
        assert_eq!(get_u64(&buf, 8), 0x0123_4567_89AB_CDEF);
        assert_eq!(get_f64(&buf, 16), -273.15);
    }
}
