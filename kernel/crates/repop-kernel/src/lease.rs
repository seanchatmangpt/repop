//! Φ-lease Fresh/Spent affine typestate (`lease.rs`, P3).
//!
//! A [`Lease<Fresh>`] carries authority: exactly one ticket. Consuming it is
//! a type-level transition to [`Lease<Spent>`] — double-spend is
//! unrepresentable (the re-commit method does not exist on the spent type).
//! The stale-spends-ticket law (P3): a commit attempt with a stale expected
//! version REFUSES, and the lease comes back [`Spent`] anyway — a failed
//! round consumes the ticket, so the same authority cannot be re-presented.
//!
//! Wire form: the canonical 80-byte `PhiLease` (cgap §3.2 shape — lease_id 32
//! || tick 8 LE || tick_ceiling 8 LE || issued_root 32), re-declared here so
//! the kernel crate carries its own no_std copy (R11 vendor law).

#![no_std]

use crate::refuse::Refusal;

/// Wire width of the 80-byte lease epoch (cgap §3.2 parity).
pub const PHI_LEASE_LEN: usize = 80;

/// Typestate marker: the lease carries one unspent ticket.
#[derive(Debug, Clone, Copy)]
pub struct Fresh;

/// Typestate marker: the ticket has been consumed.
#[derive(Debug, Clone, Copy)]
pub struct Spent;

/// The lease epoch, affine in `Fresh` state. `S` is [`Fresh`] or [`Spent`].
#[derive(Debug)]
pub struct Lease<S> {
    /// 32 random bytes bound to the lease instance.
    lease_id: [u8; 32],
    /// Monotonic tick; starts 0, advances by 1 per ticket consumption.
    tick: u64,
    /// Fixed ceiling; > 0 (trap on 0 at construction, cgap §5 law).
    tick_ceiling: u64,
    /// BLAKE3 digest binding the lease to the key epoch; doubles as the
    /// receipt digest key.
    issued_root: [u8; 32],
    /// Runtime shadow of the typestate for the FFI boundary (erased paths
    /// cannot carry the type parameter).
    fresh: bool,
    _marker: core::marker::PhantomData<S>,
}

impl Lease<Fresh> {
    /// A fresh lease with a fixed ceiling and an all-zero issued_root seed —
    /// callers stamp the real epoch root via [`Lease::with_issued_root`].
    /// Traps (panic) when `tick_ceiling == 0`: no tick can ever be spent
    /// from such a lease (cgap §5).
    pub fn new(lease_id: [u8; 32], tick_ceiling: u64) -> Self {
        assert!(
            tick_ceiling > 0,
            "repop-kernel: lease tick_ceiling must be > 0; a zero-ceiling lease can spend no ticket"
        );
        Self {
            lease_id,
            tick: 0,
            tick_ceiling,
            issued_root: [0u8; 32],
            fresh: true,
            _marker: core::marker::PhantomData,
        }
    }

    /// Stamp the epoch key (receipt digest key = `issued_root`).
    pub fn with_issued_root(mut self, issued_root: [u8; 32]) -> Self {
        self.issued_root = issued_root;
        self
    }

    /// The 80-byte canonical wire encoding at the current tick.
    pub fn phi(&self) -> crate::receipt::PhiLease {
        crate::receipt::PhiLease {
            lease_id: self.lease_id,
            tick: self.tick,
            tick_ceiling: self.tick_ceiling,
            issued_root: self.issued_root,
        }
    }

    /// Current tick (pure read; reading is not spending).
    pub fn tick(&self) -> u64 {
        self.tick
    }

    /// Fixed ceiling.
    pub fn tick_ceiling(&self) -> u64 {
        self.tick_ceiling
    }

    /// True while the ticket is unspent.
    pub fn is_fresh(&self) -> bool {
        self.fresh
    }

    /// Consume the ticket: tick advances by 1, authority moves to [`Spent`].
    /// Traps when exhausted (cgap §5: an exhausted tick is an authority
    /// invariant failure, aborting the spend, not an error return).
    pub fn spend(self) -> Lease<Spent> {
        assert!(
            self.tick < self.tick_ceiling,
            "repop-kernel: lease tick {} >= tick_ceiling {} — authority exhausted (cgap §5 trap)",
            self.tick,
            self.tick_ceiling
        );
        Lease {
            lease_id: self.lease_id,
            tick: self.tick + 1,
            tick_ceiling: self.tick_ceiling,
            issued_root: self.issued_root,
            fresh: false,
            _marker: core::marker::PhantomData,
        }
    }

    /// Observe as [`Refusal::ExhaustedLease`] instead of trapping (the
    /// typed-refusal path for callers who must not panic). Consumes nothing.
    pub fn check_spendable(&self) -> Result<(), Refusal> {
        if !self.fresh {
            return Err(Refusal::LeaseAlreadySpent);
        }
        if self.tick >= self.tick_ceiling {
            return Err(Refusal::ExhaustedLease {
                tick: self.tick,
                tick_ceiling: self.tick_ceiling,
            });
        }
        Ok(())
    }
}

impl Lease<Spent> {
    /// Runtime shadow for the erased (FFI) boundary: `false` by construction.
    pub fn is_fresh(&self) -> bool {
        false
    }

    /// The 80-byte wire encoding of the spent epoch (post-spend tick value).
    pub fn phi(&self) -> crate::receipt::PhiLease {
        crate::receipt::PhiLease {
            lease_id: self.lease_id,
            tick: self.tick,
            tick_ceiling: self.tick_ceiling,
            issued_root: self.issued_root,
        }
    }

    /// Re-arming a spent lease is refused by the type system; this method
    /// exists only so the refusal is expressible at the erased boundary.
    pub fn refuse_recommit(&self) -> Refusal {
        Refusal::LeaseAlreadySpent
    }
}

/// ```compile_fail
/// /// Double-spend is a TYPE error: `Lease<Spent>` has no `spend`, and a
/// /// commit path taking `Lease<Fresh>` by value cannot be re-presented.
/// use repop_kernel::lease::Lease;
/// let l = Lease::<repop_kernel::lease::Fresh>::new([7u8; 32], 4);
/// let spent = l.spend();
/// let again = spent.spend(); // method does not exist on Lease<Spent>
/// ```
#[allow(dead_code)]
fn typestate_compile_rejection_doctest() {}

// Compile-time pin: `Lease` derives neither `Copy` nor `Clone` (see the
// struct above) — the affine authority cannot be duplicated by value copy.

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn fresh_lease_reports_fresh_and_spent_does_not() {
        let l = Lease::<Fresh>::new([1u8; 32], 2);
        assert!(l.is_fresh());
        let s = l.spend();
        assert!(!s.is_fresh());
        assert_eq!(s.refuse_recommit(), Refusal::LeaseAlreadySpent);
    }

    #[test]
    fn phi_wire_roundtrips_at_80_bytes() {
        let l = Lease::<Fresh>::new([3u8; 32], 9).with_issued_root([5u8; 32]);
        let phi = l.phi();
        let bytes = phi.to_bytes();
        assert_eq!(bytes.len(), PHI_LEASE_LEN);
        assert_eq!(crate::receipt::PhiLease::from_bytes(&bytes), phi);
    }
}
