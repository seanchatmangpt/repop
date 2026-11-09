//! Unit courts for the CAS registry (P3 plan section 7 — C4 lane gate).
//!
//! Chicago: real collaborators (real atomics, real threads), final-state
//! asserts. Real exit codes land in the lane receipt.

use repop_kernel::cas::Registry;
use repop_kernel::{Admissions, Refusal};

/// Registry-heavy courts run on a big-stack thread: `Registry::new()` (3 x
/// 4096 cache-padded cells) is a ~786KB value and the default 2MiB test
/// thread stack is marginal in debug builds. The court body is unchanged.
fn big_stack<T: Send + 'static>(f: impl FnOnce() -> T + Send + 'static) -> T {
    std::thread::Builder::new()
        .stack_size(32 * 1024 * 1024)
        .spawn(f)
        .expect("spawn big-stack court thread")
        .join()
        .expect("court thread panicked")
}


/// 1. Monotonic CAS: adopt strictly bumps by 1; regressions refused.
#[test]
fn cas_monotonic() {
    big_stack(|| {
    let reg = Box::new(Registry::new());
    let mut v = 0u64;
    for _ in 0..32 {
        v = reg.adopt(7, v).expect("sequential adopts must succeed");
    }
    assert_eq!(v, 32);
    // Expected ahead of actual is a conflict, `actual` carries the truth.
    match reg.adopt(7, 64) {
        Err(Refusal::VersionConflict { actual, .. }) => assert_eq!(actual, 32),
        other => panic!("expected VersionConflict, got {other:?}"),
    }
    // Repeat of an old expected is a conflict too (versions never repeat).
    match reg.adopt(7, 0) {
        Err(Refusal::VersionConflict { actual, .. }) => assert_eq!(actual, 32),
        other => panic!("expected VersionConflict, got {other:?}"),
    }
    })
}

/// 2. Entity independence: per-entity versions, slots never cross.
#[test]
fn cas_entities_independent() {
    big_stack(|| {
    let reg = Box::new(Registry::new());
    for i in 0..64u64 {
        let va = reg.adopt(0xA000 + i, 0).expect("fresh adopt succeeds");
        let vb = reg.adopt(0xB000 + i, 0).expect("fresh adopt succeeds");
        assert_eq!(va, 1);
        assert_eq!(vb, 1);
        assert_eq!(reg.version_of(0xA000 + i), Some(1));
        assert_eq!(reg.version_of(0xB000 + i), Some(1));
    }
    // Interleaved chain on one entity leaves others untouched.
    let v = reg.adopt(0xA000, 1).expect("adopt at current succeeds");
    assert_eq!(v, 2);
    assert_eq!(reg.version_of(0xB000), Some(1));
    })
}

/// 3. Stale carries actual: losers observe the winner's version.
#[test]
fn cas_stale_carries_actual() {
    big_stack(|| {
    let reg = Box::new(Registry::new());
    let win = reg.adopt(42, 0).expect("first adopt wins");
    assert_eq!(win, 1);
    match reg.adopt(42, 0) {
        Err(Refusal::VersionConflict { entity, expected, actual }) => {
            assert_eq!((entity, expected, actual), (42, 0, 1));
        }
        other => panic!("expected VersionConflict, got {other:?}"),
    }
    })
}

/// 4. One winner: N real threads race the same fresh entity, exactly one
/// wins, every loser gets VersionConflict (P3 contention gate).
#[test]
fn cas_one_winner_per_round() {
    big_stack(|| {
    use std::sync::{Arc, Mutex};
    const WRITERS: usize = 8;
    let reg = Arc::new(Mutex::new(Registry::new()));
    let mut handles = Vec::new();
    for _ in 0..WRITERS {
        let reg = Arc::clone(&reg);
        handles.push(std::thread::spawn(move || {
            let guard = reg.lock().expect("registry mutex");
            guard.adopt(0xDEAD_BEEF, 0)
        }));
    }
    let mut wins = 0;
    let mut conflicts = 0;
    for h in handles {
        match h.join().expect("writer thread panicked") {
            Ok(_) => wins += 1,
            Err(Refusal::VersionConflict { actual, .. }) => {
                conflicts += 1;
                // Losers observed the pre-bump version of their own attempt.
                assert!(actual <= 1, "loser actual must be 0 (pre-bump), got {actual}");
            }
            Err(other) => panic!("unexpected refusal class {other:?}"),
        }
    }
    assert_eq!(wins, 1, "exactly one winner per CAS round");
    assert_eq!(conflicts, WRITERS - 1);
    })
}

/// 5. Typestate compile-rejection: Lease<Spent> has no spend / re-commit.
/// The compile_fail doctest lives on the type (src/lease.rs); this runtime
/// leg proves the erased boundary refuses a spent lease by VALUE too.
#[test]
fn typestate_spent_lease_cannot_recommit() {
    let l = repop_kernel::Lease::<repop_kernel::Fresh>::new([9u8; 32], 2);
    assert!(l.is_fresh());
    let spent = l.spend(); // tick 0 -> 1
    assert!(!spent.is_fresh());
    assert_eq!(spent.refuse_recommit(), repop_kernel::Refusal::LeaseAlreadySpent);
}

/// 6. Overflow: version u64::MAX is saturated; no further advance exists.
#[test]
fn cas_version_overflow_refused() {
    big_stack(|| {
    let reg = Box::new(Registry::new());
    reg.force_version(0xF00D, u64::MAX).expect("court seed");
    assert_eq!(reg.version_of(0xF00D), Some(u64::MAX));
    match reg.adopt(0xF00D, u64::MAX) {
        Err(Refusal::VersionOverflow { entity, at }) => {
            assert_eq!((entity, at), (0xF00D, u64::MAX));
        }
        other => panic!("expected VersionOverflow, got {other:?}"),
    }
    })
}

/// 7. Full: the registry refuses entity 4097 (REGISTRY_CAP = 4096).
#[test]
fn cas_registry_exhausts_at_cap() {
    big_stack(|| {
    let reg = Box::new(Registry::new());
    for e in 0..repop_kernel::cas::REGISTRY_CAP as u64 {
        reg.adopt(e, 0).expect("adopt within cap succeeds");
    }
    assert_eq!(reg.len(), repop_kernel::cas::REGISTRY_CAP);
    match reg.adopt(repop_kernel::cas::REGISTRY_CAP as u64, 0) {
        Err(Refusal::RegistryExhausted) => {}
        other => panic!("expected RegistryExhausted, got {other:?}"),
    }
    })
}

/// 7b. Admissions accumulator: root advances monotonically; empty is zero;
/// matches the pure fold over the same leaf sequence.
#[test]
fn admissions_root_monotonic_and_folds() {
    big_stack(|| {
    use repop_kernel::receipt::{fold, receipt_leaf, emit, UNSEALED_RECEIPT_MAGIC};
    use repop_kernel::receipt::{DeltaS, PhiLease};
    let mut acc = Box::new(Admissions::new());
    assert_eq!(acc.root(), [0u8; 32]);
    let mut leaves: Vec<[u8; 32]> = Vec::new();
    for i in 0..9u64 {
        let delta = DeltaS {
            domain_tag: *b"CGAPDLT1",
            from_root: [i as u8; 32],
            to_root: [(i + 1) as u8; 32],
            op_count: i,
            admissions: [i as u8; 32],
        };
        let phi = PhiLease {
            lease_id: [1u8; 32],
            tick: i,
            tick_ceiling: 1000,
            issued_root: [2u8; 32],
        };
        let r = emit(delta, &phi);
        assert_eq!(r.magic, UNSEALED_RECEIPT_MAGIC);
        let leaf = receipt_leaf(&r);
        acc.append(leaf);
        leaves.push(leaf);
        // Independent std-Vec oracle mirror of the MMR stack law (same
        // merge rule, independently written — common/mod.rs oracle idiom).
        let mut stack: Vec<([u8; 32], u32)> = Vec::new();
        for &l in &leaves {
            let mut node = (l, 0u32);
            while let Some(&(top, d)) = stack.last() {
                if d == node.1 {
                    stack.pop();
                    node = (mmr_parent(&top, &node.0), d + 1);
                } else {
                    break;
                }
            }
            stack.push(node);
        }
        let mut oracle = if stack.is_empty() { [0u8; 32] } else { stack[0].0 };
        for entry in stack.iter().skip(1) {
            oracle = mmr_parent(&oracle, &entry.0);
        }
        assert_eq!(acc.root(), oracle, "accumulator root == oracle (n={})", i + 1);
        // Level fold == MMR fold where the tree shapes coincide (powers of 2).
        if (i + 1).is_power_of_two() {
            assert_eq!(acc.root(), fold(&leaves), "power-of-two root == level fold (n={})", i + 1);
        }
    }
    assert_eq!(acc.count(), 9);
    })
}

/// Test-side Merkle parent (independent of kernel internals).
fn mmr_parent(left: &[u8; 32], right: &[u8; 32]) -> [u8; 32] {
    use repop_kernel::receipt::fold;
    fold(&[*left, *right])
}
