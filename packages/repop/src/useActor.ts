/**
 * useActor — discriminated-union actor state machine over the client seam.
 *
 * P13 laws implemented:
 * 1. Always-resolving send: the send promise is contained by .then(onOk,
 *    onErr) — no path can produce an unhandledrejection.
 * 2. pid switch resets to the IDLE_ACTOR_STATE constant (stable identity).
 * 3. KERNEL_UNREADY auto-recover: an unready refusal arms a readiness
 *    observer (seam.subscribe — no sleeps) that re-dispatches when the
 *    kernel becomes ready, bounded by maxAutoRecovers (default 3).
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type { RepopClient, RepopIntent } from "./types.js";
import {
  containRefusal,
  createClientSeam,
  type ContainedRefusal,
  type RepopClientSeam,
} from "./client-seam.js";

export type ActorStatus = "idle" | "pending" | "committed" | "refused";

export interface ActorStateBase {
  readonly status: ActorStatus;
  /** The entity pid this state belongs to. */
  readonly pid: string | null;
}

export const IDLE_ACTOR_STATE: ActorStateBase & { status: "idle" } = Object.freeze({
  status: "idle",
  pid: null,
});

export type ActorState =
  | typeof IDLE_ACTOR_STATE
  | (ActorStateBase & {
      readonly status: "pending";
    })
  | (ActorStateBase & {
      readonly status: "committed";
      readonly newVersion: number;
    })
 | (ActorStateBase & {
      readonly status: "refused";
      readonly refusal: ContainedRefusal;
    });

export interface UseActorOptions {
  /** Max KERNEL_UNREADY auto-recoveries per in-flight send (default 3). */
  readonly maxAutoRecovers?: number;
  /** Seam injection for tests (defaults to createClientSeam(client)). */
  readonly seam?: RepopClientSeam;
}

export interface UseActorResult {
  readonly state: ActorState;
  /** Always resolves; never rejects. Returns the contained outcome. */
  send(
    pid: string,
    intent: RepopIntent,
    expectedVersion: number,
  ): Promise<
    | { ok: true; newVersion: number }
    | { ok: false; refusal: ContainedRefusal }
  >;
  /** Force state back to IDLE_ACTOR_STATE. */
  reset(): void;
}

export function useActor(
  client: RepopClient | undefined,
  options: UseActorOptions = {},
): UseActorResult {
  const seam = options.seam ?? createClientSeam(client);
  const maxAuto = options.maxAutoRecovers ?? 3;

  const [state, setState] = useState<ActorState>(IDLE_ACTOR_STATE);
  const stateRef = useRef<ActorState>(IDLE_ACTOR_STATE);
  const autoRecoversRef = useRef(0);
  const armedRef = useRef(false);

  const apply = useCallback((next: ActorState) => {
    stateRef.current = next;
    setState(next);
  }, []);

  const runSend = useCallback(
    (pid: string, intent: RepopIntent, expectedVersion: number, isAutoRecover: boolean): Promise<
      | { ok: true; newVersion: number }
      | { ok: false; refusal: ContainedRefusal }
    > => {
      return new Promise((resolvePromise) => {
        const begin = (): void => {
          if (stateRef.current.pid !== null && stateRef.current.pid !== pid) {
            apply(IDLE_ACTOR_STATE);
          }
          autoRecoversRef.current = isAutoRecover ? autoRecoversRef.current : 0;
          apply({ status: "pending", pid });
          void seam.send(pid, intent, expectedVersion).then(
            (outcome) => {
              if (outcome.ok) {
                apply({ status: "committed", pid, newVersion: outcome.newVersion });
                resolvePromise(outcome);
                return;
              }
              const refusal = outcome.refusal;
              if (refusal.cause === "KERNEL_UNREADY" && refusal.retryable && autoRecoversRef.current < maxAuto) {
                autoRecoversRef.current += 1;
                apply({ status: "refused", pid, refusal });
                armAutoRecover();
                resolvePromise(outcome);
                return;
              }
              apply({ status: "refused", pid, refusal });
              resolvePromise(outcome);
            },
            (err: unknown) => {
              // Rejection containment: any throw from the seam resolves here.
              const refusal = containRefusal(
                { kind: err instanceof Error ? err.name : "", message: String(err) },
                pid,
              );
              apply({ status: "refused", pid, refusal });
              resolvePromise({ ok: false, refusal });
            },
          );
        };
        begin();
      });
    },
    [apply, seam, maxAuto],
  );

  const armAutoRecover = useCallback((): void => {
    if (armedRef.current) return;
    armedRef.current = true;
    const unsubscribe = seam.subscribe(() => {
      if (!seam.isReady()) return;
      armedRef.current = false;
      unsubscribe();
      const pending = stateRef.current;
      if (pending.status === "refused" || pending.status === "pending") {
        // Re-dispatch the last intent (same expectedVersion).
        const last = lastIntentRef.current;
        if (last !== undefined) {
          void runSend(last.pid, last.intent, last.expectedVersion, true);
        }
      }
    });
  }, [seam, runSend]);

  const lastIntentRef = useRef<
    | { pid: string; intent: RepopIntent; expectedVersion: number }
    | undefined
  >(undefined);

  const send = useCallback(
    (pid: string, intent: RepopIntent, expectedVersion: number) => {
      lastIntentRef.current = { pid, intent, expectedVersion };
      return runSend(pid, intent, expectedVersion, false);
    },
    [runSend],
  );

  const reset = useCallback((): void => {
    apply(IDLE_ACTOR_STATE);
    autoRecoversRef.current = 0;
    armedRef.current = false;
  }, [apply]);

  useEffect(() => () => {
    // Cleanup arms the unsubscribe path via reset on unmount.
    armedRef.current = false;
  }, []);

  return { state, send, reset };
}
