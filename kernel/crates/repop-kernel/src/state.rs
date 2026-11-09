//! Per-entity CAS version registry (`state.rs`, P3).
//!
//! One cache-padded `AtomicU64` version cell per entity slot, plus a key cell
//! and an occupied cell. `compare_exchange` (AcqRel success / Acquire failure)
//! is the only mutation primitive; a failed exchange returns a typed refusal
//! (P3 resolved decision 1). Retry policy belongs to the caller.
//!
//! Also hosts: the monotonic `receipt_seq` counter (`fetch_add` Relaxed) and
//! the admissions Merkle accumulator (root advances monotonically with the
//! receipt sequence; leaf hashing lives in `receipt.rs`).

#![no_std]

use crate::refuse::Refusal;
use crate::vendor::keyed_blake3;
use core::sync::atomic::{AtomicU64, Ordering};

/// Registry capacity: 4096 entity slots (P3 plan, cache-padded registry).
pub const REGISTRY_CAP: usize = 4096;

/// Cache-line padding so adjacent entity slots never share a line (P3
/// decision: per-entity contention stays per-entity).
#[repr(align(64))]
#[derive(Debug)]
pub struct CachePadded(AtomicU64);

impl CachePadded {
    const fn zero() -> Self {
        Self(AtomicU64::new(0))
    }

    fn load(&self, ord: Ordering) -> u64 {
        self.0.load(ord)
    }

    fn store(&self, v: u64, ord: Ordering) {
        self.0.store(v, ord)
    }

    fn fetch_add(&self, v: u64, ord: Ordering) -> u64 {
        self.0.fetch_add(v, ord)
    }

    fn cas(
        &self,
        current: u64,
        new: u64,
        success: Ordering,
        failure: Ordering,
    ) -> Result<u64, u64> {
        self.0
            .compare_exchange(current, new, success, failure)
            .map(|_| new)
            .map_err(|observed| observed)
    }
}

/// Entity key stored alongside each version cell. Entity key 0 is mapped to
/// a non-zero internal token (`ENTITY0_TOKEN`) so the raw 0 pattern can be
/// distinguished from "slot never claimed" bookkeeping.
const ENTITY0_TOKEN: u64 = u64::MAX;
/// Occupied flag value for a claimed slot (empty slots read 0).
const OCCUPIED: u64 = 1;
/// Occupied flag value for a free slot.
const FREE: u64 = 0;

/// SplitMix64-style finalizer: spreads sequential entity ids across slots so
/// probe chains stay short under load.
#[inline]
fn mix(entity: u64) -> u64 {
    let mut z = entity.wrapping_mul(0x9E37_79B9_7F4A_7C15);
    z = (z ^ (z >> 30)).wrapping_mul(0xBF58_476D_1CE4_E5B9);
    z = (z ^ (z >> 27)).wrapping_mul(0x94D0_49A3_3B52_C9B3);
    z
}

/// Per-entity CAS version registry (fixed cap, no allocation).
pub struct Registry {
    /// Occupancy flags: [`FREE`] = free, [`OCCUPIED`] = claimed.
    occupied: [CachePadded; REGISTRY_CAP],
    /// Entity key per slot (internal token for entity 0).
    keys: [CachePadded; REGISTRY_CAP],
    /// Version cell per slot.
    versions: [CachePadded; REGISTRY_CAP],
    /// Monotonic receipt sequence (fetch_add Relaxed per P3).
    receipt_seq: CachePadded,
}

impl Registry {
    /// Fresh registry: all slots free, all versions 0, receipt_seq 0.
    pub fn new() -> Self {
        Self {
            occupied: core::array::from_fn(|_| CachePadded::zero()),
            keys: core::array::from_fn(|_| CachePadded::zero()),
            versions: core::array::from_fn(|_| CachePadded::zero()),
            receipt_seq: CachePadded::zero(),
        }
    }

    /// Internal slot lookup: linear probe from `mix(entity)`. Claims the
    /// first free slot it probes when no key match exists (CAS on the
    /// occupied cell arbitrates concurrent claims; the `&mut self` court
    /// path serializes anyway, and the CAS keeps the primitive honest).
    fn slot_of(&self, entity: u64) -> Result<usize, Refusal> {
        let token = if entity == 0 { ENTITY0_TOKEN } else { entity };
        let start = mix(entity) as usize % REGISTRY_CAP;
        for probe in 0..REGISTRY_CAP {
            let idx = (start + probe) % REGISTRY_CAP;
            let state = self.occupied[idx].load(Ordering::Acquire);
            if state == FREE {
                // Claim race-free: only the winner of this CAS writes a key.
                if self.occupied[idx]
                    .cas(FREE, OCCUPIED, Ordering::AcqRel, Ordering::Acquire)
                    .is_ok()
                {
                    self.keys[idx].store(token, Ordering::Relaxed);
                    return Ok(idx);
                }
            } else if self.keys[idx].load(Ordering::Acquire) == token {
                return Ok(idx);
            }
        }
        Err(Refusal::RegistryExhausted)
    }

    /// The kernel's expected next receipt sequence.
    pub fn next_receipt_seq(&self) -> u64 {
        self.receipt_seq.load(Ordering::Acquire)
    }

    /// Allocate-and-return the next receipt sequence (fetch_add Relaxed per
    /// P3 plan). The caller must present this seq back at emit; a mismatch
    /// is [`Refusal::ReceiptSequenceGap`].
    pub fn take_receipt_seq(&self) -> u64 {
        self.receipt_seq.fetch_add(1, Ordering::Relaxed)
    }

    /// Read the current stored version of `entity` (`None` = never seen).
    pub fn version_of(&self, entity: u64) -> Option<u64> {
        let token = if entity == 0 { ENTITY0_TOKEN } else { entity };
        let start = mix(entity) as usize % REGISTRY_CAP;
        for probe in 0..REGISTRY_CAP {
            let idx = (start + probe) % REGISTRY_CAP;
            let state = self.occupied[idx].load(Ordering::Acquire);
            if state == FREE {
                return None;
            }
            if self.keys[idx].load(Ordering::Acquire) == token {
                return Some(self.versions[idx].load(Ordering::Acquire));
            }
        }
        None
    }

    /// Raw CAS advance: `new` replaces `expected` iff the stored version is
    /// `expected`. Refuses any `new <= expected` (monotonic law: versions
    /// never regress or repeat) with [`Refusal::VersionConflict`], and
    /// refuses `expected == u64::MAX` with [`Refusal::VersionOverflow`]
    /// (no monotonic advance exists past saturation).
    pub fn cas(&self, entity: u64, expected: u64, new: u64) -> Result<u64, Refusal> {
        let idx = self.slot_of(entity)?;
        let current = self.versions[idx].load(Ordering::Acquire);
        if current != expected {
            return Err(Refusal::VersionConflict {
                entity,
                expected,
                actual: current,
            });
        }
        if expected == u64::MAX || new <= expected {
            return Err(Refusal::VersionOverflow {
                entity,
                at: expected,
            });
        }
        self.versions[idx]
            .cas(expected, new, Ordering::AcqRel, Ordering::Acquire)
            .map_err(|actual| Refusal::VersionConflict {
                entity,
                expected,
                actual,
            })
    }

    /// Advance `entity` to `expected + 1`, refusing anything but the exact
    /// current version (P3 gate law: one winner per round; losers get
    /// [`Refusal::VersionConflict`] carrying the winning `actual`).
    pub fn adopt(&self, entity: u64, expected: u64) -> Result<u64, Refusal> {
        self.cas(entity, expected, expected.wrapping_add(1))
    }

    /// Seed a version directly (court-only: lets the overflow court pin
    /// `u64::MAX` without walking 2^64 versions). Disclosed lane law.
    #[doc(hidden)]
    pub fn force_version(&self, entity: u64, v: u64) -> Result<(), Refusal> {
        let idx = self.slot_of(entity)?;
        self.versions[idx].store(v, Ordering::Release);
        Ok(())
    }

    /// Number of currently-occupied slots (observability / courts).
    pub fn len(&self) -> usize {
        self.occupied
            .iter()
            .filter(|c| c.load(Ordering::Acquire) == OCCUPIED)
            .count()
    }

    /// True when no entity is registered.
    pub fn is_empty(&self) -> bool {
        self.len() == 0
    }
}

impl Default for Registry {
    fn default() -> Self {
        Self::new()
    }
}

/// The admissions Merkle accumulator: append-only node stack, root advances
/// monotonically with the receipt sequence (P3 resolved decision 3). Leaves
/// are hashed in `receipt.rs`; this type only folds. Odd trailing nodes are
/// promoted unchanged (cgap `admissions_root` parity).
pub struct Admissions {
    /// `stack[i]` holds a subtree root of depth `i`.
    stack: [([u8; 32], u32); 32],
    top: usize,
    /// Leaves folded so far.
    count: u64,
}

impl Admissions {
    /// Empty accumulator; root is all-zero until the first leaf.
    pub const fn new() -> Self {
        Self {
            stack: [([0u8; 32], 0); 32],
            top: 0,
            count: 0,
        }
    }

    /// Append one leaf hash and advance the root: merge equal-depth siblings
    /// up the stack, then push the merged node.
    pub fn append(&mut self, leaf: [u8; 32]) {
        let mut node = (leaf, 0u32);
        while self.top > 0 && self.stack[self.top - 1].1 == node.1 {
            let (sibling, depth) = self.stack[self.top - 1];
            self.top -= 1;
            node = (parent(&sibling, &node.0), depth + 1);
        }
        self.stack[self.top] = node;
        self.top += 1;
        self.count += 1;
    }

    /// Current Merkle root: folds the stack in order (odd nodes promoted).
    /// Empty tree is `[0; 32]` (cgap `admissions_root(&[])` parity).
    pub fn root(&self) -> [u8; 32] {
        if self.top == 0 {
            return [0u8; 32];
        }
        let mut acc = self.stack[0].0;
        for entry in self.stack.iter().take(self.top).skip(1) {
            acc = parent(&acc, &entry.0);
        }
        acc
    }

    /// Leaves appended so far.
    pub fn count(&self) -> u64 {
        self.count
    }
}

impl Default for Admissions {
    fn default() -> Self {
        Self::new()
    }
}

/// Unkeyed BLAKE3 parent over `left || right` (64 bytes, one chunk).
fn parent(left: &[u8; 32], right: &[u8; 32]) -> [u8; 32] {
    let mut buf = [0u8; 64];
    buf[..32].copy_from_slice(left);
    buf[32..].copy_from_slice(right);
    keyed_blake3::hash_unkeyed(&buf)
}

/// C5 court contract (tests/cas_differential_courts.rs pins the free
/// function form): adopt via a `&mut Registry` handle.
pub fn adopt(registry: &mut Registry, entity: u64, expected: u64) -> Result<u64, Refusal> {
    registry.adopt(entity, expected)
}
