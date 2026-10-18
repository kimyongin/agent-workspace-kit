import assert from "node:assert/strict";
import { test } from "node:test";
import { createMockReadOrders, MockFixtureError } from "../dist/testing.js";
import { MarketplaceError } from "../dist/index.js";
import fixture from "./fixtures/order-page.json" with { type: "json" };

const request = { from: fixture.coverage.from, to: fixture.coverage.to };

test("direct JSON injection reports value-free paths for malformed nested public data", () => {
  const changes = [
    [(p) => {
      p.items = Array(1);
    }, "items[0]"],
    [(p) => {
      p.items[0].lines = Array(1);
    }, "items[0].lines[0]"],
    [(p) => {
      p.items = null;
    }, "items"],
    [(p) => {
      p.items[0].orderId = 42;
    }, "items[0].orderId"],
    [(p) => {
      p.items[0].ref.kind = "shipment";
    }, "items[0].ref.kind"],
    [(p) => {
      p.items[0].ref.id = "bad\u0000";
    }, "items[0].ref.id"],
    [(p) => {
      p.items[0].placedAt = "2026-02-31T00:00+09:00";
    }, "items[0].placedAt"],
    [(p) => {
      p.items[0].fulfillment = "invented";
    }, "items[0].fulfillment"],
    [(p) => {
      p.items[0].rawStatus = null;
    }, "items[0].rawStatus"],
    [(p) => {
      p.items[0].lines = {};
    }, "items[0].lines"],
    [(p) => {
      p.items[0].lines[0].productId = "";
    }, "items[0].lines[0].productId"],
    [(p) => {
      p.items[0].lines[0].quantity = 1.5;
    }, "items[0].lines[0].quantity"],
    [(p) => {
      p.items[0].lines[0].cancelledQuantity = 3;
    }, "items[0].lines[0].cancelledQuantity"],
    [(p) => {
      p.items[0].lines[0].cancelledQuantity = 1;
      p.items[0].lines[0].pendingCancellationQuantity = 2;
    }, "items[0].lines[0].pendingCancellationQuantity"],
    [(p) => {
      p.items[0].lines[0].unitPrice.amount = 9007199254740992;
    }, "items[0].lines[0].unitPrice.amount"],
    [(p) => {
      p.items[0].lines[0].paidAmount.currency = "krw";
    }, "items[0].lines[0].paidAmount.currency"],
    [(p) => {
      p.items[0].lines.push(p.items[0].lines[0]);
    }, "items[0].lines[1].id"],
    [(p) => {
      p.items.push(p.items[0]);
    }, "items[1].ref.id"],
    [(p) => {
      const other = structuredClone(p.items[0]);
      other.ref.id = "other";
      other.ref.connectionId = "other";
      p.items.push(other);
    }, "items[1].ref.connectionId"],
    [(p) => {
      p.nextCursor = "";
    }, "nextCursor"],
    [(p) => {
      p.coverage = {};
    }, "coverage.kind"],
    [(p) => {
      p.coverage.kind = "statusWindow";
    }, "coverage.kind"],
    [(p) => {
      p.coverage.from = "2026-10-17T00:00+09:00";
    }, "coverage.from"],
    [(p) => {
      p.coverage.to = p.coverage.from;
    }, "coverage.to"],
    [(p) => {
      p.observedAt = "secret-canary";
    }, "observedAt"],
  ];
  for (const [change, field] of changes) {
    const page = structuredClone(fixture);
    change(page);
    assert.throws(
      () =>
        createMockReadOrders({
          market: "naver",
          scenarios: [{ request, result: fixture }, {
            request: { ...request, cursor: "next" },
            result: page,
          }],
        }),
      (error) =>
        error instanceof MockFixtureError &&
        error instanceof MarketplaceError &&
        error.code === "configuration" &&
        error.path === `scenarios[1].result.${field}` &&
        !String(error.stack).includes("canary") && error.cause === undefined,
    );
  }
});

test("validation preserves microseconds, future raw statuses and signed exact decimal strings", async () => {
  const page = structuredClone(fixture);
  page.items[0].placedAt = "2026-10-18T00:00:00.123456789+09:00";
  page.items[0].rawStatus = "FUTURE_STATE";
  page.items[0].fulfillment = "unknown";
  page.items[0].lines[0].paidAmount.amount = "-9007199254740993.125000001";
  const useCase = createMockReadOrders({
    market: "naver",
    scenarios: [{ request, result: page }],
  });
  assert.deepEqual(await useCase.execute(request), page);
});
