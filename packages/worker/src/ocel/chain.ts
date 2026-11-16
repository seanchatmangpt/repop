/**
 * OCEL seal tier — BLAKE3 parent-chained digest links.
 *
 * Tier law (plan 20-aoq-uplink-demo §"CRC vs tamper tiers"):
 * - blake3 is the TAMPER tier: seal()/verify() digests are blake3 links.
 * - FNV-1a32 remains only where the ring uses it (transport-tier CRC
 *   analog); the FNV rolling chain is no longer the batch tamper tier.
 * Consumer law: beam4pm_zcode_ocel_verifier chains sha256 per link; the
 * chain shape (parent || canonical bytes, fixed field order, seal-last)
 * mirrors beam4pm's sha256 per-link law at blake3 strength.
 * Precedent: ash_pplan Standing.Chain — injectable digest module, canonical
 * field-list hashing, pending/outcome pairing, seal-last.
 *
 * Canonical serialization law: each link = blake3(parent ‖ field bytes),
 * fields in fixed order. Typed-array columns are fixed-width LE, so fields
 * are length-unambiguous; a variable-length (TEXT-class) field containing
 * LF is refused at the serialization seam (`LF_IN_FIELD`) — here that seam
 * is structurally vacuous because no raw string bytes enter the digest
 * (activities are dictionary-encoded u16 before hashing); the guard is the
 * enforcement point if a text field is ever added.
 *
 * Zero-dep law: BLAKE3 implemented here from the BLAKE3 spec
 * (BLAKE3-team/BLAKE3 test_vectors.json; paper: O'Connor & Aumasson 2020).
 * Sequential (non-keyed, no context string) mode only. KAT-vectored court
 * in chain.test.ts.
 */

/* ---------- BLAKE3 core (spec-conformant, keyless) ---------- */

const IV = new Uint32Array([
  0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
  0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
]) as Uint32Array;

const MSG_PERMUTATION = new Uint8Array([
  2, 6, 3, 10, 7, 0, 4, 13, 1, 11, 12, 5, 9, 14, 15, 8,
]);

const CHUNK_LEN = 1024;
const BLOCK_LEN = 64;

const CHUNK_START = 1 << 0;
const CHUNK_END = 1 << 1;
const PARENT = 1 << 2;
const ROOT = 1 << 3;

function rotr(x: number, n: number): number {
  return ((x >>> n) | (x << (32 - n))) >>> 0;
}

/** One BLAKE3 round over the message schedule `m`, mutating `state`. */
function round(m: Uint32Array, state: Uint32Array): void {
  // columns
  g(m, state, 0, 4, 8, 12, 0, 1);
  g(m, state, 1, 5, 9, 13, 2, 3);
  g(m, state, 2, 6, 10, 14, 4, 5);
  g(m, state, 3, 7, 11, 15, 6, 7);
  // diagonals
  g(m, state, 0, 5, 10, 15, 8, 9);
  g(m, state, 1, 6, 11, 12, 10, 11);
  g(m, state, 2, 7, 8, 13, 12, 13);
  g(m, state, 3, 4, 9, 14, 14, 15);
}

function g(
  m: Uint32Array,
  state: Uint32Array,
  ai: number,
  bi: number,
  ci: number,
  di: number,
  mx: number,
  my: number,
): void {
  let a = state[ai]!;
  a = (a + state[bi]! + m[mx]!) >>> 0;
  state[ai] = a;
  state[di] = rotr(state[di]! ^ a, 16);

  const c1 = (state[ci]! + state[di]!) >>> 0;
  state[ci] = c1;
  state[bi] = rotr(state[bi]! ^ c1, 12);

  let a2 = (state[ai]! + state[bi]! + m[my]!) >>> 0;
  state[ai] = a2;
  state[di] = rotr(state[di]! ^ a2, 8);

  const c2 = (state[ci]! + state[di]!) >>> 0;
  state[ci] = c2;
  state[bi] = rotr(state[bi]! ^ c2, 7);
}

/** Message-word permutation for the next round. */
function permutation(m: Uint32Array): Uint32Array {
  const out = new Uint32Array(16);
  for (let i = 0; i < 16; i++) out[i] = m[MSG_PERMUTATION[i]!]!;
  return out;
}

/** Load 16 LE u32 message words from a 64-byte block. */
function loadBlockWords(block: Uint8Array): Uint32Array {
  const words = new Uint32Array(16);
  const dv = new DataView(block.buffer, block.byteOffset, block.byteLength);
  for (let i = 0; i < 16; i++) {
    words[i] = dv.getUint32(i * 4, true);
  }
  return words;
}

/**
 * BLAKE3 compression function. Returns the full 16-word state
 * (first 8 XOR-fed-forward, last 8 pass-through, per spec).
 */
function compress(
  cv: Uint32Array,
  blockWords: Uint32Array,
  counter: number,
  blockLen: number,
  flags: number,
): Uint32Array {
  const state = new Uint32Array(16);
  state.set(cv, 0);
  state[8] = IV[0]!;
  state[9] = IV[1]!;
  state[10] = IV[2]!;
  state[11] = IV[3]!;
  state[12] = counter >>> 0;
  state[13] = Math.floor(counter / 0x100000000);
  state[14] = blockLen;
  state[15] = flags;

  const m = new Uint32Array(blockWords); // mutable copy of the schedule

  for (let r = 0; r < 7; r++) {
    round(m, state);
    if (r < 6) m.set(permutation(m)); // permutation skipped after round 7
  }

  const out = new Uint32Array(16);
  for (let i = 0; i < 8; i++) out[i] = state[i]! ^ state[i + 8]!;
  for (let i = 8; i < 16; i++) out[i] = state[i]!;
  return out;
}

function cvToBytes(words: Uint32Array): Uint8Array {
  const out = new Uint8Array(32);
  const dv = new DataView(out.buffer);
  for (let i = 0; i < 8; i++) dv.setUint32(i * 4, words[i]!, true);
  return out;
}

/** Chunk chaining value for one ≤1024-byte chunk at `counter`. */
function chunkCv(
  counter: number,
  chunk: Uint8Array,
  isRoot: boolean,
): Uint32Array {
  let cv = new Uint32Array(IV);
  const nBlocks = Math.max(1, Math.ceil(chunk.length / BLOCK_LEN));
  for (let b = 0; b < nBlocks; b++) {
    const off = b * BLOCK_LEN;
    const isLast = b === nBlocks - 1;
    const len = Math.min(BLOCK_LEN, chunk.length - off);
    const block = new Uint8Array(BLOCK_LEN);
    if (len > 0) block.set(chunk.subarray(off, off + len));
    const flags =
      (b === 0 ? CHUNK_START : 0) |
      (isLast ? CHUNK_END : 0) |
      (isLast && isRoot ? ROOT : 0);
    const out = compress(cv, loadBlockWords(block), counter, len, flags);
    cv = out.slice(0, 8);
  }
  return cv;
}

/** Parent chaining value over two child CVs. */
function parentCv(
  leftCv: Uint32Array,
  rightCv: Uint32Array,
  isRoot: boolean,
): Uint32Array {
  const block = new Uint8Array(BLOCK_LEN);
  block.set(cvToBytes(leftCv), 0);
  block.set(cvToBytes(rightCv), 32);
  const out = compress(
    new Uint32Array(IV),
    loadBlockWords(block),
    0, // parent blocks ignore the counter
    BLOCK_LEN,
    PARENT | (isRoot ? ROOT : 0),
  );
  return out.slice(0, 8);
}

/** Subtree CV over `input` starting at chunk index `counter`. */
function subtreeCv(
  counter: number,
  input: Uint8Array,
  isRoot: boolean,
): Uint32Array {
  if (input.length <= CHUNK_LEN) return chunkCv(counter, input, isRoot);
  // Largest power-of-two chunk count strictly less than total chunks.
  const totalChunks = Math.ceil(input.length / CHUNK_LEN);
  let split = 1;
  while (split * 2 < totalChunks) split *= 2;
  const left = subtreeCv(counter, input.subarray(0, split * CHUNK_LEN), false);
  const right = subtreeCv(
    counter + split,
    input.subarray(split * CHUNK_LEN),
    false,
  );
  return parentCv(left, right, isRoot);
}

/** BLAKE3 digest (32 bytes) over `input`, sequential keyless mode. */
export function blake3(input: Uint8Array): Uint8Array {
  return cvToBytes(subtreeCv(0, input, true));
}

export function blake3Hex(input: Uint8Array): string {
  return toHex(blake3(input));
}

export function toHex(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i++) {
    s += (bytes[i]! & 0xff).toString(16).padStart(2, "0");
  }
  return s;
}

/* ---------- parent-chained links (the seal-tier chain) ---------- */

/**
 * Genesis link parent: blake3 over the empty input — the canonical chain
 * root precursor (matches the BLAKE3 spec empty-input vector).
 */
export function chainGenesis(): Uint8Array {
  return blake3(new Uint8Array(0));
}

/**
 * One link: blake3(parent ‖ bytes). Fields must already be in canonical
 * order; each field is length-prefixed with its LE byte length so field
 * boundaries are unambiguous even across differing field widths.
 */
export function linkDigest(parent: Uint8Array, bytes: Uint8Array): Uint8Array {
  const framed = new Uint8Array(parent.length + 4 + bytes.length);
  framed.set(parent, 0);
  const dv = new DataView(framed.buffer);
  dv.setUint32(parent.length, bytes.length, true);
  framed.set(bytes, parent.length + 4);
  return blake3(framed);
}

/** Advance a parent-chained link over one field, framing it first. */
export function chainField(parent: Uint8Array, bytes: Uint8Array): Uint8Array {
  return linkDigest(parent, bytes);
}

/** Seal-tier chain over a fixed-order field list. */
export function chainOfFields(fields: Uint8Array[]): Uint8Array {
  let parent = chainGenesis();
  for (const f of fields) parent = chainField(parent, f);
  return parent;
}

/* ---------- canonical text seam (LF-in-field law) ---------- */

import { ocelErr, ok, type OcelResult } from "./errors.ts";

/**
 * Canonical TEXT-field serialization: UTF-8 bytes with the LF-in-field
 * law enforced — a field containing 0x0A is refused (LF_IN_FIELD) so
 * field-boundary framing can never be spoofed by an embedded newline.
 * Unused by the current typed-column batches (dict-encoded u16), but it
 * is the enforcement point of the chain.ex LF discipline for any future
 * variable-length field.
 */
export function canonicalTextBytes(s: string): OcelResult<Uint8Array> {
  const bytes = new TextEncoder().encode(s);
  for (let i = 0; i < bytes.length; i++) {
    if (bytes[i] === 0x0a) {
      return ocelErr(
        "LF_IN_FIELD",
        "canonical field contains LF; refused",
        { activity: s },
      );
    }
  }
  return ok(bytes);
}
