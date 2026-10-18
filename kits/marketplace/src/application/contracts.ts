import type { Market, OrderPage } from "../domain/orders.js";

export interface ReadOrdersQuery {
  readonly from: string;
  readonly to: string;
  readonly cursor?: string;
  readonly signal?: AbortSignal;
}

export interface ReadOrdersUseCase {
  readonly market: Market;
  /** No persistence: the host commits page data and cursor atomically. */
  execute(query: ReadOrdersQuery): Promise<OrderPage>;
}
