import { type Paginated } from "@raven/backend-ts/types";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  firstErrorMessage,
  safe,
  type AnyClientResponse,
  type OkData,
} from "~/api/api-error";

type AnyEndpoint = {
  $get: (...args: never[]) => Promise<AnyClientResponse>;
};

type GetArgs<E extends AnyEndpoint> = NonNullable<Parameters<E["$get"]>[0]>;

type QueryOf<E extends AnyEndpoint> =
  GetArgs<E> extends { query?: infer Q }
    ? NonNullable<Q>
    : Record<never, never>;

export type PageData<E extends AnyEndpoint> = OkData<
  Awaited<ReturnType<E["$get"]>>
>;

export type PaginatedArgs<E extends AnyEndpoint> = Omit<GetArgs<E>, "query"> & {
  query?: Omit<QueryOf<E>, "page" | "perPage">;
};

/** The concrete call shape the hook uses once page and perPage are merged in. */
type PagedGet = (
  args: unknown,
  options: { init: RequestInit }
) => Promise<AnyClientResponse>;

/** Resolves to `unknown` (no-op) for valid endpoints, and to an impossible type otherwise. */
type AssertPaginated<E extends AnyEndpoint> =
  "page" | "perPage" extends keyof QueryOf<E>
  ? PageData<E> extends Paginated<unknown>
    ? unknown
    : { __error: "endpoint's 2xx response is not Paginated" }
  : { __error: "endpoint's query does not accept page and perPage" };

export function usePaginatedData<E extends AnyEndpoint>(
  endpoint: E & AssertPaginated<E>,
  args: PaginatedArgs<E>,
  perPage: number,
  initial: PageData<E>
) {
  const [page, setPage] = useState(1);
  const [nonce, setNonce] = useState(0);
  const [data, setData] = useState(initial);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Hono client paths are proxies rebuilt on every render, so their identity
  // can't be a dependency. Keep the latest one in a ref, updated before the fetch effect runs.
  const endpointRef = useRef(endpoint);
  const argsRef = useRef(args);
  useEffect(() => {
    endpointRef.current = endpoint;
    argsRef.current = args;
  });

  // Args are plain params and filters, so a serialized key works as their identity.
  const argsKey = JSON.stringify(args);
  // Which request `data` currently reflects. `initial` is page 1 of these args.
  const loadedFor = useRef(`1:${perPage}:0:${argsKey}`);

  useEffect(() => {
    const key = `${page}:${perPage}:${nonce}:${argsKey}`;
    if (key === loadedFor.current) {
      setLoading(false);
      setError(null);
      return;
    }

    const controller = new AbortController();
    setLoading(true);
    setError(null);

    const extra = argsRef.current;
    // The single assertion: the generic endpoint called with its own args plus page/perPage.
    const get = endpointRef.current.$get as PagedGet;

    void safe(
      get(
        { ...extra, query: { ...extra.query, page, perPage } },
        { init: { signal: controller.signal } }
      )
    ).then((r) => {
      if (controller.signal.aborted) return;
      if (r.ok) {
        setData(r.data as PageData<E>);
        loadedFor.current = key;
      } else {
        setError(
          firstErrorMessage(r.error, "Failed to load. Please try again.")
        );
      }
      setLoading(false);
    });

    return () => controller.abort();
  }, [page, perPage, nonce, argsKey]);

  const refetch = useCallback(() => setNonce((n) => n + 1), []);

  return { data, page, setPage, loading, error, refetch };
}
