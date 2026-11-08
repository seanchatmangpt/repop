// Module-level stable fallback constants.
//
// SELECTOR CONTRACT (binding on all selectors and on store snapshot assembly):
//
// 1. Every selector that would otherwise allocate a fresh empty container
//    MUST return the module-level constant below — never `new Map()`,
//    `new Array()`, or a literal at call time. `useSyncExternalStore` compares
//    snapshots with `Object.is`; a per-call allocation re-renders forever.
// 2. `getSnapshot` MUST return the same object identity until a real state
//    mutation occurs; a mutation MUST produce a new snapshot object (immutable
//    replace, never in-place edit of a previously emitted snapshot).
// 3. `getServerSnapshot` MUST return `SERVER_SNAPSHOT` — a single frozen
//    module constant — so server render and hydration agree on identity.
// 4. Constants are frozen at module load. Nothing may write to them.
//
// (Pattern law: wave-1 R6 / tableFilterStore.ts:9-17 stable-fallback law.)

import type { EntityRecord, RepopSnapshot } from '../types.js';

export const EMPTY_ENTITIES: ReadonlyMap<string, EntityRecord> = new Map();

export const EMPTY_ENTITY_LIST: readonly string[] = [];

export const SERVER_SNAPSHOT: RepopSnapshot = Object.freeze({
  generation: 0,
  entities: EMPTY_ENTITIES,
  entityKeys: EMPTY_ENTITY_LIST,
  kernelReady: false,
});

Object.freeze(EMPTY_ENTITIES);
Object.freeze(EMPTY_ENTITY_LIST);
