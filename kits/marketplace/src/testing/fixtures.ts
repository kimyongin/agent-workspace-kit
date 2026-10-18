import type {
  Market,
  OrderLine,
  OrderPage,
  OrderSnapshot,
} from "../domain/orders.js";
import {
  assertIdentifier,
  assertMarket,
  assertOrderLine,
  assertOrderPage,
  assertOrderSnapshot,
  assertTimestamp,
  assertWindow,
} from "../domain/validation.js";
import { checkFixture, copyFixture, MockFixtureError } from "./validation.js";

export interface OrderFixtureOptions {
  readonly market: Market;
  readonly connectionId: string;
  readonly from: string;
  readonly to: string;
  readonly observedAt?: string;
}
export type OrderFixtureOverrides = Partial<Omit<OrderSnapshot, "ref">> & {
  readonly ref?: Partial<OrderSnapshot["ref"]>;
};
export type OrderPageFixtureOverrides = Partial<Omit<OrderPage, "coverage">> & {
  readonly coverage?: Partial<OrderPage["coverage"]>;
};
export interface OrderFixtures {
  line(overrides?: Partial<OrderLine>): OrderLine;
  order(overrides?: OrderFixtureOverrides): OrderSnapshot;
  page(overrides?: OrderPageFixtureOverrides): OrderPage;
}

function overrides<T extends object>(value: T, path: string): T {
  const data = copyFixture(value, path);
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new MockFixtureError(path, "Expected an overrides object.");
  }
  return data;
}

/** Deterministic fixture builders returning the public models directly. */
export function createOrderFixtures(
  configuration: OrderFixtureOptions,
): OrderFixtures {
  const options = overrides(configuration, "fixtures");
  checkFixture(() => {
    assertMarket(options.market, "fixtures.market");
    assertIdentifier(options.connectionId, "fixtures.connectionId");
    assertWindow(options.from, options.to, "fixtures");
    if (options.observedAt !== undefined) {
      assertTimestamp(options.observedAt, "fixtures.observedAt");
    }
  });
  const observedAt = options.observedAt ?? options.to;
  const scope = { market: options.market, connectionId: options.connectionId };
  const used = new Set<string>();
  let sequence = 0;
  function remember(value: unknown): void {
    if (typeof value === "string") used.add(value);
  }
  function next(kind: string): string {
    let value: string;
    do {
      value = `fixture-${kind}-${++sequence}`;
    } while (used.has(value));
    used.add(value);
    return value;
  }
  function rememberLine(line: Partial<OrderLine>): void {
    remember(line?.id);
    remember(line?.productId);
    remember(line?.optionId);
  }
  function rememberOrder(order: OrderFixtureOverrides): void {
    remember(order?.ref?.id);
    remember(order?.orderId);
    if (Array.isArray(order?.lines)) order.lines.forEach(rememberLine);
  }
  const fixtures: OrderFixtures = {
    line(input = {}) {
      const data = overrides(input, "line");
      rememberLine(data);
      const result: OrderLine = {
        id: data.id === undefined ? next("line") : data.id,
        productId: data.productId === undefined
          ? next("product")
          : data.productId,
        title: "Synthetic item",
        quantity: 1,
        unitPrice: { currency: "KRW", amount: "1000" },
        ...data,
      };
      checkFixture(() => assertOrderLine(result, "line"));
      return result;
    },
    order(input = {}) {
      const data = overrides(input, "order");
      rememberOrder(data);
      const ref = data.ref === undefined
        ? {}
        : overrides(data.ref, "order.ref");
      const result: OrderSnapshot = {
        orderId: data.orderId === undefined ? next("order") : data.orderId,
        placedAt: options.from,
        rawStatus: options.market === "coupang" ? "ACCEPT" : "PAYED",
        fulfillment: options.market === "coupang" ? "pending" : "preparing",
        lines: data.lines === undefined ? [fixtures.line()] : data.lines,
        ...data,
        ref: {
          ...scope,
          kind: options.market === "coupang" ? "shipment" : "productOrder",
          id: ref.id === undefined ? next("snapshot") : ref.id,
          ...ref,
        },
      };
      checkFixture(() => assertOrderSnapshot(result, "order", scope));
      return result;
    },
    page(input = {}) {
      const data = overrides(input, "page");
      if (Array.isArray(data.items)) data.items.forEach(rememberOrder);
      const coverage = data.coverage === undefined
        ? {}
        : overrides(data.coverage, "page.coverage");
      const result: OrderPage = {
        items: data.items === undefined ? [fixtures.order()] : data.items,
        nextCursor: null,
        observedAt,
        ...data,
        coverage: {
          kind: options.market === "coupang" ? "statusWindow" : "changedWindow",
          from: options.from,
          to: options.to,
          ...(options.market === "coupang" ? { status: "ACCEPT" } : {}),
          ...coverage,
        },
      };
      checkFixture(() =>
        assertOrderPage(result, "page", { ...scope, request: options })
      );
      return result;
    },
  };
  return fixtures;
}
