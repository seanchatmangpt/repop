/**
 * Kernel wasm instantiation against the P4 exports contract.
 *
 * The contract is a pure allowlist check over `WebAssembly.Module.exports`
 * results, so it is table-testable without a wasm artifact. Exact export
 * names are P4-UNVERIFIED until the allowlist is pinned by the measured
 * artifact; instantiation against the real artifact is UNVERIFIED until C6's
 * build lands (no `.wasm` present in the repo at lane time — checked).
 */

export interface WasmExportDesc {
  readonly name: string;
  readonly kind: string;
}

/**
 * Provisional P4 export allowlist (R10 step 3: raw C-ABI on linear memory,
 * no wasm-bindgen hot path). Pinned names are UNVERIFIED until P4/C6 pin
 * them from the first measured release build.
 */
export const KERNEL_EXPORT_ALLOWLIST: readonly string[] = [
  "repop_abi_version",
  "repop_frame_submit",
  "repop_frame_drain",
  "repop_solver_step",
  "repop_cas_version",
  "repop_receipt_emit",
];

export type ContractVerdict =
  | { readonly ok: true }
  | { readonly ok: false; readonly missing: string[]; readonly extra: string[] };

/** Pure contract check over an export descriptor list. */
export function checkExportContract(exports: readonly WasmExportDesc[]): ContractVerdict {
  const required = new Set(KERNEL_EXPORT_ALLOWLIST);
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
    if (!required.has(name)) extra.push(name);
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
