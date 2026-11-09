/**
 * coi-sw registration + ONE-SHOT reload with sessionStorage loop guard.
 *
 * Bug class NOT ported (P7 plan, wave-1 R5/E20): atomvm's
 * `service-worker-manager.mjs` `waitForCOI` reloads whenever the service
 * worker controls the page but COI is not yet active — with no guard, an
 * environment where COI can never activate produces an infinite reload
 * storm. Here the reload fires at most ONCE per session (guard key in
 * sessionStorage, which survives reload); on second entry the guard
 * short-circuits to fallback.
 */

export const RELOAD_GUARD_KEY = "repop.coi.reload-spent";

export interface ReloadGuardStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/** In-memory guard store (non-browser / tests). Real degraded collaborator. */
export function memoryGuardStore(): ReloadGuardStore {
  const m = new Map<string, string>();
  return {
    getItem: (k) => m.get(k) ?? null,
    setItem: (k, v) => void m.set(k, v),
  };
}

export function sessionStorageGuardStore(): ReloadGuardStore {
  // Lazy: sessionStorage throws in some privacy modes; fall back to memory.
  try {
    const s = globalThis.sessionStorage;
    if (s) return s;
  } catch {
    /* privacy mode */
  }
  return memoryGuardStore();
}

export function reloadGuardSpent(store: ReloadGuardStore): boolean {
  return store.getItem(RELOAD_GUARD_KEY) !== null;
}

export function markReloadSpent(store: ReloadGuardStore): void {
  store.setItem(RELOAD_GUARD_KEY, String(Date.now()));
}

/**
 * One-shot guarded reload: marks the guard, then reloads exactly once per
 * session. If the guard is already spent, refuses with a typed reason
 * instead of reloading (the anti-reload-storm law).
 */
export function guardedReload(store: ReloadGuardStore, reload: () => void): void {
  if (reloadGuardSpent(store)) return; // guard: no second reload, ever
  markReloadSpent(store);
  reload();
}
