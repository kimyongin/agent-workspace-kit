import { createNaverOrderSource } from "./adapters/naver.js";
import type { NaverReadOrdersOptions } from "./adapters/naver.js";
import { createReadOrdersUseCase } from "./application/read-orders.js";
import type { ReadOrdersUseCase } from "./application/contracts.js";

export type {
  NaverCredentials,
  NaverReadOrdersOptions,
} from "./adapters/naver.js";

/** Compose the public use case without starting requests or resolving credentials. */
export function createNaverReadOrders(
  configuration: NaverReadOrdersOptions,
): ReadOrdersUseCase {
  const options = { ...configuration };
  return createReadOrdersUseCase(createNaverOrderSource(options), options.now);
}
