export { RepopProvider, type RepopContextValue, type RepopProviderProps } from "./RepopProvider.js";
export { RepopContext } from "./context.js";
export {
  useRepopClient,
  RepopProviderMissingError,
} from "./useRepopClient.js";
export { useRepopSelector, type RepopSelectorOptions } from "./useRepopSelector.js";
export {
  useCgapEntity,
  type UseCgapEntityResult,
  type RepopCommitResult,
  type RepopCommitRefused,
} from "./hooks/useCgapEntity.js";
export { useHyperplane, type UseHyperplaneResult } from "./hooks/useHyperplane.js";
export {
  EMPTY,
  type RepopClient,
  type RepopEntitySlice,
  type RepopIntent,
  type RepopSnapshot,
  type RepopSolveRequest,
  type RepopSolveResult,
} from "./types.js";
export {
  type RepopRefusal,
  STABLE_NULL,
  STABLE_PROJECTIONS,
} from "./errors.js";
