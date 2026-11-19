/**
 * compat/graphql: @fnox/graphql shim. Read-only: a query document plus
 * variables resolves to an entity slice in the repop projection store
 * (entity id graphqlEntityId). No network, no mutation, no third-party client.
 */

import { useRepopSelector } from "../useRepopSelector.js";

export interface GraphQLResult<T> {
  data: T | undefined;
  error: unknown;
  loading: boolean;
  version: number | undefined;
}

/** gql tag: returns the document text, whitespace-normalised. */
export function gql(strings: TemplateStringsArray, ...values: unknown[]): string {
  let out = strings[0] ?? "";
  for (let i = 0; i < values.length; i++) out += String(values[i]) + (strings[i + 1] ?? "");
  return out.replace(/\s+/g, " ").trim();
}

/** Deterministic entity id for (document, variables). */
export function graphqlEntityId(
  document: string,
  variables?: Record<string, unknown>,
): string {
  const norm = document.replace(/\s+/g, " ").trim();
  return "gql:" + norm + ":" + JSON.stringify(variables ?? {});
}

/** Read-only query hook over the real projection store. */
export function useGraphQL<T = unknown>(
  document: string,
  variables?: Record<string, unknown>,
): GraphQLResult<T> {
  const id = graphqlEntityId(document, variables);
  const slice = useRepopSelector((s) => s.entities.get(id));
  if (slice === undefined) {
    return { data: undefined, error: null, loading: true, version: undefined };
  }
  const error = slice.lastRefusal ?? null;
  return {
    data: slice.data === null || slice.data === undefined ? undefined : (slice.data as T),
    error,
    loading: false,
    version: slice.version,
  };
}

/** Mutations are refused: the projection client is read-only. */
export function useGraphQLMutation(): never {
  throw new Error("@fnox/graphql: read-only shim, mutations are refused");
}
