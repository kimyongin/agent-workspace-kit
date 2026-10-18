import { createCoupangOrderSource } from "./adapters/coupang.js";
import type { CoupangClientOptions } from "./adapters/coupang.js";
import { createOrderReader } from "./application/read-orders.js";
import type { MarketplaceReader } from "./application/contracts.js";

export type {
  CoupangClientOptions,
  CoupangCredentials,
  CoupangOrderStatus,
} from "./adapters/coupang.js";

/** Compose the public use case without starting requests or resolving credentials. */
export function createCoupangClient(
  configuration: CoupangClientOptions,
): MarketplaceReader {
  const options = { ...configuration };
  return createOrderReader(createCoupangOrderSource(options), options.now);
}
