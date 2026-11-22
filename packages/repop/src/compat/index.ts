/**
 * FFB compat barrel — identity is `repop/compat` only.
 * See docs/FFB-IDENTITY-FORK.md. No React host package (explicit-no).
 */

export { useQuery, queryEntityId } from "./useQuery.js";
export type { UseQueryOptions, UseQueryResult, QueryKey, QueryStatus } from "./useQuery.js";

export { useMutation } from "./useMutation.js";
export type {
  UseMutationOptions,
  UseMutationResult,
  MutationStatus,
} from "./useMutation.js";

export { useSWR, mutate, serializeKey, swrEntityId } from "./useSWR.js";
export type { SWRKey, Fetcher, SWRResponse, SWRConfiguration } from "./useSWR.js";

export { gql, graphqlEntityId, useGraphQL, useGraphQLMutation } from "./graphql.js";
export type { GraphQLResult } from "./graphql.js";

export { useTable } from "./table.js";
export type { ColumnDef, TableRow, SortingState, UseTableResult } from "./table.js";

export { createStore, create, useRepopSlice } from "./store.js";
export type {
  SetState,
  GetState,
  Subscribe,
  StoreApi,
  StateCreator,
  UseBoundStore,
} from "./store.js";

export { createDbClient, useDbClient, useDbRow } from "./dbClient.js";
export type { DbRow, DbClient } from "./dbClient.js";
