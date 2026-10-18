import { MarketplaceError } from "../domain/errors.js";
import { assertOrderPage, OrderModelError } from "../domain/validation.js";
import type { ReadOrdersUseCase } from "./contracts.js";
import { currentTime } from "./clock.js";
import type { Clock, OrderSource } from "./ports.js";

/** Read one complete page. Scheduling, persistence and scan retries belong to the app. */
export function createReadOrdersUseCase(
  source: OrderSource,
  now?: Clock,
): ReadOrdersUseCase {
  return {
    market: source.market,
    async execute(query) {
      const page = await source.readPage(query);
      const result = {
        items: page.items,
        nextCursor: page.nextCursor,
        observedAt: currentTime(now).toISOString(),
        coverage: page.coverage,
      };
      try {
        assertOrderPage(result, "result", {
          market: source.market,
          request: query,
        });
      } catch (error) {
        if (error instanceof OrderModelError) {
          throw new MarketplaceError(
            "invalidResponse",
            "The normalized order page does not match the public contract.",
          );
        }
        throw error;
      }
      return result;
    },
  };
}
