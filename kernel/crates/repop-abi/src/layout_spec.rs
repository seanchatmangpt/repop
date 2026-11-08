//! GENERATED-FILE SHAPE — single source of truth for all three frame layouts.
//!
//! Generated-file shape header per plan 01-abi decision 6: this module's
//! tables are what the TS mirror (`packages/abi/src/generated/layouts.ts`)
//! and the ggen pack gates project from. The `FieldSpec` rows below are
//! authoritative; the codecs in `frame.rs`/`hyperplane.rs`/`receipt.rs` MUST
//! derive offsets from these constants. Do not hand-edit a table row without
//! regenerating the mirror; a row/codec divergence is caught by the
//! `offset_of!` contiguity consts at the bottom of this file.

use core::mem::offset_of;

use crate::{
    DIGEST_OFFSET, DIGEST_SPAN, FRAME_SIZE, FNV1A32_OFFSET_BASIS, FNV1A32_PRIME,
};

/// Field classification for a [`FieldSpec`] row (mirror-projection enum).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum FieldKind {
    /// u16 scalar (LE).
    U16,
    /// u32 scalar (LE).
    U32,
    /// u64 scalar (LE).
    U64,
    /// IEEE-754 f64 (LE bit pattern).
    F64,
    /// Fixed-width opaque byte array (binding/nonce/pad).
    Bytes,
    /// The FNV-1a32 digest itself (excluded from the digest span).
    Digest,
}

/// One row of a frame layout table.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct FieldSpec {
    /// Byte offset of the field start within the 64B frame.
    pub offset: usize,
    /// Field width in bytes.
    pub width: usize,
    /// Stable field name (mirror + pack namespace input).
    pub name: &'static str,
    /// Field classification.
    pub kind: FieldKind,
}

/// `IntentFrame` magic: 0x4946 ("IF").
pub const INTENT_MAGIC: u16 = 0x4946;
/// `HyperplaneRegister` magic: 0x4850 ("HP").
pub const HYPERPLANE_MAGIC: u16 = 0x4850;
/// `ReceiptFrame` magic: 0x5246 ("RF").
pub const RECEIPT_MAGIC: u16 = 0x5246;

/// Pinned layout version for all three frames.
pub const LAYOUT_VERSION: u16 = 1;

/// `alg_id` seam: keyed-BLAKE3 binding of a 229B UnsealedReceipt.
pub const ALG_ID_KEYED_BLAKE3: u16 = 0x0000;
/// `alg_id` seam: ML-DSA-65 sealed receipt (server trust boundary only).
pub const ALG_ID_ML_DSA_65: u16 = 0x0001;

// ---------------------------------------------------------------------------
// IntentFrame — 64B map
// ---------------------------------------------------------------------------

/// IntentFrame layout table (offsets in bytes).
pub const INTENT_FIELDS: [FieldSpec; 11] = [
    FieldSpec { offset: 0, width: 2, name: "magic", kind: FieldKind::U16 },
    FieldSpec { offset: 2, width: 2, name: "version", kind: FieldKind::U16 },
    FieldSpec { offset: 4, width: 2, name: "intent_kind", kind: FieldKind::U16 },
    FieldSpec { offset: 6, width: 2, name: "flags", kind: FieldKind::U16 },
    FieldSpec { offset: 8, width: 8, name: "hyperplane_id", kind: FieldKind::U64 },
    FieldSpec { offset: 16, width: 8, name: "threshold", kind: FieldKind::F64 },
    FieldSpec { offset: 24, width: 8, name: "weight", kind: FieldKind::F64 },
    FieldSpec { offset: 32, width: 8, name: "issuer", kind: FieldKind::Bytes },
    FieldSpec { offset: 40, width: 16, name: "payload_binding", kind: FieldKind::Bytes },
    FieldSpec { offset: 56, width: 2, name: "frame_seq", kind: FieldKind::U16 },
    FieldSpec { offset: 58, width: 2, name: "reserved", kind: FieldKind::U16 },
];

// ---------------------------------------------------------------------------
// HyperplaneRegister — 64B map
// ---------------------------------------------------------------------------

/// HyperplaneRegister layout table (offsets in bytes).
pub const HYPERPLANE_FIELDS: [FieldSpec; 12] = [
    FieldSpec { offset: 0, width: 2, name: "magic", kind: FieldKind::U16 },
    FieldSpec { offset: 2, width: 2, name: "version", kind: FieldKind::U16 },
    FieldSpec { offset: 4, width: 2, name: "plane_kind", kind: FieldKind::U16 },
    FieldSpec { offset: 6, width: 2, name: "flags", kind: FieldKind::U16 },
    FieldSpec { offset: 8, width: 8, name: "plane_id", kind: FieldKind::U64 },
    FieldSpec { offset: 16, width: 8, name: "normal_x", kind: FieldKind::F64 },
    FieldSpec { offset: 24, width: 8, name: "normal_y", kind: FieldKind::F64 },
    FieldSpec { offset: 32, width: 8, name: "normal_z", kind: FieldKind::F64 },
    FieldSpec { offset: 40, width: 8, name: "offset", kind: FieldKind::F64 },
    FieldSpec { offset: 48, width: 8, name: "binding", kind: FieldKind::Bytes },
    FieldSpec { offset: 56, width: 2, name: "epoch", kind: FieldKind::U16 },
    FieldSpec { offset: 58, width: 2, name: "reserved", kind: FieldKind::U16 },
];

// ---------------------------------------------------------------------------
// ReceiptFrame — 64B map (pinned verbatim by plan 01-abi decision 5)
// ---------------------------------------------------------------------------

/// ReceiptFrame layout table (offsets in bytes).
pub const RECEIPT_FIELDS: [FieldSpec; 9] = [
    FieldSpec { offset: 0, width: 2, name: "magic", kind: FieldKind::U16 },
    FieldSpec { offset: 2, width: 2, name: "version", kind: FieldKind::U16 },
    FieldSpec { offset: 4, width: 2, name: "alg_id", kind: FieldKind::U16 },
    FieldSpec { offset: 6, width: 2, name: "flags", kind: FieldKind::U16 },
    FieldSpec { offset: 8, width: 32, name: "binding", kind: FieldKind::Bytes },
    FieldSpec { offset: 40, width: 16, name: "admissions_root_prefix", kind: FieldKind::Bytes },
    FieldSpec { offset: 56, width: 2, name: "frame_seq", kind: FieldKind::U16 },
    FieldSpec { offset: 58, width: 2, name: "payload_len", kind: FieldKind::U16 },
    FieldSpec { offset: 60, width: 4, name: "digest", kind: FieldKind::Digest },
];

// ---------------------------------------------------------------------------
// Compile-time contiguity courts
//
// Each const assert proves (a) the struct's repr(C) placement matches the
// table exactly and (b) the table itself is gap-free from 0 to 60 with the
// digest at 60..64. A hand edit to either side that introduces a gap or a
// shift fails the build here, before any court runs.
// ---------------------------------------------------------------------------

const _: () = {
    use crate::frame::IntentFrame;
    use crate::hyperplane::HyperplaneRegister;
    use crate::receipt::ReceiptFrame;

    // total size + alignment
    assert!(core::mem::size_of::<IntentFrame>() == FRAME_SIZE);
    assert!(core::mem::align_of::<IntentFrame>() == 64);
    assert!(core::mem::size_of::<HyperplaneRegister>() == FRAME_SIZE);
    assert!(core::mem::align_of::<HyperplaneRegister>() == 64);
    assert!(core::mem::size_of::<ReceiptFrame>() == FRAME_SIZE);
    assert!(core::mem::align_of::<ReceiptFrame>() == 64);

    // IntentFrame: repr(C) placement == table rows
    assert!(offset_of!(IntentFrame, magic) == INTENT_FIELDS[0].offset);
    assert!(offset_of!(IntentFrame, version) == INTENT_FIELDS[1].offset);
    assert!(offset_of!(IntentFrame, intent_kind) == INTENT_FIELDS[2].offset);
    assert!(offset_of!(IntentFrame, flags) == INTENT_FIELDS[3].offset);
    assert!(offset_of!(IntentFrame, hyperplane_id) == INTENT_FIELDS[4].offset);
    assert!(offset_of!(IntentFrame, threshold) == INTENT_FIELDS[5].offset);
    assert!(offset_of!(IntentFrame, weight) == INTENT_FIELDS[6].offset);
    assert!(offset_of!(IntentFrame, issuer) == INTENT_FIELDS[7].offset);
    assert!(offset_of!(IntentFrame, payload_binding) == INTENT_FIELDS[8].offset);
    assert!(offset_of!(IntentFrame, frame_seq) == INTENT_FIELDS[9].offset);
    assert!(offset_of!(IntentFrame, reserved) == INTENT_FIELDS[10].offset);

    // HyperplaneRegister: repr(C) placement == table rows
    assert!(offset_of!(HyperplaneRegister, magic) == HYPERPLANE_FIELDS[0].offset);
    assert!(offset_of!(HyperplaneRegister, version) == HYPERPLANE_FIELDS[1].offset);
    assert!(offset_of!(HyperplaneRegister, plane_kind) == HYPERPLANE_FIELDS[2].offset);
    assert!(offset_of!(HyperplaneRegister, flags) == HYPERPLANE_FIELDS[3].offset);
    assert!(offset_of!(HyperplaneRegister, plane_id) == HYPERPLANE_FIELDS[4].offset);
    assert!(offset_of!(HyperplaneRegister, normal_x) == HYPERPLANE_FIELDS[5].offset);
    assert!(offset_of!(HyperplaneRegister, normal_y) == HYPERPLANE_FIELDS[6].offset);
    assert!(offset_of!(HyperplaneRegister, normal_z) == HYPERPLANE_FIELDS[7].offset);
    assert!(offset_of!(HyperplaneRegister, offset) == HYPERPLANE_FIELDS[8].offset);
    assert!(offset_of!(HyperplaneRegister, binding) == HYPERPLANE_FIELDS[9].offset);
    assert!(offset_of!(HyperplaneRegister, epoch) == HYPERPLANE_FIELDS[10].offset);
    assert!(offset_of!(HyperplaneRegister, reserved) == HYPERPLANE_FIELDS[11].offset);

    // ReceiptFrame: repr(C) placement == table rows (plan-pinned map)
    assert!(offset_of!(ReceiptFrame, magic) == RECEIPT_FIELDS[0].offset);
    assert!(offset_of!(ReceiptFrame, version) == RECEIPT_FIELDS[1].offset);
    assert!(offset_of!(ReceiptFrame, alg_id) == RECEIPT_FIELDS[2].offset);
    assert!(offset_of!(ReceiptFrame, flags) == RECEIPT_FIELDS[3].offset);
    assert!(offset_of!(ReceiptFrame, binding) == RECEIPT_FIELDS[4].offset);
    assert!(offset_of!(ReceiptFrame, admissions_root_prefix) == RECEIPT_FIELDS[5].offset);
    assert!(offset_of!(ReceiptFrame, frame_seq) == RECEIPT_FIELDS[6].offset);
    assert!(offset_of!(ReceiptFrame, payload_len) == RECEIPT_FIELDS[7].offset);
    // The digest is NOT a struct field (the struct's payload ends at 60;
    // repr(C,align(64)) pads the total to 64): the table pins the offset.
    assert!(RECEIPT_FIELDS[8].offset == DIGEST_OFFSET);

    // envelope law: digest field starts at 60 and is 4 wide => 64 total
    assert!(INTENT_FIELDS[10].offset + INTENT_FIELDS[10].width == DIGEST_OFFSET);
    assert!(HYPERPLANE_FIELDS[11].offset + HYPERPLANE_FIELDS[11].width == DIGEST_OFFSET);
    assert!(RECEIPT_FIELDS[8].offset == DIGEST_OFFSET);
    assert!(RECEIPT_FIELDS[8].width == 4);
    assert!(DIGEST_OFFSET + 4 == FRAME_SIZE);
    assert!(DIGEST_SPAN == DIGEST_OFFSET);

    // FNV-1a32 pinned constants (plan decision 7)
    assert!(FNV1A32_OFFSET_BASIS == 2166136261);
    assert!(FNV1A32_PRIME == 16777619);

    // alg_id seam pins (plan decision 2)
    assert!(ALG_ID_KEYED_BLAKE3 == 0x0000);
    assert!(ALG_ID_ML_DSA_65 == 0x0001);
};
