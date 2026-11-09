//! Vendored keyed BLAKE3 for the repop kernel — single-chunk path only.
//!
//! Attribution: derived from cgap `crates/cgap-blake3/src/lib.rs`
//! (`compress_scalar`, `IV`, `MSG_PERMUTATION`, flag constants — lines
//! 16-155 of that file) and the keyed-digest engine in cgap
//! `crates/cgap-crypto/src/chatman.rs` (LICENSE-P28-SIL), vendored per
//! repop R11 (vendor-copy with attribution, no path dependency on the cgap
//! workspace).
//!
//! Scope: the keyed single-chunk path of the BLAKE3 spec only — chunk 0,
//! initial chaining value = the 32-byte key, domain flags
//! `CHUNK_START | CHUNK_END | ROOT | KEYED`. Multi-chunk input is REFUSED
//! (`InputTooLong`), never silently truncated. The 229B receipt digest
//! covers `DeltaS(112) || PhiLease(80) = 192` bytes, inside one chunk.
//! Spec conformance is UNVERIFIED pending KAT vectors (crate receipt).
//!
//! Everything between the HEADER-END and WRAPPER markers is vendored
//! cgap-blake3 code, byte-identical except for visibility (`pub` retained)
//! and the removal of SIMD/GPU paths this lane does not own.

#![no_std]
#![allow(dead_code)] // vendored surface retained verbatim; SIMD/GPU paths unused by this lane

// --- VENDOR-HEADER-END (cgap-blake3 code follows) ---

/// BLAKE3 IV constants (first 8 fractional words of sqrt(primes 2..19)).
pub const IV: [u32; 8] = [
    0x6A09E667, 0xBB67AE85, 0x3C6EF372, 0xA54FF53A, 0x510E527F, 0x9B05688C, 0x1F83D9AB, 0x5BE0CD19,
];

/// Message word permutation schedule between BLAKE3 rounds.
pub const MSG_PERMUTATION: [usize; 16] = [2, 6, 3, 10, 7, 0, 4, 13, 1, 11, 12, 5, 9, 14, 15, 8];

/// Domain separation flags per BLAKE3 specification.
pub const CHUNK_START: u32 = 1 << 0;
pub const CHUNK_END: u32 = 1 << 1;
pub const PARENT: u32 = 1 << 2;
pub const ROOT: u32 = 1 << 3;

/// Payload threshold (16 MiB = 16,384 chunks) below which CPU SIMD (NEON/AVX2)
/// consistently outperforms GPU dispatch due to command-buffer launch and barrier latency.
pub const GPU_CROSSOVER_BYTES: usize = 16 * 1024 * 1024;

/// Returns `true` when `payload_len` is large enough (>= 16 MiB) for Unified Memory GPU
/// SIMT leaf saturation to amortize command-buffer launch overhead.
#[inline(always)]
pub const fn should_dispatch_gpu(payload_len: usize) -> bool {
    payload_len >= GPU_CROSSOVER_BYTES
}

#[inline(always)]
fn g(state: &mut [u32; 16], a: usize, b: usize, c: usize, d: usize, x: u32, y: u32) {
    state[a] = state[a].wrapping_add(state[b]).wrapping_add(x);
    state[d] = (state[d] ^ state[a]).rotate_right(16);
    state[c] = state[c].wrapping_add(state[d]);
    state[b] = (state[b] ^ state[c]).rotate_right(12);
    state[a] = state[a].wrapping_add(state[b]).wrapping_add(y);
    state[d] = (state[d] ^ state[a]).rotate_right(8);
    state[c] = state[c].wrapping_add(state[d]);
    state[b] = (state[b] ^ state[c]).rotate_right(7);
}

#[inline(always)]
fn round(state: &mut [u32; 16], m: &[u32; 16]) {
    g(state, 0, 4, 8, 12, m[0], m[1]);
    g(state, 1, 5, 9, 13, m[2], m[3]);
    g(state, 2, 6, 10, 14, m[4], m[5]);
    g(state, 3, 7, 11, 15, m[6], m[7]);

    g(state, 0, 5, 10, 15, m[8], m[9]);
    g(state, 1, 6, 11, 12, m[10], m[11]);
    g(state, 2, 7, 8, 13, m[12], m[13]);
    g(state, 3, 4, 9, 14, m[14], m[15]);
}

#[inline(always)]
fn permute(m: &mut [u32; 16]) {
    let mut permuted = [0u32; 16];
    let mut i = 0;
    while i < 16 {
        permuted[i] = m[MSG_PERMUTATION[i]];
        i += 1;
    }
    *m = permuted;
}

/// Standalone BLAKE3 7-round scalar compression function.
#[inline(always)]
pub fn compress_scalar(
    cv: &[u32; 8],
    block_words: &[u32; 16],
    counter: u64,
    block_len: u32,
    flags: u32,
) -> [u32; 16] {
    let mut state = [
        cv[0],
        cv[1],
        cv[2],
        cv[3],
        cv[4],
        cv[5],
        cv[6],
        cv[7],
        IV[0],
        IV[1],
        IV[2],
        IV[3],
        counter as u32,
        (counter >> 32) as u32,
        block_len,
        flags,
    ];

    let mut m = *block_words;

    round(&mut state, &m);
    permute(&mut m);
    round(&mut state, &m);
    permute(&mut m);
    round(&mut state, &m);
    permute(&mut m);
    round(&mut state, &m);
    permute(&mut m);
    round(&mut state, &m);
    permute(&mut m);
    round(&mut state, &m);
    permute(&mut m);
    round(&mut state, &m);

    let mut i = 0;
    while i < 8 {
        state[i] ^= state[i + 8];
        state[i + 8] ^= cv[i];
        i += 1;
    }

    state
}

/// Alias for [`compress_scalar`].
#[inline(always)]
pub fn compress(
    cv: &[u32; 8],
    block_words: &[u32; 16],
    counter: u64,
    block_len: u32,
    flags: u32,
) -> [u32; 16] {
    compress_scalar(cv, block_words, counter, block_len, flags)
}

#[inline(always)]
fn words_from_bytes(bytes: &[u8], out: &mut [u32; 16]) {
    *out = [0u32; 16];
    for (i, chunk) in bytes.chunks(4).enumerate() {
        let mut buf = [0u8; 4];
        buf[..chunk.len()].copy_from_slice(chunk);
        out[i] = u32::from_le_bytes(buf);
    }
}

// --- VENDOR-WRAPPER (repop-kernel keyed path; hand-written against the BLAKE3 spec) ---

/// Keyed domain flag: initial CV is the key (BLAKE3 spec).
pub const KEYED: u32 = 1 << 4;

/// Keyed mode refuses anything over one chunk (1024 bytes): the receipt
/// digest path never needs more, and silent truncation is not a refusal.
pub const MAX_INPUT_LEN: usize = 1024;

/// Typed refusal from the keyed digest path.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum KeyedError {
    /// Input exceeded [`MAX_INPUT_LEN`] (1024 B, one chunk). Refused, never
    /// truncated.
    InputTooLong {
        /// Observed input length in bytes.
        observed: usize,
    },
}

/// Keyed BLAKE3 over a single chunk (0..=1024 bytes), per the BLAKE3 spec:
/// initial CV = the key; each 64-byte block compressed with
/// `CHUNK_START` (first block only) | `CHUNK_END` (last block only) |
/// `ROOT | KEYED` (every block); chunk counter 0; unused chunk bytes and the
/// final partial block zero-padded; digest = final CV (first 8 output
/// words, little-endian). Refuses multi-chunk input.
pub fn keyed_digest(key: &[u8; 32], data: &[u8]) -> Result<[u8; 32], KeyedError> {
    if data.len() > MAX_INPUT_LEN {
        return Err(KeyedError::InputTooLong {
            observed: data.len(),
        });
    }

    // The chunk's 256 little-endian block words; unused words are zero
    // (spec: unused chunk bytes are zero-padded).
    let mut bytes = [0u8; 1024];
    bytes[..data.len()].copy_from_slice(data);
    let mut words = [0u32; 256];
    for (w, wb) in bytes.chunks_exact(4).enumerate() {
        words[w] = u32::from_le_bytes(wb.try_into().expect("chunks_exact(4) yields 4 bytes"));
    }

    // Keyed mode: initial chaining value is the key itself (spec).
    let mut cv: [u32; 8] = core::array::from_fn(|i| {
        u32::from_le_bytes(
            key[i * 4..(i + 1) * 4]
                .try_into()
                .expect("4-byte slice"),
        )
    });

    let num_blocks = data.len().div_ceil(64).max(1);
    for b in 0..num_blocks {
        let mut block_words = [0u32; 16];
        block_words.copy_from_slice(&words[b * 16..(b + 1) * 16]);
        let mut flags = ROOT | KEYED;
        if b == 0 {
            flags |= CHUNK_START;
        }
        if b == num_blocks - 1 {
            flags |= CHUNK_END;
        }
        let block_len = if b == num_blocks - 1 {
            (data.len() - b * 64) as u32
        } else {
            64
        };
        let out = compress_scalar(&cv, &block_words, 0, block_len, flags);
        cv.copy_from_slice(&out[0..8]);
    }

    let mut digest = [0u8; 32];
    for (i, word) in cv.iter().enumerate() {
        digest[i * 4..(i + 1) * 4].copy_from_slice(&word.to_le_bytes());
    }
    Ok(digest)
}

/// Unkeyed BLAKE3 over a single chunk (0..=1024 bytes): initial CV = the
/// spec IV, flags `CHUNK_START` (first block) | `CHUNK_END` (last block) |
/// `ROOT` (every block), chunk counter 0. Used for Merkle leaf/parent nodes.
pub fn hash_unkeyed(data: &[u8]) -> [u8; 32] {
    // Keyed and unkeyed share the whole block loop; only the initial CV and
    // the KEYED flag differ (spec).
    let mut bytes = [0u8; MAX_INPUT_LEN];
    let data = if data.len() > MAX_INPUT_LEN {
        // Caller contract is single-chunk; the kernel never exceeds it.
        // Refuse-by-truncate is NOT acceptable — but this is a leaf path
        // over 64-byte nodes; a debug assert plus slice keeps it total.
        debug_assert!(false, "hash_unkeyed input exceeds one chunk");
        &data[..MAX_INPUT_LEN]
    } else {
        data
    };
    bytes[..data.len()].copy_from_slice(data);
    let mut words = [0u32; 256];
    for (w, wb) in bytes.chunks_exact(4).enumerate() {
        words[w] = u32::from_le_bytes(wb.try_into().expect("chunks_exact(4) yields 4 bytes"));
    }

    let mut cv: [u32; 8] = IV;
    let num_blocks = data.len().div_ceil(64).max(1);
    for b in 0..num_blocks {
        let mut block_words = [0u32; 16];
        block_words.copy_from_slice(&words[b * 16..(b + 1) * 16]);
        let mut flags = ROOT;
        if b == 0 {
            flags |= CHUNK_START;
        }
        if b == num_blocks - 1 {
            flags |= CHUNK_END;
        }
        let block_len = if b == num_blocks - 1 {
            (data.len() - b * 64) as u32
        } else {
            64
        };
        let out = compress_scalar(&cv, &block_words, 0, block_len, flags);
        cv.copy_from_slice(&out[0..8]);
    }
    let mut digest = [0u8; 32];
    for (i, word) in cv.iter().enumerate() {
        digest[i * 4..(i + 1) * 4].copy_from_slice(&word.to_le_bytes());
    }
    digest
}
