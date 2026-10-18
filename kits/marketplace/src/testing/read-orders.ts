import { MarketplaceError } from "../domain/errors.js";
import type { MarketplaceErrorCode } from "../domain/errors.js";
import type { Market, OrderPage } from "../domain/orders.js";
import { assertOrderPage } from "../domain/validation.js";
import { checkFixture, copyFixture } from "./validation.js";
import type {
  ReadOrdersQuery,
  ReadOrdersUseCase,
} from "../application/contracts.js";

export interface MockReadOrdersError {
  readonly code: MarketplaceErrorCode;
  readonly status?: number;
  readonly retryAfterSeconds?: number;
}

type MockRequest = Pick<ReadOrdersQuery, "from" | "to" | "cursor">;
export type MockReadOrdersScenario =
  & { readonly request: MockRequest }
  & (
    | { readonly result: OrderPage; readonly error?: never }
    | { readonly error: MockReadOrdersError; readonly result?: never }
  );

export interface MockReadOrdersOptions {
  readonly market: Market;
  readonly scenarios: readonly MockReadOrdersScenario[];
}

const errorCodes = {
  configuration: true,
  invalidInput: true,
  invalidCursor: true,
  authentication: true,
  permissionDenied: true,
  rateLimited: true,
  transport: true,
  cancelled: true,
  invalidResponse: true,
  providerRejected: true,
} satisfies Record<MarketplaceErrorCode, true>;

function configuration(message: string): never {
  throw new MarketplaceError("configuration", message);
}

function key(request: MockRequest): string {
  if (
    !request || typeof request.from !== "string" ||
    typeof request.to !== "string" ||
    (request.cursor !== undefined && typeof request.cursor !== "string")
  ) {
    throw new MarketplaceError(
      "invalidInput",
      "A mock request requires string timestamps and an optional string cursor.",
    );
  }
  return JSON.stringify([request.from, request.to, request.cursor ?? null]);
}

/** Replace the public input port, not the internal source or the real use case. */
export function createMockReadOrders(
  options: MockReadOrdersOptions,
): ReadOrdersUseCase {
  const snapshot = copyFixture(options, "scenarios");
  if (
    !snapshot || !["coupang", "naver"].includes(snapshot.market) ||
    !Array.isArray(snapshot.scenarios)
  ) configuration("A mock market and scenarios are required.");
  const scenarios = new Map<string, MockReadOrdersScenario>();
  for (const [index, scenario] of snapshot.scenarios.entries()) {
    let requestKey: string;
    try {
      requestKey = key(scenario.request);
    } catch {
      configuration("A mock scenario requires a valid request.");
    }
    if (scenarios.has(requestKey)) {
      configuration("Mock scenarios must have unique requests.");
    }
    if (
      Object.hasOwn(scenario, "result") === Object.hasOwn(scenario, "error")
    ) {
      configuration("A mock scenario requires exactly one result or error.");
    }
    if (scenario.result !== undefined) {
      checkFixture(() =>
        assertOrderPage(scenario.result, `scenarios[${index}].result`, {
          market: snapshot.market,
          request: scenario.request,
        })
      );
    } else {
      const error = scenario.error;
      if (
        !error || !Object.hasOwn(errorCodes, error.code) ||
        (error.status !== undefined &&
          (!Number.isInteger(error.status) || error.status < 100 ||
            error.status > 599)) ||
        (error.retryAfterSeconds !== undefined &&
          (!Number.isSafeInteger(error.retryAfterSeconds) ||
            error.retryAfterSeconds < 0))
      ) configuration("A mock error requires a known code and valid metadata.");
    }
    scenarios.set(requestKey, scenario);
  }
  return {
    market: snapshot.market,
    async execute(request) {
      if (request?.signal?.aborted) {
        throw new MarketplaceError("cancelled", "The read was cancelled.");
      }
      const scenario = scenarios.get(key(request));
      if (!scenario) configuration("No mock scenario matches this request.");
      if (scenario.result !== undefined) {
        return structuredClone(scenario.result);
      }
      const error = scenario.error!;
      throw new MarketplaceError(
        error.code,
        "The configured mock read failed.",
        {
          ...(error.status !== undefined ? { status: error.status } : {}),
          ...(error.retryAfterSeconds !== undefined
            ? { retryAfterSeconds: error.retryAfterSeconds }
            : {}),
        },
      );
    },
  };
}
