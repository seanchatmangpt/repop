//! Court 2 — CAS registry differential (court name: `cas-registry`).
//!
//! P5 gates rows `cas-registry` + `refusal-typing`. Named mutations
//! (`--mutate`): `cas-registry` = skip the monotonic version bump on the
//! adopt path (`src/state.rs`); `refusal-typing` = collapse two typed
//! refusals to one catch-all (`src/refuse.rs`).
//!
//! Real API (C3 landed 2026-11-08): `Registry::adopt(&self, entity, expected)`
//! monotonic bump-by-1; refusals carry winning `actual` for replay.

mod common;

use common::{gen_corpus, LANE_CAS};
use repop_kernel::Refusal;
use repop_kernel::cas::Registry;

#[test]
fn adopt_bumps_versions_monotonically() {
    // Registry::new() builds a 786KB value on the stack first — run the body
    // on a big-stack thread (macOS test-thread stack is 512KiB).
    std::thread::Builder::new()
        .stack_size(32 * 1024 * 1024)
        .spawn(adopt_bumps_body)
        .expect("big-stack thread")
        .join()
        .expect("body panicked");
}

fn adopt_bumps_body() {
    let corpus = gen_corpus(LANE_CAS, 64);
    let registry = Box::new(Registry::new());
    for (i, row) in corpus.iter().enumerate() {
        let v0 = registry
            .adopt(row.entity, 0)
            .expect("fresh adopt must succeed");
        let v1 = registry
            .adopt(row.entity, v0)
            .expect("adopt at current version must succeed");
        assert_eq!(v1, v0 + 1, "adopt bumps by exactly 1 (row {i})");
        // Stale expect refused with the winning version in `actual`.
        match registry.adopt(row.entity, 0) {
            Err(Refusal::VersionConflict { entity, expected, actual }) => {
                assert_eq!(entity, row.entity);
                assert_eq!(expected, 0);
                assert_eq!(actual, v1, "refusal carries the winning version");
            }
            other => panic!("stale adopt must VersionConflict, got {other:?} (row {i})"),
        }
    }
}

#[test]
fn cas_contention_one_winner_per_round() {
    // P3 gate law: N concurrent writers, exactly one winner per round, losers
    // get VersionConflict carrying the winner's version. Chicago: real
    // threads on the real atomic registry, final-state asserts.
    // Registry::new() builds a 786KB value — construct on a big-stack thread
    // (macOS test-thread default stack is 512KiB).
    const WRITERS: usize = 8;
    std::thread::Builder::new()
        .stack_size(32 * 1024 * 1024)
        .spawn(cas_contention_body)
        .expect("big-stack thread")
        .join()
        .expect("body panicked");
}

fn cas_contention_body() {
    const WRITERS: usize = 8;
    let registry = std::sync::Arc::new(Box::new(Registry::new()));
    let entity: u64 = 0xDEAD_BEEF;
    let mut handles = Vec::new();
    for _ in 0..WRITERS {
        let reg = std::sync::Arc::clone(&registry);
        handles.push(std::thread::spawn(move || reg.adopt(entity, 0)));
    }
    let (mut wins, mut conflicts) = (0usize, 0usize);
    for h in handles {
        match h.join().expect("writer panicked") {
            Ok(_) => wins += 1,
            Err(Refusal::VersionConflict { actual, .. }) => {
                assert_eq!(actual, 1, "losers see the winner's version");
                conflicts += 1;
            }
            Err(other) => panic!("unexpected refusal {other:?}"),
        }
    }
    assert_eq!(wins, 1, "exactly one winner per CAS round");
    assert_eq!(conflicts, WRITERS - 1);
}

#[test]
fn version_monotonic_law_refuses_regress() {
    std::thread::Builder::new()
        .stack_size(32 * 1024 * 1024)
        .spawn(version_monotonic_body)
        .expect("big-stack thread")
        .join()
        .expect("body panicked");
}

fn version_monotonic_body() {
    let registry = Box::new(Registry::new());
    let e = 0xC0FFEE;
    let v0 = registry.adopt(e, 0).expect("fresh adopt");
    // new <= expected is refused (no repeat, no regress).
    match registry.cas(e, v0, v0) {
        Err(Refusal::VersionOverflow { entity, at }) => {
            assert_eq!(entity, e);
            assert_eq!(at, v0);
        }
        other => panic!("version repeat must overflow-refuse, got {other:?}"),
    }
    // u64::MAX saturation refuses (no monotonic advance exists).
    let reg2 = Box::new(Registry::new());
    let e2 = 0xBEEF;
    let _ = reg2.adopt(e2, 0);
    reg2.force_version(e2, u64::MAX).expect("force to MAX");
    match reg2.cas(e2, u64::MAX, u64::MAX) {
        Err(Refusal::VersionOverflow { .. }) => {}
        other => panic!("saturation must overflow-refuse, got {other:?}"),
    }
}

#[test]
fn refusal_typing_closed_taxonomy() {
    // P5 gates row `refusal-typing`: refusals are a closed enum; each class
    // is distinct and replayable from fields alone (no strings, no catch-all).
    let classes: [&dyn Fn() -> Refusal; 4] = [
        &|| Refusal::VersionConflict { entity: 1, expected: 2, actual: 3 },
        &|| Refusal::LeaseAlreadySpent,
        &|| Refusal::ReceiptSequenceGap { expected: 4, got: 5 },
        &|| Refusal::RegistryExhausted,
        // (VersionOverflow checked in the monotonic-law court)
    ] as [&dyn Fn() -> Refusal; 4];
    for (i, a) in classes.iter().enumerate() {
        for (j, b) in classes.iter().enumerate() {
            let (va, vb) = (a(), b());
            assert_eq!(va == vb, i == j, "refusal classes must be distinct");
        }
    }
    // replayable-from-fields law: VersionConflict fields reconstruct it.
    let c = Refusal::VersionConflict { entity: 7, expected: 3, actual: 4 };
    let Refusal::VersionConflict { entity, expected, actual } = c else {
        unreachable!()
    };
    assert_eq!((entity, expected, actual), (7, 3, 4));
}
