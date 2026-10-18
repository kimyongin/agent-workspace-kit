import type { Market, OrderPage } from "../domain/orders.js";
import type { ReadOrdersQuery } from "./contracts.js";

export type Clock = () => Date;

/** A complete normalized page; provider-specific hydration stays in the adapter. */
export type SourceOrderPage = Omit<OrderPage, "observedAt">;

/** Internal outbound port, owned by the application and bound to one connection. */
export interface OrderSource {
  readonly market: Market;
  readPage(query: ReadOrdersQuery): Promise<SourceOrderPage>;
}
