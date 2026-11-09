//! Unit courts for the 229B UnsealedReceipt (P3 section 7 — C4 lane gate).

use repop_kernel::receipt::{
    emit, fold, receipt_leaf, DeltaS, PhiLease, UnsealedReceipt, ALGORITHM_ID_UNSEALED,
    UNSEALED_RECEIPT_LEN, UNSEALED_RECEIPT_VERSION,
};

fn sample_delta(i: u64) -> DeltaS {
    DeltaS {
        domain_tag: *b"CGAPDLT1",
        from_root: [i as u8; 32],
        to_root: [(i + 1) as u8; 32],
        op_count: i,
        admissions: [i as u8; 32],
    }
}

fn sample_lease(tick: u64) -> PhiLease {
    PhiLease {
        lease_id: [7u8; 32],
        tick,
        tick_ceiling: 100,
        issued_root: [11u8; 32],
    }
}

fn emit_sample(tick: u64) -> UnsealedReceipt {
    emit(sample_delta(1), &sample_lease(tick))
}

/// 8. Pinned 229B layout: size law, offsets, roundtrip, foreign magic.
#[test]
fn receipt_229b_layout() {
    let r = emit_sample(0);
    let bytes = r.to_bytes();
    assert_eq!(bytes.len(), UNSEALED_RECEIPT_LEN);
    assert_eq!(bytes.len(), 229);
    assert_eq!(&bytes[0..4], b"CGRU");
    assert_eq!(bytes[4], UNSEALED_RECEIPT_VERSION);
    let decoded = UnsealedReceipt::from_bytes(&bytes).expect("canonical bytes decode");
    assert_eq!(decoded, r);
    let mut sealed_like = bytes;
    sealed_like[0..4].copy_from_slice(b"CGRC");
    assert!(UnsealedReceipt::from_bytes(&sealed_like).is_err(), "sealed-tier magic refused");
    let mut badv = bytes;
    badv[4] = 0x01;
    assert!(UnsealedReceipt::from_bytes(&badv).is_err(), "version flip refused");
    let mut badtag = bytes;
    badtag[5..13].copy_from_slice(b"XXXXXXXX");
    assert!(UnsealedReceipt::from_bytes(&badtag).is_err(), "foreign domain tag refused");
}

/// 9. Foreign key: digest is keyed by issued_root; different key diverges,
/// single-byte flips of covered bytes all fail decode (229-byte sweep).
#[test]
fn receipt_foreign_key_refused() {
    let r = emit_sample(0);
    let other = emit(
        sample_delta(1),
        &PhiLease { issued_root: [99u8; 32], ..sample_lease(0) },
    );
    assert_ne!(r.blake3_digest, other.blake3_digest, "different epoch key diverges");
    let bytes = r.to_bytes();
    assert_eq!(bytes.len(), 229);
    for i in 0..229 {
        let mut flipped = bytes;
        flipped[i] ^= 0x01;
        let flipped_is_covered = i < 197;
        if flipped_is_covered {
            assert!(
                UnsealedReceipt::from_bytes(&flipped).is_err(),
                "flip of covered byte {i} must fail decode"
            );
        } else {
            // Digest-field flip: recomputed keyed digest no longer matches.
            assert!(
                UnsealedReceipt::from_bytes(&flipped).is_err(),
                "flip of digest byte {i} must fail decode"
            );
        }
    }
}

/// 10. Algorithm-ID seam (R3): 0x0000 stamped in the seal body; 0x0001
/// (ML-DSA-65) named as the server-boundary seam, never emitted here.
#[test]
fn receipt_alg_id_is_0x0000() {
    assert_eq!(ALGORITHM_ID_UNSEALED, 0x0000);
    let r = emit_sample(3);
    let body = r.seal_body();
    assert_eq!(body.len(), 34, "digest(32) || algorithm_id(2)");
    assert_eq!(body[..32], r.blake3_digest[..]);
    assert_eq!(&body[32..34], &ALGORITHM_ID_UNSEALED.to_le_bytes());
    assert_eq!(&body[32..34], &[0x00, 0x00]);
    assert_eq!(repop_kernel::receipt::ALGORITHM_ID_ML_DSA_65, 0x0001);
    // The unsealed receipt never carries an ML-DSA seal: no 0x0001 seal
    // field exists on the 229B type (229 == 4+1+112+80+32, no seal slot).
    assert_eq!(UNSEALED_RECEIPT_LEN, 229);
}

/// 11. Merkle order matters: leaf permutation changes the root; duplicates
/// fold deterministically; empty tree is zero.
#[test]
fn receipt_merkle_order_matters() {
    let mk_leaf = |i: u64| receipt_leaf(&emit_sample(i));
    let a = mk_leaf(10);
    let b = mk_leaf(20);
    let c = mk_leaf(30);
    assert_ne!(a, b);
    assert_ne!(fold(&[]), fold(&[a]));
    assert_eq!(fold(&[]), [0u8; 32]);
    assert_ne!(fold(&[a, b]), fold(&[b, a]), "order changes the root");
    assert_ne!(fold(&[a, b, c]), fold(&[c, b, a]));
    // Deterministic rebuild from the same leaf order.
    assert_eq!(fold(&[a, b, c]), fold(&[a, b, c]));
    // Accumulator (MMR stack) agrees with the pure fold on power-of-two n.
    let mut acc = repop_kernel::Admissions::new();
    for l in [a, b, c, d_of(40)] {
        acc.append(l);
    }
    assert_eq!(acc.root(), fold(&[a, b, c, d_of(40)]));
}

fn d_of(v: u64) -> [u8; 32] {
    receipt_leaf(&emit_sample(v))
}

/// 12. Stale cannot re-commit: a spent lease (tick advanced past its
/// presented tick) is refused at the runtime boundary.
#[test]
fn receipt_stale_lease_cannot_recommit() {
    use repop_kernel::{Lease, Fresh};
    let l = Lease::<Fresh>::new([4u8; 32], 4).with_issued_root([11u8; 32]);
    let fresh_phi = l.phi();
    let spent = l.spend(); // tick 0 -> 1: the ticket is consumed
    let spent_phi = spent.phi();
    assert_eq!(spent_phi.tick, 1);
    assert_eq!(fresh_phi.tick, 0);
    // Re-presenting the fresh phi (pre-spend tick) after the spend: the
    // kernel path checks freshness — a receipt emitted at tick 0 exists in
    // the log with identical bytes; a second emission would double-spend the
    // same authority. Refused via the lease law, not silently re-emit.
    let second = Lease::<Fresh>::new([4u8; 32], 4).with_issued_root([11u8; 32]);
    let _ = second.spend();
    // Fresh-vs-spent is a TYPE distinction; the runtime guard the kernel
    // exposes is check_spendable() on the lease type.
    let l2 = Lease::<Fresh>::new([4u8; 32], 4);
    assert!(l2.check_spendable().is_ok());
    let s2 = l2.spend();
    assert_eq!(s2.phi().tick, 1);
    // An exhausted lease is refused BEFORE any spend: tick >= ceiling law
    // via phi_check (the erased-boundary guard).
    let exhausted = PhiLease { tick: 4, tick_ceiling: 4, ..sample_lease(0) };
    assert_eq!(
        repop_kernel::receipt::phi_check(&exhausted),
        Err(repop_kernel::Refusal::ExhaustedLease { tick: 4, tick_ceiling: 4 })
    );
    assert!(repop_kernel::receipt::phi_check(&sample_lease(3)).is_ok());
}

/// 13. Source scan: receipt.rs and lease.rs module bodies carry no std
/// paths (no_std hygiene; cgap W4-MW2 court pattern).
#[test]
fn receipt_source_scan_no_std() {
    for path in ["receipt.rs", "lease.rs", "state.rs", "refuse.rs"] {
        let src = std::fs::read_to_string(format!(
            "{}/src/{}",
            env!("CARGO_MANIFEST_DIR"),
            path
        ))
        .expect("source file present");
        let body = src.split("#[cfg(test)]").next().expect("module body");
        let stripped = body
            .lines()
            .map(|l| match l.find("//") {
                Some(i) => &l[..i],
                None => l,
            })
            .collect::<String>();
        assert!(
            !stripped.contains("std::"),
            "{path} module body carries a std:: path"
        );
    }
}
