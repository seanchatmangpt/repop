//! repop-kernel-wasm — wasm32-unknown-unknown glue for the repop kernel.
//!
//! P4 charter: raw `extern "C"` exports over caller-supplied linear memory
//! (fixed-width ints and offsets only, zero JSON), bump arena over
//! `__heap_base` with `memory.grow` fallback, panic handler, eh personality
//! stub. Export surface (pinned allowlist; the footprint gate enforces
//! exact-match, extras are failures):
//!
//! `repop_abi_version`, `repop_version`, `repop_scratch_alloc`,
//! `repop_scratch_reset`, `repop_scratch_remaining`, `repop_solve`,
//! `repop_receipt_emit`, `repop_cas_commit`, `repop_cas_read`.
//!
//! `repop_solve`/`repop_receipt_emit`/`repop_cas_*` validate their 64-byte
//! frames through the real repop-abi codecs (C6w wire-up), then return
//! [`abi::ERR_UNWIRED`] until the P2 (solver) and P3 (CAS + receipt emit)
//! kernel APIs are wired via the `repop-kernel` path dep.
//!
//! Mutation hook (footprint-gate non-vacuity leg): building with
//! `RUSTFLAGS='--cfg repop_drop_version_export'` compiles `repop_version`
//! out of the export table; the exports leg must then FAIL.

#![no_std]
#![no_main]
// Mutation-leg cfg is expected to be unused in normal builds.
#![allow(unexpected_cfgs)]

use core::panic::PanicInfo;

pub mod abi;
pub mod arena;

/// Offset type crossing the ABI: absolute linear-memory offset into the
/// caller-supplied buffer. Lengths are the same width.
pub type Ptr = u32;

/// ABI version of this export table, read from repop-abi's pinned layout
/// version (C6w wire-up: single source of truth, no ad-hoc constant).
pub const ABI_VERSION: u32 = repop_abi::layout_spec::LAYOUT_VERSION as u32;

/// Crate version, mirrored statically so hosts can read it without alloc.
pub const PKG_VERSION: &str = env!("CARGO_PKG_VERSION");
const PKG_VERSION_MAJOR: u32 = 0;
const PKG_VERSION_MINOR: u32 = 1;
const PKG_VERSION_PATCH: u32 = 0;

/// Panic law: on wasm32-unknown-unknown there is no unwinding host —
/// panic = `wasm32::unreachable` (trap), surfaced by the host as a
/// WebAssembly.RuntimeError. Fail-closed, never silent.
#[panic_handler]
#[cfg_attr(test, allow(dead_code))]
fn panic(_info: &PanicInfo) -> ! {
    core::arch::wasm32::unreachable()
}

/// Exception-handling personality stub. wasm32-unknown-unknown does not
/// require it for this build + eh-probe runs; the stable `#[no_mangle]`
/// symbol keeps the module loadable under runtimes that probe for it
/// (precedent: cgap wasm-footprint). Kept minimal and non-trapping.
#[no_mangle]
pub extern "C" fn __rust_eh_personality() {}

// ---------------------------------------------------------------------------
// Version / ABI introspection exports
// ---------------------------------------------------------------------------

/// Packed ABI version of the export table.
#[no_mangle]
#[cfg(not(repop_drop_version_export))]
pub extern "C" fn repop_abi_version() -> u32 {
    ABI_VERSION
}

/// Packed crate version (major<<16 | minor<<8 | patch).
#[no_mangle]
pub extern "C" fn repop_version() -> u32 {
    (PKG_VERSION_MAJOR << 16) | (PKG_VERSION_MINOR << 8) | PKG_VERSION_PATCH
}

// ---------------------------------------------------------------------------
// Scratch (kernel-internal arena) exports
// ---------------------------------------------------------------------------

/// Allocate `len` bytes (8-byte aligned) of kernel-internal scratch.
/// Returns the absolute linear-memory offset, or 0 on refusal (0 is never a
/// valid arena address: the arena floor sits past all static data).
#[no_mangle]
pub extern "C" fn repop_scratch_alloc(len: u32) -> Ptr {
    use core::alloc::Layout;
    if len == 0 {
        return 0;
    }
    let layout = Layout::from_size_align(len as usize, 8).expect("align is a power of two");
    let p = arena::GLOBAL_ARENA.alloc(layout);
    if p.is_null() {
        abi::ERR_OOM as Ptr // refusal marker: caller checks == 0
    } else {
        p as Ptr
    }
}

/// Reset kernel-internal scratch. Per-call scratch never accumulates.
#[no_mangle]
pub extern "C" fn repop_scratch_reset() {
    arena::GLOBAL_ARENA.reset();
}

/// Bytes remaining between the scratch bump pointer and an exhausted memory.
#[no_mangle]
pub extern "C" fn repop_scratch_remaining() -> u32 {
    arena::GLOBAL_ARENA.remaining() as u32
}

// ---------------------------------------------------------------------------
// Kernel capability exports (frame-validated placeholders until P2/P3 land)
// ---------------------------------------------------------------------------

/// Read a 64-byte frame at a caller-supplied linear-memory offset, bounded by
/// the current wasm memory size. Fail-closed: a truncated or out-of-range
/// offset is a typed refusal (None), never a trap.
fn read_frame(offset: Ptr) -> Option<[u8; repop_abi::FRAME_SIZE]> {
    let mem_bytes = (core::arch::wasm32::memory_size::<0>() as u64) * 65536;
    let end = u64::from(offset) + repop_abi::FRAME_SIZE as u64;
    if end > mem_bytes {
        return None;
    }
    // Safety: `[offset, offset+FRAME_SIZE)` is within the linear memory just
    // bounds-checked above.
    let base = offset as usize as *const u8;
    Some(
        unsafe { core::slice::from_raw_parts(base, repop_abi::FRAME_SIZE) }
            .try_into()
            .expect("slice len equals FRAME_SIZE"),
    )
}

/// Validate the intent frame at `intent` (64B repop-abi `IntentFrame`) using
/// the real repop-abi codec (magic, version, reserved-zero law, digest).
///
/// PLACEHOLDER (C6w): validation is wired; the solve itself is not — a VALID
/// intent still returns [`abi::ERR_UNWIRED`] until the P2 solver lands.
#[no_mangle]
pub extern "C" fn repop_solve(intent: Ptr, _out_register: Ptr) -> abi::Status {
    match read_frame(intent) {
        None => abi::ERR_BAD_INTENT,
        Some(bytes) => match repop_abi::frame::IntentFrame::decode(&bytes) {
            Ok(_) => abi::ERR_UNWIRED,
            Err(_) => abi::ERR_BAD_INTENT,
        },
    }
}

/// Validate the receipt frame at `receipt` (64B repop-abi `ReceiptFrame`)
/// using the real repop-abi codec.
///
/// PLACEHOLDER (C6w): validation is wired; the seal itself is not — a VALID
/// receipt still returns [`abi::ERR_UNWIRED`] until the P3 receipt emit lands.
#[no_mangle]
pub extern "C" fn repop_receipt_emit(receipt: Ptr) -> abi::Status {
    match read_frame(receipt) {
        None => abi::ERR_RECEIPT_INVALID,
        Some(bytes) => match repop_abi::receipt::ReceiptFrame::decode(&bytes) {
            Ok(_) => abi::ERR_UNWIRED,
            Err(_) => abi::ERR_RECEIPT_INVALID,
        },
    }
}

/// CAS-commit `value` into the registry slot keyed by `slot`, expecting
/// version `expected`; writes the new version to `out_version`.
/// Caller-supplied memory.
///
/// PLACEHOLDER: returns [`abi::ERR_UNWIRED`] until the P3 CAS registry is wired.
#[no_mangle]
pub extern "C" fn repop_cas_commit(
    _slot: u32,
    _expected: u32,
    _value: Ptr,
    _out_version: Ptr,
) -> abi::Status {
    abi::ERR_UNWIRED
}

/// CAS-read the current value of registry slot `slot` into `out_value`,
/// writing its version to `out_version`. Caller-supplied memory.
///
/// PLACEHOLDER: returns [`abi::ERR_UNWIRED`] until the P3 CAS registry is wired.
#[no_mangle]
pub extern "C" fn repop_cas_read(_slot: u32, _out_value: Ptr, _out_version: Ptr) -> abi::Status {
    abi::ERR_UNWIRED
}
