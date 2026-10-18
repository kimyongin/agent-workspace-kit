import { MarketplaceError } from "../domain/errors.js";
import type { MarketplaceErrorCode } from "../domain/errors.js";
import type { Market, OrderPage } from "../domain/orders.js";
import { assertMarket, assertOrderPage } from "../domain/validation.js";
import { checkFixture, copyFixture, MockFixtureError } from "./validation.js";
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

function configuration(path: string, message: string): never {
  throw new MockFixtureError(path, message);
}

function key(request: MockRequest, path?: string): string {
  const invalid = (field: string): never => {
    if (path !== undefined) {
      configuration(
        path + field,
        "Expected string timestamps and an optional string cursor.",
      );
    }
    throw new MarketplaceError(
      "invalidInput",
      "A mock request requires string timestamps and an optional string cursor.",
    );
  };
  if (!request || typeof request !== "object" || Array.isArray(request)) {
    invalid("");
  }
  if (typeof request.from !== "string") invalid(".from");
  if (typeof request.to !== "string") invalid(".to");
  if (request.cursor !== undefined && typeof request.cursor !== "string") {
    invalid(".cursor");
  }
  return JSON.stringify([request.from, request.to, request.cursor ?? null]);
}

/** Replace the public input port, not the internal source or the real use case. */
export function createMockReadOrders(
  options: MockReadOrdersOptions,
): ReadOrdersUseCase {
  const snapshot = copyFixture(options, "mock");
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) {
    configuration("mock", "Expected mock options.");
  }
  checkFixture(() => assertMarket(snapshot.market, "market"));
  if (!Array.isArray(snapshot.scenarios)) {
    configuration("scenarios", "Expected an array of scenarios.");
  }
  const scenarios = new Map<string, MockReadOrdersScenario>();
  for (const [index, scenario] of snapshot.scenarios.entries()) {
    if (!scenario || typeof scenario !== "object" || Array.isArray(scenario)) {
      configuration(`scenarios[${index}]`, "Expected a scenario object.");
    }
    const requestKey = key(scenario.request, `scenarios[${index}].request`);
    if (scenarios.has(requestKey)) {
      configuration(
        `scenarios[${index}].request`,
        "Mock scenarios must have unique requests.",
      );
    }
    if (
      Object.hasOwn(scenario, "result") === Object.hasOwn(scenario, "error")
    ) {
      configuration(
        `scenarios[${index}]`,
        "A mock scenario requires exactly one result or error.",
      );
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
      const at = `scenarios[${index}].error`;
      if (!error || typeof error !== "object" || Array.isArray(error)) {
        configuration(at, "Expected an error descriptor.");
      }
      if (!Object.hasOwn(errorCodes, error.code)) {
        configuration(`${at}.code`, "Expected a known error code.");
      }
      if (
        error.status !== undefined &&
        (!Number.isInteger(error.status) || error.status < 100 ||
          error.status > 599)
      ) {
        configuration(
          `${at}.status`,
          "Expected an integer HTTP status between 100 and 599.",
        );
      }
      if (
        error.retryAfterSeconds !== undefined &&
        (!Number.isSafeInteger(error.retryAfterSeconds) ||
          error.retryAfterSeconds < 0)
      ) {
        configuration(
          `${at}.retryAfterSeconds`,
          "Expected a nonnegative safe integer.",
        );
      }
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
      if (!scenario) {
        configuration("request", "No mock scenario matches this request.");
      }
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
