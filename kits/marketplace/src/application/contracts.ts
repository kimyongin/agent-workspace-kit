import type { Market, OrderPage } from "../domain/orders.js";

export interface ReadOrdersQuery {
  readonly from: string;
  readonly to: string;
  readonly cursor?: string;
  readonly signal?: AbortSignal;
}

export interface MarketplaceReader {
  readonly market: Market;
  /** No persistence: the host commits page data and cursor atomically. */
  readOrders(query: ReadOrdersQuery): Promise<OrderPage>;
}
