//! 229-byte `UnsealedReceipt` emission (`receipt.rs`, P3).
//!
//! Wire law (cgap chatman.rs parity, R3 receipt tiering): magic `"CGRU"`,
//! version `0x00`, `DeltaS(112) || PhiLease(80) || keyed-BLAKE3 digest(32)`,
//! `#[repr(C, packed)]` byte-concatenation form — offsets 0/4/5/117/197,
//! total exactly 229. The digest is keyed BLAKE3 over `DeltaS || PhiLease`
//! with key = `issued_root`. `ALGORITHM_ID_UNSEALED = 0x0000` is the
//! designed PQC upgrade seam (R3): `0x0001` = ML-DSA-65 (3309B seal) applies
//! only at a server trust boundary — this kernel carries no ML-DSA code.

#![no_std]


use crate::vendor::keyed_blake3;

/// Delta domain tag: 8-byte versioned domain separator (cgap §3.1 parity —
/// `"CGAPDLT1"` keeps DeltaS encodings wire-identical across cgap/repop).
pub const DELTA_DOMAIN_TAG: [u8; 8] = *b"CGAPDLT1";

/// Widths (cgap §3.1/§3.2/§3.3 pins).
pub const ROOT_LEN: usize = 32;
pub const OP_COUNT_LEN: usize = 8;
pub const DELTA_LEN: usize = 112;
pub const PHI_LEASE_LEN: usize = 80;
pub const DIGEST_LEN: usize = 32;

/// `magic` for the unsealed tier: `"CGRU"` (cgap divergence D2 parity: a
/// distinct magic so an unsealed receipt can never read as a sealed one).
pub const UNSEALED_RECEIPT_MAGIC: [u8; 4] = *b"CGRU";
/// `version` for the unsealed tier: `0x00`.
pub const UNSEALED_RECEIPT_VERSION: u8 = 0x00;
/// Fixed 229-byte prefix = the whole unsealed receipt.
pub const UNSEALED_RECEIPT_LEN: usize = 229;

/// Algorithm-ID for the unsealed tier (§4 seam; MAC-class keyed digest).
pub const ALGORITHM_ID_UNSEALED: u16 = 0x0000;
/// Algorithm-ID reserved for the server-boundary ML-DSA-65 seal (R3). The
/// kernel never emits or verifies it — carried as the named seam.
pub const ALGORITHM_ID_ML_DSA_65: u16 = 0x0001;

/// The admitted state delta: canonical 112-byte string, `#[repr(C)]`,
/// gap-free (offsets 0/8/40/72/80), little-endian (cgap §3.1).
#[repr(C)]
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct DeltaS {
    /// offset 0, 8 B — ASCII `"CGAPDLT1"`.
    pub domain_tag: [u8; 8],
    /// offset 8, 32 B — digest of the prior state root.
    pub from_root: [u8; ROOT_LEN],
    /// offset 40, 32 B — digest of the new state root.
    pub to_root: [u8; ROOT_LEN],
    /// offset 72, 8 B — u64 LE, admitted operations folded into the delta.
    pub op_count: u64,
    /// offset 80, 32 B — Merkle root over ordered per-operation admissions.
    pub admissions: [u8; ROOT_LEN],
}

/// The lease epoch snapshot: canonical 80-byte form, `#[repr(C)]`, offsets
/// 0/32/40/48 (cgap §3.2).
#[repr(C)]
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct PhiLease {
    /// offset 0, 32 B — lease instance id.
    pub lease_id: [u8; 32],
    /// offset 32, 8 B — u64 LE tick at spend time.
    pub tick: u64,
    /// offset 40, 8 B — u64 LE fixed ceiling.
    pub tick_ceiling: u64,
    /// offset 48, 32 B — epoch binding; doubles as the digest key.
    pub issued_root: [u8; 32],
}

/// The unsealed receipt: `#[repr(C, packed)]` byte concatenation — read
/// fields by value only (packed references are UB and forbidden).
#[repr(C, packed)]
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct UnsealedReceipt {
    /// offset 0, 4 B — `"CGRU"`.
    pub magic: [u8; 4],
    /// offset 4, 1 B — `0x00`.
    pub version: u8,
    /// offset 5, 112 B — the admitted delta.
    pub delta: DeltaS,
    /// offset 117, 80 B — the lease epoch.
    pub phi: PhiLease,
    /// offset 197, 32 B — keyed BLAKE3 over `DeltaS || PhiLease`,
    /// key = `issued_root`.
    pub blake3_digest: [u8; DIGEST_LEN],
}

const _: () = assert!(core::mem::size_of::<DeltaS>() == DELTA_LEN);
const _: () = assert!(core::mem::offset_of!(DeltaS, domain_tag) == 0);
const _: () = assert!(core::mem::offset_of!(DeltaS, from_root) == 8);
const _: () = assert!(core::mem::offset_of!(DeltaS, to_root) == 40);
const _: () = assert!(core::mem::offset_of!(DeltaS, op_count) == 72);
const _: () = assert!(core::mem::offset_of!(DeltaS, admissions) == 80);

const _: () = assert!(core::mem::size_of::<PhiLease>() == PHI_LEASE_LEN);
const _: () = assert!(core::mem::offset_of!(PhiLease, lease_id) == 0);
const _: () = assert!(core::mem::offset_of!(PhiLease, tick) == 32);
const _: () = assert!(core::mem::offset_of!(PhiLease, tick_ceiling) == 40);
const _: () = assert!(core::mem::offset_of!(PhiLease, issued_root) == 48);

const _: () = assert!(core::mem::size_of::<UnsealedReceipt>() == UNSEALED_RECEIPT_LEN);
const _: () = assert!(core::mem::align_of::<UnsealedReceipt>() == 1);
const _: () = assert!(UNSEALED_RECEIPT_LEN == 4 + 1 + DELTA_LEN + PHI_LEASE_LEN + DIGEST_LEN);
const _: () = assert!(UNSEALED_RECEIPT_LEN == 229);

impl DeltaS {
    /// Canonical 112-byte encoding (fixed order, LE, no choices).
    pub fn to_bytes(&self) -> [u8; DELTA_LEN] {
        let mut out = [0u8; DELTA_LEN];
        out[0..8].copy_from_slice(&self.domain_tag);
        out[8..40].copy_from_slice(&self.from_root);
        out[40..72].copy_from_slice(&self.to_root);
        out[72..80].copy_from_slice(&self.op_count.to_le_bytes());
        out[80..112].copy_from_slice(&self.admissions);
        out
    }

    /// Decode, refusing a foreign domain tag (the receipt must carry a
    /// delta-shaped string, not arbitrary bytes).
    pub fn from_bytes(bytes: &[u8; DELTA_LEN]) -> Result<Self, ReceiptError> {
        let mut domain_tag = [0u8; 8];
        domain_tag.copy_from_slice(&bytes[0..8]);
        if domain_tag != DELTA_DOMAIN_TAG {
            return Err(ReceiptError::DigestMismatch);
        }
        let mut from_root = [0u8; 32];
        from_root.copy_from_slice(&bytes[8..40]);
        let mut to_root = [0u8; 32];
        to_root.copy_from_slice(&bytes[40..72]);
        let mut admissions = [0u8; 32];
        admissions.copy_from_slice(&bytes[80..112]);
        Ok(Self {
            domain_tag,
            from_root,
            to_root,
            op_count: u64::from_le_bytes(bytes[72..80].try_into().expect("8-byte slice")),
            admissions,
        })
    }
}

impl PhiLease {
    /// Canonical 80-byte encoding.
    pub fn to_bytes(&self) -> [u8; PHI_LEASE_LEN] {
        let mut out = [0u8; PHI_LEASE_LEN];
        out[0..32].copy_from_slice(&self.lease_id);
        out[32..40].copy_from_slice(&self.tick.to_le_bytes());
        out[40..48].copy_from_slice(&self.tick_ceiling.to_le_bytes());
        out[48..80].copy_from_slice(&self.issued_root);
        out
    }

    /// Decode (inert snapshot — never authority).
    pub fn from_bytes(bytes: &[u8; PHI_LEASE_LEN]) -> Self {
        let mut lease_id = [0u8; 32];
        lease_id.copy_from_slice(&bytes[0..32]);
        Self {
            lease_id,
            tick: u64::from_le_bytes(bytes[32..40].try_into().expect("8-byte slice")),
            tick_ceiling: u64::from_le_bytes(bytes[40..48].try_into().expect("8-byte slice")),
            issued_root: {
                let mut r = [0u8; 32];
                r.copy_from_slice(&bytes[48..80]);
                r
            },
        }
    }
}

impl UnsealedReceipt {
    /// Canonical 229-byte encoding.
    pub fn to_bytes(&self) -> [u8; UNSEALED_RECEIPT_LEN] {
        let mut out = [0u8; UNSEALED_RECEIPT_LEN];
        out[0..4].copy_from_slice(&self.magic);
        out[4] = self.version;
        let delta = self.delta;
        let phi = self.phi;
        out[5..117].copy_from_slice(&delta.to_bytes());
        out[117..197].copy_from_slice(&phi.to_bytes());
        out[197..229].copy_from_slice(&self.blake3_digest);
        out
    }

    /// The seal body: `digest || algorithm_id(LE)` — the seal covers the
    /// digest AND its own algorithm id (cgap §3.3 "chained, not parallel
    /// claims"). For this tier the "seal" is MAC-class (keyed digest); the
    /// 34-byte body is what a server-boundary ML-DSA-65 sealer would sign.
    pub fn seal_body(&self) -> [u8; DIGEST_LEN + 2] {
        let mut out = [0u8; DIGEST_LEN + 2];
        out[0..32].copy_from_slice(&self.blake3_digest);
        out[32..34].copy_from_slice(&ALGORITHM_ID_UNSEALED.to_le_bytes());
        out
    }
}

/// Errors from decode/verify paths, folded into the kernel refusal taxonomy.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ReceiptError {
    /// Magic was not `"CGRU"`.
    BadMagic([u8; 4]),
    /// Version was not `0x00`.
    BadVersion(u8),
    /// The stored digest does not match the recomputed keyed digest — some
    /// covered byte mutated, or the receipt was built under another epoch.
    DigestMismatch,
}

impl UnsealedReceipt {
    /// Decode the canonical 229-byte form, refusing foreign magic/version.
    pub fn from_bytes(bytes: &[u8; UNSEALED_RECEIPT_LEN]) -> Result<Self, ReceiptError> {
        let mut magic = [0u8; 4];
        magic.copy_from_slice(&bytes[0..4]);
        if magic != UNSEALED_RECEIPT_MAGIC {
            return Err(ReceiptError::BadMagic(magic));
        }
        if bytes[4] != UNSEALED_RECEIPT_VERSION {
            return Err(ReceiptError::BadVersion(bytes[4]));
        }
        let mut delta_bytes = [0u8; DELTA_LEN];
        delta_bytes.copy_from_slice(&bytes[5..117]);
        let mut phi_bytes = [0u8; PHI_LEASE_LEN];
        phi_bytes.copy_from_slice(&bytes[117..197]);
        let mut digest = [0u8; DIGEST_LEN];
        digest.copy_from_slice(&bytes[197..229]);
        let phi = PhiLease::from_bytes(&phi_bytes);
        // Digest is computed over the raw covered bytes, so decode is exact.
        let mut covered = [0u8; DELTA_LEN + PHI_LEASE_LEN];
        covered[..DELTA_LEN].copy_from_slice(&delta_bytes);
        covered[DELTA_LEN..].copy_from_slice(&phi_bytes);
        let expected = keyed_blake3::keyed_digest(&phi.issued_root, &covered)
            .map_err(|_| ReceiptError::DigestMismatch)?;
        if expected != digest {
            return Err(ReceiptError::DigestMismatch);
        }
        let delta = DeltaS::from_bytes(&delta_bytes).map_err(|_| ReceiptError::DigestMismatch)?;
        Ok(Self {
            magic,
            version: bytes[4],
            delta,
            phi,
            blake3_digest: digest,
        })
    }
}

/// Keyed receipt digest: keyed BLAKE3 over `DeltaS || PhiLease`, key =
/// `phi.issued_root` (cgap §3.3/§6). Input is 192 bytes — one chunk, so the
/// keyed single-chunk path is total here.
pub fn receipt_digest(delta: &DeltaS, phi: &PhiLease) -> [u8; DIGEST_LEN] {
    let mut covered = [0u8; DELTA_LEN + PHI_LEASE_LEN];
    covered[..DELTA_LEN].copy_from_slice(&delta.to_bytes());
    covered[DELTA_LEN..].copy_from_slice(&phi.to_bytes());
    keyed_blake3::keyed_digest(&phi.issued_root, &covered)
        .expect("192 bytes is within the single-chunk keyed path")
}

/// Merkle leaf over an encoded receipt (cgap admissions-root law: UNkeyed
/// hash of the full-receipt encoding, so the leaf is identity-bound).
pub fn receipt_leaf(receipt: &UnsealedReceipt) -> [u8; 32] {
    keyed_blake3::hash_unkeyed(&receipt.to_bytes())
}

/// Fold leaf hashes into an admissions root (cgap `admissions_root` parity:
/// standard binary tree, odd trailing node promoted unchanged, empty tree
/// all-zero). Leaf order matters — a permutation changes the root.
pub fn fold(leaves: &[[u8; 32]]) -> [u8; 32] {
    if leaves.is_empty() {
        return [0u8; 32];
    }
    // Fixed no_std scratch: two alternating levels, arbitrary n reduced a
    // block at a time; semantics are the pure binary fold (odd node promoted).
    let mut level: [[u8; 32]; 8] = [[0u8; 32]; 8];
    let cap = level.len();
    if leaves.len() > cap {
        let mut acc: [u8; 32] = [0u8; 32];
        let mut first = true;
        for block in leaves.chunks(cap) {
            let block_root = fold_block(block, &mut level);
            acc = if first {
                first = false;
                block_root
            } else {
                parent(&acc, &block_root)
            };
        }
        return acc;
    }
    fold_block(leaves, &mut level)
}

/// Fold one block of leaves into a root using the scratch level array.
fn fold_block(leaves: &[[u8; 32]], scratch: &mut [[u8; 32]; 8]) -> [u8; 32] {
    let mut n = leaves.len();
    scratch[..n].copy_from_slice(leaves);
    while n > 1 {
        let mut next = 0usize;
        let mut i = 0usize;
        while i < n {
            scratch[next] = if i + 1 == n {
                scratch[i] // odd trailing node promoted unchanged
            } else {
                parent(&scratch[i], &scratch[i + 1])
            };
            next += 1;
            i += 2;
        }
        n = next;
    }
    scratch[0]
}

/// Unkeyed BLAKE3 parent over `left || right`.
fn parent(left: &[u8; 32], right: &[u8; 32]) -> [u8; 32] {
    let mut buf = [0u8; 64];
    buf[..32].copy_from_slice(left);
    buf[32..].copy_from_slice(right);
    keyed_blake3::hash_unkeyed(&buf)
}

/// Emission: digest the delta under the lease epoch, stamp the CGRU header.
/// Consumes nothing by itself — tick consumption belongs to the lease
/// (`Lease::spend`, the affine transition in `lease.rs`).
pub fn emit(delta: DeltaS, phi: &PhiLease) -> UnsealedReceipt {
    UnsealedReceipt {
        magic: UNSEALED_RECEIPT_MAGIC,
        version: UNSEALED_RECEIPT_VERSION,
        delta,
        phi: *phi,
        blake3_digest: receipt_digest(&delta, phi),
    }
}

/// Lease-law check on a wire PhiLease (the runtime guard behind the
/// Fresh/Spent typestate at the erased/FFI boundary): a lease carrying
/// `tick >= tick_ceiling` is spent authority — no live lease could have
/// sealed it (cgap section 5 law, typed as ExhaustedLease).
pub fn phi_check(phi: &PhiLease) -> Result<(), crate::refuse::Refusal> {
    if phi.tick >= phi.tick_ceiling {
        Err(crate::refuse::Refusal::ExhaustedLease {
            tick: phi.tick,
            tick_ceiling: phi.tick_ceiling,
        })
    } else {
        Ok(())
    }
}
