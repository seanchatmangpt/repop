//! Court 3 — receipt emission differential (court name: `receipt-emit`).
//!
//! P5 gates rows `receipt-emit` + `admissions-root`. Named mutations:
//! `receipt-emit` = remove the tier-version check in `src/receipt.rs`;
//! `admissions-root` = swap the fold operands in `src/receipt.rs` `fold()`.
//!
//! Real API (C3 landed 2026-11-08): 229B `UnsealedReceipt`, magic `"CGRU"`,
//! version byte at offset 4, digest = keyed BLAKE3 over DeltaS||PhiLease.

mod common;

use common::{gen_corpus, LANE_RECEIPT};
use repop_kernel::receipt::{
    fold, receipt_leaf, DeltaS, DELTA_DOMAIN_TAG, UNSEALED_RECEIPT_LEN,
};
use repop_kernel::receipt::{PhiLease, UnsealedReceipt, UNSEALED_RECEIPT_MAGIC, UNSEALED_RECEIPT_VERSION};
use repop_kernel::receipt::ReceiptError;

/// Build a canonical delta + lease from corpus rows (deterministic).
fn specimen(row: &common::CorpusRow) -> (DeltaS, PhiLease) {
    let delta = DeltaS {
        domain_tag: DELTA_DOMAIN_TAG,
        from_root: root32(row.nte.to_bits()),
        to_root: root32(row.geo.to_bits()),
        op_count: row.entity,
        admissions: root32(row.version_hint),
    };
    let phi = PhiLease {
        lease_id: root32(row.entity),
        tick: row.version_hint,
        tick_ceiling: row.version_hint.wrapping_add(1024),
        issued_root: root32(row.nte.to_bits() ^ row.entity),
    };
    (delta, phi)
}

/// Stretch a u64 into a deterministic 32-byte root.
fn root32(seed: u64) -> [u8; 32] {
    core::array::from_fn(|i| (seed >> ((i % 8) * 8) ^ (i as u64) << 3) as u8)
}

#[test]
fn wire_size_magic_version_pin() {
    let corpus = gen_corpus(LANE_RECEIPT, 16);
    for row in &corpus {
        let (delta, phi) = specimen(row);
        let r = repop_kernel::emit(delta, &phi);
        let bytes = r.to_bytes();
        assert_eq!(bytes.len(), UNSEALED_RECEIPT_LEN, "229B wire pin");
        assert_eq!(&bytes[0..4], &UNSEALED_RECEIPT_MAGIC, "CGRU magic pin");
        assert_eq!(bytes[4], UNSEALED_RECEIPT_VERSION, "tier version byte pin");
        assert_eq!(repop_kernel::receipt::UnsealedReceipt::from_bytes(&bytes).is_ok(), true);
    }
}

#[test]
fn tier_byte_mutation_is_refused() {
    // P5 gates row `receipt-emit`: removing the tier-version check must flip
    // this court. The court itself asserts the check fires.
    let corpus = gen_corpus(LANE_RECEIPT, 16);
    for row in &corpus {
        let (delta, phi) = specimen(row);
        let bytes = repop_kernel::emit(delta, &phi).to_bytes();
        let mut corrupt = bytes;
        corrupt[4] ^= 0x01;
        match repop_kernel::receipt::UnsealedReceipt::from_bytes(&corrupt) {
            Err(ReceiptError::BadVersion(_)) => {}
            other => panic!("corrupt tier byte must BadVersion, got {other:?}"),
        }
        // Magic truncation is refused too (first tier byte flip).
        let mut corrupt2 = bytes;
        corrupt2[0] ^= 0x01;
        match UnsealedReceipt::from_bytes(&corrupt2) {            Err(ReceiptError::BadMagic(_)) => {}
            other => panic!("corrupt magic must BadMagic, got {other:?}"),
        }
    }
}

#[test]
fn digest_binds_every_covered_byte() {
    let corpus = gen_corpus(LANE_RECEIPT, 16);
    for row in &corpus {
        let (delta, phi) = specimen(row);
        let bytes = repop_kernel::emit(delta, &phi).to_bytes();
        for probe in [8usize, 60, 120, 200] {
            let mut corrupt = bytes;
            corrupt[probe] = corrupt[probe].wrapping_add(1);
            match UnsealedReceipt::from_bytes(&corrupt) {
                Err(ReceiptError::DigestMismatch) => {}
                other => panic!("covered-byte mutation at {probe} must DigestMismatch, got {other:?}"),
            }
        }
    }
}

#[test]
fn admissions_root_order_and_determinism() {
    // P5 gates row `admissions-root`: swapping fold operands must flip this
    // court. The court asserts order sensitivity + determinism.
    let corpus = gen_corpus(LANE_RECEIPT, 20); // > fold cap (8): chunk path live
    let leaves: Vec<[u8; 32]> = corpus
        .iter()
        .map(|row| {
            let (delta, phi) = specimen(row);
            receipt_leaf(&repop_kernel::emit(delta, &phi))
        })
        .collect();
    // empty tree all-zero
    assert_eq!(fold(&[]), [0u8; 32]);
    // order matters: a permutation changes the root
    let fwd = fold(&leaves);
    let mut rev_leaves = leaves.clone();
    rev_leaves.reverse();
    let rev = fold(&rev_leaves);
    assert_ne!(fwd, rev, "admissions root must be order-sensitive");
    // determinism: same leaves, same root
    assert_eq!(fold(&leaves), fwd);
    // single-leaf promotion
    assert_eq!(fold(&leaves[..1]), leaves[0]);
    // semantic pin: matches the plain textbook binary fold (odd node
    // promoted) — pins the blocking factor, not just order properties.
    assert_eq!(fwd, mirror_fold(&leaves), "fold must match textbook semantics");
}

/// Independent reference: standard binary Merkle fold, odd trailing node
/// promoted, no blocking. Divergence from `fold()` = court flip.
fn mirror_fold(leaves: &[[u8; 32]]) -> [u8; 32] {
    let mut cur: Vec<[u8; 32]> = leaves.to_vec();
    if cur.is_empty() {
        return [0u8; 32];
    }
    while cur.len() > 1 {
        let mut next = Vec::with_capacity((cur.len() + 1) / 2);
        let mut i = 0;
        while i + 1 < cur.len() {
            let mut buf = [0u8; 64];
            buf[..32].copy_from_slice(&cur[i]);
            buf[32..].copy_from_slice(&cur[i + 1]);
            next.push(repop_kernel::vendor::keyed_blake3::hash_unkeyed(&buf));
            i += 2;
        }
        if i < cur.len() {
            next.push(cur[i]);
        }
        cur = next;
    }
    cur[0]
}

#[test]
fn delta_decode_refuses_foreign_domain_tag() {
    let corpus = gen_corpus(LANE_RECEIPT, 4);
    for row in &corpus {
        let (delta, _) = specimen(row);
        let mut bytes = delta.to_bytes();
        bytes[0] ^= 0x01;
        assert!(matches!(
            repop_kernel::receipt::DeltaS::from_bytes(&bytes),
            Err(ReceiptError::DigestMismatch)
        ));
    }
}
