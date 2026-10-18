import { createNaverOrderSource } from "./adapters/naver.js";
import type { NaverClientOptions } from "./adapters/naver.js";
import { createOrderReader } from "./application/read-orders.js";
import type { MarketplaceReader } from "./application/contracts.js";

export type { NaverClientOptions, NaverCredentials } from "./adapters/naver.js";

/** Compose the public use case without starting requests or resolving credentials. */
export function createNaverClient(
  configuration: NaverClientOptions,
): MarketplaceReader {
  const options = { ...configuration };
  return createOrderReader(createNaverOrderSource(options), options.now);
}
