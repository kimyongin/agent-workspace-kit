import type { Market } from "../domain/orders.js";

export type Fetch = typeof globalThis.fetch;

export interface RequestScope {
  readonly market: Market;
  readonly connectionId: string;
  readonly operation: string;
  /** Provider-defined sharing scope; these are coordination hints, not locks. */
  readonly buckets: readonly string[];
}

export interface ClientDependencies {
  readonly fetch?: Fetch;
  readonly now?: () => Date;
  readonly beforeRequest?: (
    scope: RequestScope,
    signal?: AbortSignal,
  ) => Promise<void>;
  readonly timeoutMs?: number;
}
