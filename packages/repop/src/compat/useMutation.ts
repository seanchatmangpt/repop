/**
 * compat/useMutation: react-query-shaped mutation result. The mutationFn is
 * expected to write through the repop client (commitIntent); subscribed
 * useQuery hooks rerender from the store. No third-party query library.
 */

import { useCallback, useRef, useState } from "react";

export interface UseMutationOptions<TData, TVars> {
  mutationFn: (vars: TVars) => Promise<TData> | TData;
  onSuccess?: (data: TData, vars: TVars) => unknown;
  onError?: (error: unknown, vars: TVars) => unknown;
  onSettled?: (data: TData | undefined, error: unknown, vars: TVars) => unknown;
}

export type MutationStatus = "idle" | "pending" | "error" | "success";

export interface UseMutationResult<TData, TVars> {
  data: TData | undefined;
  error: unknown;
  status: MutationStatus;
  isIdle: boolean;
  isPending: boolean;
  isLoading: boolean;
  isError: boolean;
  isSuccess: boolean;
  mutate: (vars: TVars) => void;
  mutateAsync: (vars: TVars) => Promise<TData>;
  reset: () => void;
}

interface State<TData> {
  data: TData | undefined;
  error: unknown;
  status: MutationStatus;
}

export function useMutation<TData = unknown, TVars = void>(
  options: UseMutationOptions<TData, TVars>,
): UseMutationResult<TData, TVars> {
  const optRef = useRef(options);
  optRef.current = options;
  const [state, setState] = useState<State<TData>>({
    data: undefined,
    error: null,
    status: "idle",
  });

  const mutateAsync = useCallback(async (vars: TVars): Promise<TData> => {
    setState({ data: undefined, error: null, status: "pending" });
    try {
      const data = await optRef.current.mutationFn(vars);
      setState({ data, error: null, status: "success" });
      await optRef.current.onSuccess?.(data, vars);
      await optRef.current.onSettled?.(data, null, vars);
      return data;
    } catch (error) {
      setState({ data: undefined, error, status: "error" });
      await optRef.current.onError?.(error, vars);
      await optRef.current.onSettled?.(undefined, error, vars);
      throw error;
    }
  }, []);

  const mutate = useCallback(
    (vars: TVars): void => {
      mutateAsync(vars).catch(() => {
        /* error is surfaced via state.error / onError */
      });
    },
    [mutateAsync],
  );

  const reset = useCallback((): void => {
    setState({ data: undefined, error: null, status: "idle" });
  }, []);

  return {
    data: state.data,
    error: state.error,
    status: state.status,
    isIdle: state.status === "idle",
    isPending: state.status === "pending",
    isLoading: state.status === "pending",
    isError: state.status === "error",
    isSuccess: state.status === "success",
    mutate,
    mutateAsync,
    reset,
  };
}
