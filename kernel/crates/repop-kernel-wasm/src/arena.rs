//! Bump allocator over `__heap_base`, ported from cgap `wasm-footprint`
//! (wasm32-wasip1) to wasm32-unknown-unknown (P4 plan, R2/E1/E20).
//!
//! Law: the arena serves kernel-internal allocations only. The ABI surface
//! is allocation-free (fixed-width 64B frames, caller-supplied memory) —
//! the host owns the exchange buffers; the kernel never mints its own.
//!
//! Growth law: the arena starts at `__heap_base` (end of static data). When
//! the bump pointer reaches the current top of linear memory, the allocator
//! issues `memory.grow` one page at a time. If growth fails (host-imposed
//! limits), allocation returns null and callers must surface a typed
//! failure, never unwrap. This is the documented fallback: a fresh
//! `wasm32-unknown-unknown` module starts with one 64KiB page, so any
//! arena use beyond the static data's tail of page 0 forces an early grow.

use core::alloc::{GlobalAlloc, Layout};
use core::ptr;
use core::sync::atomic::{AtomicUsize, Ordering};

extern "C" {
    /// Linker-emitted end of the static data section — arena floor.
    static __heap_base: u8;
}

/// Page size of the wasm linear memory (64 KiB).
const PAGE: usize = 64 * 1024;

/// Current bump pointer (absolute linear-memory offset).
static BUMP: AtomicUsize = AtomicUsize::new(0);

/// One-call-at-a-time arena: wasm is single-threaded here; the atomic is
/// the guard, not a claim of thread safety for foreign threads.
pub struct Arena;

/// Compute the arena floor once, from the linker symbol.
#[inline]
fn heap_base() -> usize {
    // SAFETY: `__heap_base` is a linker-emitted address symbol; we only read
    // its address, never dereference.
    unsafe { &__heap_base as *const u8 as usize }
}

/// Current top of linear memory in bytes.
#[inline]
fn mem_top() -> usize {
    let pages = core::arch::wasm32::memory_size(0);
    pages * PAGE
}

impl Arena {
    /// Bump-allocate `layout.size` bytes aligned to `layout.align`.
    /// Returns null on growth failure (typed failure at the call site).
    pub fn alloc(&self, layout: Layout) -> *mut u8 {
        let base = heap_base();
        let cur = BUMP.load(Ordering::Relaxed);
        loop {
            let start = base + cur;
            let aligned = (start + layout.align() - 1) & !(layout.align() - 1);
            let end = aligned + layout.size();
            if end <= mem_top() {
                if BUMP
                    .compare_exchange_weak(cur, end - base, Ordering::Relaxed, Ordering::Relaxed)
                    .is_ok()
                {
                    // SAFETY: end <= mem_top by the check above; region is
                    // beyond all static data and never handed out twice.
                    unsafe { ptr::write_bytes(aligned as *mut u8, 0, layout.size()) };
                    return aligned as *mut u8;
                }
                continue;
            }
            // Need one more page; grow then retry the same loop.
            // On this rustc the intrinsic returns usize; failure = usize::MAX.
            let prev = core::arch::wasm32::memory_grow(0, 1);
            if prev == usize::MAX {
                // Documented fallback: growth refused (host cap) -> null.
                // Caller must surface a typed failure.
                return ptr::null_mut();
            }
        }
    }

    /// Reset the arena to its floor. `repop_scratch_reset` calls this between
    /// solve invocations so per-call scratch does not accumulate across calls.
    pub fn reset(&self) {
        BUMP.store(0, Ordering::Relaxed);
    }

    /// Bytes currently handed out (bump offset past the floor).
    pub fn used(&self) -> usize {
        BUMP.load(Ordering::Relaxed)
    }

    /// Bytes between the bump pointer and the current top of memory.
    pub fn remaining(&self) -> usize {
        mem_top().saturating_sub(heap_base() + self.used())
    }
}

/// Global allocator for the kernel wasm module. Kernel-internal only.
unsafe impl GlobalAlloc for Arena {
    unsafe fn alloc(&self, layout: Layout) -> *mut u8 {
        self.alloc(layout)
    }

    unsafe fn dealloc(&self, _ptr: *mut u8, _layout: Layout) {
        // Bump arena: no individual dealloc. `repop_scratch_reset` reclaims.
    }
}

#[global_allocator]
pub static GLOBAL_ARENA: Arena = Arena;
