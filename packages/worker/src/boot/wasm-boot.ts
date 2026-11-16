/**
 * Kernel wasm instantiation against the P4 exports contract.
 *
 * The contract is a pure allowlist check over `WebAssembly.Module.exports`
 * results, so it is table-testable without a wasm artifact. Exact export
 * names are pinned to the kernel footprint gate's measured table
 * (`kernel/scripts/footprint_gate.py`, REPOP_FUNCS — lane Y1 repair of the
 * X9 census finding); the drift guard in wasm-boot.test.ts asserts
 * equality with that table, fail-closed on drift. Runtime instantiation
 * against the real artifact is UNVERIFIED until the gate's build lands
 * (no `.wasm` present in the repo at lane time).
 */

export interface WasmExportDesc {
  readonly name: string;
  readonly kind: string;
}

/**
 * Pinned kernel export allowlist — authority: `kernel/scripts/footprint_gate.py`
 * (REPOP_FUNCS, lines 24-35, the measured release-build export table).
 * Raw C-ABI on linear memory, no wasm-bindgen hot path. The structural
 * exports `memory` and `__rust_eh_personality` are also lawful on the
 * artifact but are not callable contract functions; they are admitted
 * separately via STRUCTURAL_EXPORTS and are NOT part of this list.
 */
export const KERNEL_EXPORT_ALLOWLIST: readonly string[] = [
  "repop_abi_version",
  "repop_version",
  "repop_scratch_alloc",
  "repop_scratch_reset",
  "repop_scratch_remaining",
  "repop_solve",
  "repop_receipt_emit",
  "repop_cas_commit",
  "repop_cas_read",
];

/** Non-function structural exports present on any rustc wasm artifact. */
export const STRUCTURAL_EXPORTS: readonly string[] = [
  "memory",
  "__rust_eh_personality",
];

export type ContractVerdict =
  | { readonly ok: true }
  | { readonly ok: false; readonly missing: string[]; readonly extra: string[] };

/**
 * Pure contract check over an export descriptor list. Structural exports
 * (`memory`, `__rust_eh_personality`) are lawful but not required — the
 * extras check mirrors footprint_gate.py's STRUCTURAL_EXPORTS exemption.
 */
export function checkExportContract(exports: readonly WasmExportDesc[]): ContractVerdict {
  const required = new Set(KERNEL_EXPORT_ALLOWLIST);
  const structural = new Set(STRUCTURAL_EXPORTS);
  const seen = new Set<string>();
  for (const e of exports) {
    seen.add(e.name);
  }
  const missing: string[] = [];
  for (const name of KERNEL_EXPORT_ALLOWLIST) {
    if (!seen.has(name)) missing.push(name);
  }
  const extra: string[] = [];
  for (const name of seen) {
    if (!required.has(name) && !structural.has(name)) extra.push(name);
  }
  if (missing.length === 0 && extra.length === 0) return { ok: true };
  return { ok: false, missing, extra };
}

export type InstantiateVerdict =
  | { readonly ok: true; readonly instance: WebAssembly.Instance }
  | { readonly ok: false; readonly reason: string };

/**
 * Instantiate the kernel module and enforce the exports contract
 * fail-closed: a module missing a required export (or carrying extras) is
 * refused with a typed reason, never admitted silently.
 */
export async function instantiateKernel(
  bytes: Uint8Array<ArrayBuffer>,
  importObject?: WebAssembly.Imports,
): Promise<InstantiateVerdict> {
  let mod: WebAssembly.Module;
  try {
    mod = await WebAssembly.compile(bytes);
  } catch (err) {
    return { ok: false, reason: "compile-failed: " + String(err) };
  }
  const verdict = checkExportContract(WebAssembly.Module.exports(mod));
  if (!verdict.ok) {
    const parts: string[] = [];
    if (verdict.missing.length > 0) parts.push("missing=" + verdict.missing.join(","));
    if (verdict.extra.length > 0) parts.push("extra=" + verdict.extra.join(","));
    return { ok: false, reason: "export-contract-refused: " + parts.join(" ") };
  }
  try {
    const instance = await WebAssembly.instantiate(mod, importObject);
    return { ok: true, instance };
  } catch (err) {
    return { ok: false, reason: "instantiate-failed: " + String(err) };
  }
}
