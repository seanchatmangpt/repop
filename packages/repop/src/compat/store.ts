/**
 * compat/store: zustand-style create() drop-in plus a repop-slice selector.
 * Not a wrapper over zustand.
 *
 * - create(initializer) returns a hook `useStore(selector?, equalityFn?)` with
 *   getState/setState/subscribe attached. A component re-renders only when its
 *   selected value changes (Object.is, or the supplied equalityFn).
 * - useRepopSlice(entityId, selector) selects over the real repop client's
 *   entity slice, so a component re-renders only when its selected value
 *   changes, not on unrelated entity updates.
 */

import { useRef, useSyncExternalStore } from "react";
import { useRepopSelector } from "../useRepopSelector.js";

export type SetState<S> = (
  partial: Partial<S> | ((state: S) => Partial<S>),
  replace?: boolean,
) => void;
export type GetState<S> = () => S;
export type Subscribe<S> = (listener: (state: S, prev: S) => void) => () => void;

export interface StoreApi<S> {
  getState: GetState<S>;
  getInitialState: GetState<S>;
  setState: SetState<S>;
  subscribe: Subscribe<S>;
}

export type StateCreator<S> = (
  set: SetState<S>,
  get: GetState<S>,
  api: StoreApi<S>,
) => S;

export type UseBoundStore<S> = {
  (): S;
  <U>(selector: (state: S) => U, equalityFn?: (a: U, b: U) => boolean): U;
} & StoreApi<S>;

/** Vanilla store. */
export function createStore<S>(initializer: StateCreator<S>): StoreApi<S> {
  let state: S;
  const listeners = new Set<(s: S, p: S) => void>();

  const setState: SetState<S> = (partial, replace) => {
    const next =
      typeof partial === "function"
        ? (partial as (s: S) => Partial<S>)(state)
        : partial;
    if (Object.is(next, state)) return;
    const prev = state;
    state =
      replace === true ? (next as S) : Object.assign({}, state, next);
    for (const l of [...listeners]) l(state, prev);
  };
  const getState: GetState<S> = () => state;
  const subscribe: Subscribe<S> = (listener) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  };
  const api: StoreApi<S> = {
    getState,
    getInitialState: () => initial,
    setState,
    subscribe,
  };
  const initial = (state = initializer(setState, getState, api));
  return api;
}

/** zustand-style: create<State>()((set, get) => ({...})) or create((set) => ...). */
export function create<S>(initializer: StateCreator<S>): UseBoundStore<S>;
export function create<S>(): (initializer: StateCreator<S>) => UseBoundStore<S>;
export function create<S>(
  initializer?: StateCreator<S>,
): UseBoundStore<S> | ((i: StateCreator<S>) => UseBoundStore<S>) {
  if (initializer === undefined) return (i: StateCreator<S>) => build(i);
  return build(initializer);
}

function build<S>(initializer: StateCreator<S>): UseBoundStore<S> {
  const api = createStore<S>(initializer);

  function useBound<U>(
    selector?: (state: S) => U,
    equalityFn?: (a: U, b: U) => boolean,
  ): U | S {
    const sel = (selector ?? ((s: S) => s as unknown as U)) as (s: S) => U;
    const last = useRef<{ v: U } | undefined>(undefined);
    const read = (): U => {
      const next = sel(api.getState());
      if (
        last.current !== undefined &&
        (equalityFn !== undefined
          ? equalityFn(last.current.v, next)
          : Object.is(last.current.v, next))
      ) {
        return last.current.v;
      }
      last.current = { v: next };
      return next;
    };
    return useSyncExternalStore(
      (cb) => api.subscribe(() => cb()),
      read,
      () => sel(api.getInitialState()),
    );
  }
  return Object.assign(useBound, api) as unknown as UseBoundStore<S>;
}

/**
 * Select over the repop entity slice data for entityId. Re-renders only when
 * the selected value changes (Object.is).
 */
export function useRepopSlice<D, U>(
  entityId: string,
  selector: (data: D | undefined) => U,
): U {
  const sel = useRef(selector);
  sel.current = selector;
  return useRepopSelector((snap) => {
    const slice = snap.entities.get(entityId);
    return sel.current(slice === undefined ? undefined : (slice.data as D));
  });
}
