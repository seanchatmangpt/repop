/**
 * RepopProvider — lazy-boot worker lifecycle owner.
 *
 * Laws implemented (P11 decisions):
 * 1. Lazy boot in an effect, never during render/SSR. Idempotent via the
 *    client's own bootstrap promise-map.
 * 2. DI injection seam (`client` / `createClient?`): hosts and tests inject
 *    a real in-process client. Default = module singleton.
 * 3. SSR: placeholder client whose getSnapshot is the stable EMPTY constant
 *    (types.ts) — never touches navigator/SharedArrayBuffer; stable identity
 *    across hydration. Typed refusal on commit/solve attempts.
 * 4. Cleanup only when self-created: an injected/external client is NEVER
 *    disposed here — the owner disposes. The self-created singleton
 *    refcounts providers and disposes on the last unmount.
 * 6. Stable context value: identity changes only on (client, bootState)
 *    transitions — no new literals per render (useMemo).
 */

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { RepopContext } from "./context.js";
import { EMPTY, type RepopClient } from "./types.js";

/** Value carried by RepopContext; stable identity across renders. */
export interface RepopContextValue {
  /** The client active this render (SSR placeholder until boot). */
  readonly client: RepopClient;
  /** Boot state of the active client. */
  readonly bootState: "idle" | "booting" | "ready" | "refused";
}

export interface RepopProviderProps {
  /** Inject a pre-built client (tests/hosts). Never disposed by this provider. */
  client?: RepopClient;
  /** Factory seam used when `client` is absent. If omitted, module singleton. */
  createClient?(): RepopClient;
  children?: ReactNode;
}

function createPlaceholderClient(detail: string): RepopClient {
  return {
    subscribe: () => () => undefined,
    getSnapshot: () => EMPTY,
    bootstrap: () => Promise.resolve(),
    commitIntent: async () => ({
      ok: false as const,
      refusal: { class: "WORKER_REFUSED" as const, detail },
    }),
    solve: async () => ({
      ok: false as const,
      refusal: { class: "WORKER_REFUSED" as const, detail },
    }),
  };
}

let singletonClient: RepopClient | undefined;
let singletonCount = 0;

function acquireSingleton(createClient?: () => RepopClient): RepopClient {
  if (singletonClient === undefined) {
    singletonClient = createClient
      ? createClient()
      : createPlaceholderClient(
          "repop default singleton: no client implementation provided",
        );
  }
  singletonCount += 1;
  return singletonClient;
}

function releaseSingleton(client: RepopClient): void {
  singletonCount -= 1;
  if (singletonCount <= 0) {
    singletonCount = 0;
    client.dispose?.();
    singletonClient = undefined;
  }
}

export function RepopProvider(props: RepopProviderProps): ReactNode {
  const { client, createClient, children } = props;

  const [active, setActive] = useState<RepopClient | undefined>(() => client);
  const [bootState, setBootState] = useState<"idle" | "booting" | "ready" | "refused">(
    "idle",
  );
  const bootPromiseRef = useRef<Promise<void> | undefined>(undefined);

  useEffect(() => {
    let acquired: RepopClient | undefined;
    if (client !== undefined) {
      setActive(client);
    } else {
      acquired = acquireSingleton(createClient);
      setActive(acquired);
    }
    return () => {
      if (acquired !== undefined) {
        releaseSingleton(acquired);
      }
    };
  }, [client, createClient]);

  // Lazy boot: fires once per active client, in an effect, never in render.
  const ensureBooted = useCallback((): Promise<void> => {
    if (active === undefined) return Promise.resolve();
    if (bootPromiseRef.current === undefined) {
      setBootState("booting");
      bootPromiseRef.current = active.bootstrap().then(
        () => setBootState("ready"),
        () => setBootState("refused"),
      );
    }
    return bootPromiseRef.current;
  }, [active]);

  useEffect(() => {
    void ensureBooted();
  }, [ensureBooted]);

  const contextValue = useMemo<RepopContextValue>(
    () => ({
      client: active ?? createPlaceholderClient("repop: booting"),
      bootState,
    }),
    [active, bootState],
  );

  return (
    <RepopContext.Provider value={contextValue}>{children}</RepopContext.Provider>
  );
}
