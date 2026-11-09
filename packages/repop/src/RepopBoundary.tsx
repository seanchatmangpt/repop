/**
 * RepopBoundary — per-entity typed refusal containment.
 *
 * P13 laws implemented:
 * 1. Per-entity Map<pid, ContainedRefusal> registry (shared via
 *    RepopBoundaryRoot); each boundary swaps ONLY its own subtree.
 * 2. STALE_VERSION inline-first: inline containment UI while the number of
 *    distinct stale seqs <= maxStaleRetries, then fallback promotion.
 * 3. KERNEL_UNREADY auto-recover: transparent containment — the boundary
 *    renders children (recovery belongs to useActor's readiness observer).
 * 4. UNKNOWN_FRAME (+ every containment:"fallback" cause) fail-closed
 *    subtree swap — never a silent pass-through.
 * 5. Real throws are caught by a wrapped class ErrorBoundary and swap the
 *    same subtree to the fallback.
 */

import {
  Component,
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { CAUSE_CONTAINMENT, type ContainedRefusal, containRefusal } from "./client-seam.js";

export interface BoundaryRegistryEntry {
  readonly refusal: ContainedRefusal;
  readonly promoted: boolean;
}

export type BoundaryRegistry = ReadonlyMap<string, BoundaryRegistryEntry>;

interface RegistryStore {
  readonly map: Map<string, BoundaryRegistryEntry>;
  readonly listeners: Set<() => void>;
  version: number;
}

function createRegistryStore(): RegistryStore {
  return { map: new Map(), listeners: new Set(), version: 0 };
}

const RegistryContext = createContext<RegistryStore | undefined>(undefined);
RegistryContext.displayName = "RepopBoundaryRegistry";

export function RepopBoundaryRoot({ children }: { children?: ReactNode }): ReactNode {
  const store = useMemo(createRegistryStore, []);
  return <RegistryContext.Provider value={store}>{children}</RegistryContext.Provider>;
}

export function useBoundaryRegistry(): BoundaryRegistry {
  const store = useContext(RegistryContext);
  useSyncExternalStore(
    useCallback(
      (onChange: () => void) => {
        if (store === undefined) return () => undefined;
        store.listeners.add(onChange);
        return () => store.listeners.delete(onChange);
      },
      [store],
    ),
    useCallback(() => (store === undefined ? 0 : store.version), [store]),
  );
  return store === undefined ? new Map() : store.map;
}

const RefuseContext = createContext<((raw: unknown) => void) | undefined>(undefined);
RefuseContext.displayName = "RepopBoundaryRefuse";

/**
 * Deliver a raw refusal to the nearest enclosing RepopBoundary. Fail-closed:
 * with no boundary above, this throws rather than dropping silently.
 */
export function useBoundaryRefuse(): (raw: unknown) => void {
  const refuse = useContext(RefuseContext);
  if (refuse === undefined) {
    throw new Error("useBoundaryRefuse outside RepopBoundary (fail-closed)");
  }
  return refuse;
}

export interface RepopBoundaryProps {
  /** Entity pid this boundary contains. */
  pid: string;
  /** Fallback subtree swapped in on fail-closed containment. */
  fallback: ReactNode;
  /** Inline containment UI for STALE_VERSION (pre-promotion); retry clears. */
  inline?: (refusal: ContainedRefusal, retry: () => void) => ReactNode;
  /** Distinct stale seqs tolerated inline before fallback promotion (default 2). */
  maxStaleRetries?: number;
  children?: ReactNode;
}

interface BoundaryState {
  refusal: ContainedRefusal | null;
  staleSeqs: readonly number[];
}

class CrashBoundary extends Component<
  { children: ReactNode; onCrash: (e: unknown) => void; fallback: ReactNode },
  { crashed: boolean }
> {
  state = { crashed: false };
  static getDerivedStateFromError() {
    return { crashed: true };
  }
  componentDidCatch(e: unknown): void {
    this.props.onCrash(e);
  }
  render() {
    return this.state.crashed ? this.props.fallback : this.props.children;
  }
}

export function RepopBoundary(props: RepopBoundaryProps): ReactNode {
  const { pid, fallback, inline, maxStaleRetries = 2, children } = props;
  const store = useContext(RegistryContext);
  const [entry, setEntry] = useState<BoundaryState>({ refusal: null, staleSeqs: [] });

  const refuse = useMemo(
    () =>
      (raw: unknown): ContainedRefusal => {
        const contained = containRefusal(raw, pid);
        setEntry((prev) => ({
          refusal: contained,
          staleSeqs:
            contained.cause === "STALE_VERSION" && !prev.staleSeqs.includes(contained.seq)
              ? [...prev.staleSeqs, contained.seq]
              : prev.staleSeqs,
        }));
        if (store !== undefined) {
          store.map.set(pid, {
            refusal: contained,
            promoted: CAUSE_CONTAINMENT[contained.cause] === "fallback",
          });
          store.version += 1;
          for (const l of store.listeners) l();
        }
        return contained;
      },
    [pid, store],
  );

  const clear = useMemo(
    () => (): void => {
      if (store !== undefined) {
        store.map.delete(pid);
        store.version += 1;
        for (const l of store.listeners) l();
      }
      // Retry clears the refusal but PRESERVES the distinct-seq count:
      // retries accumulate toward maxStaleRetries -> fallback promotion.
      setEntry((prev) => ({ refusal: null, staleSeqs: prev.staleSeqs }));
    },
    [pid, store],
  );

  const crashHandler = useMemo(
    () => (): void => {
      refuse({ kind: "BreachError", message: "boundary caught a real throw" });
    },
    [refuse],
  );

  const refusal = entry.refusal;
  const causeClass = refusal === null ? undefined : CAUSE_CONTAINMENT[refusal.cause];
  const promoted =
    refusal !== null &&
    refusal.cause === "STALE_VERSION" &&
    entry.staleSeqs.length > maxStaleRetries;

  const render = (child: ReactNode): ReactNode => (
    <RefuseContext.Provider value={refuse}>
      <CrashBoundary onCrash={crashHandler} fallback={fallback}>
        {child}
      </CrashBoundary>
    </RefuseContext.Provider>
  );

  if (refusal !== null && causeClass === "fallback") {
    return render(fallback);
  }
  if (promoted) {
    return render(fallback);
  }
  if (refusal !== null && causeClass === "inline" && refusal.cause !== "KERNEL_UNREADY") {
    return render(inline === undefined ? fallback : inline(refusal, clear));
  }
  return render(children);
}
