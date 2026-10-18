import { createCoupangOrderSource } from "./adapters/coupang.js";
import type { CoupangReadOrdersOptions } from "./adapters/coupang.js";
import { createReadOrdersUseCase } from "./application/read-orders.js";
import type { ReadOrdersUseCase } from "./application/contracts.js";

export type {
  CoupangCredentials,
  CoupangOrderStatus,
  CoupangReadOrdersOptions,
} from "./adapters/coupang.js";

/** Compose the public use case without starting requests or resolving credentials. */
export function createCoupangReadOrders(
  configuration: CoupangReadOrdersOptions,
): ReadOrdersUseCase {
  const options = { ...configuration };
  return createReadOrdersUseCase(
    createCoupangOrderSource(options),
    options.now,
  );
}
