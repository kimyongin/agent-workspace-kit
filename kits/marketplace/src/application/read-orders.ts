import { MarketplaceError } from "../domain/errors.js";
import type { MarketplaceReader } from "./contracts.js";
import { currentTime } from "./clock.js";
import type { Clock, OrderSource } from "./ports.js";

/** Read one complete page. Scheduling, persistence and scan retries belong to the app. */
export function createOrderReader(
  source: OrderSource,
  now?: Clock,
): MarketplaceReader {
  return {
    market: source.market,
    async readOrders(query) {
      const page = await source.readPage(query);
      const identities = new Set<string>();
      for (const order of page.items) {
        const identity = JSON.stringify([order.ref.kind, order.ref.id]);
        if (
          identities.has(identity) ||
          new Set(order.lines.map((line) => line.id)).size !==
            order.lines.length
        ) {
          throw new MarketplaceError(
            "invalidResponse",
            "The provider response does not match the verified contract.",
          );
        }
        identities.add(identity);
      }
      return {
        items: page.items,
        nextCursor: page.nextCursor,
        observedAt: currentTime(now).toISOString(),
        coverage: page.coverage,
      };
    },
  };
}
