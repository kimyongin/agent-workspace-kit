import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createMockReadOrders,
  createOrderFixtures,
  MockFixtureError,
} from "../dist/testing.js";

const context = {
  market: "naver",
  connectionId: "demo-store",
  from: "2026-10-18T00:00+09:00",
  to: "2026-10-18T01:00+09:00",
};
const request = { from: context.from, to: context.to };

for (const market of ["coupang", "naver"]) {
  test(`${market} fixture defaults compose directly into the public mock use case`, async () => {
    const fixtures = createOrderFixtures({ ...context, market });
    const page = fixtures.page();
    assert.equal(page.items.length, 1);
    const order = page.items[0];
    assert.equal(order.lines.length, 1);
    assert.deepEqual({ ...order.ref, id: undefined }, {
      market,
      connectionId: context.connectionId,
      kind: market === "coupang" ? "shipment" : "productOrder",
      id: undefined,
    });
    assert.equal(order.placedAt, context.from);
    assert.equal(order.rawStatus, market === "coupang" ? "ACCEPT" : "PAYED");
    assert.equal(
      order.fulfillment,
      market === "coupang" ? "pending" : "preparing",
    );
    assert.equal(page.observedAt, context.to);
    assert.equal(
      page.coverage.kind,
      market === "coupang" ? "statusWindow" : "changedWindow",
    );
    const useCase = createMockReadOrders({
      market,
      scenarios: [{ request, result: page }],
    });
    assert.deepEqual(await useCase.execute(request), page);
  });
}

test("overrides preserve exact public values and nested public models", async () => {
  const fixtures = createOrderFixtures({
    ...context,
    observedAt: "2026-10-18T03:00:00.123456Z",
  });
  const line = fixtures.line({
    id: "line-custom",
    productId: "product-custom",
    title: "Custom item",
    quantity: 3,
    cancelledQuantity: 1,
    pendingCancellationQuantity: 1,
    unitPrice: { currency: "KRW", amount: "9007199254740993.125" },
    paidAmount: { currency: "KRW", amount: "-0.25" },
  });
  const order = fixtures.order({
    ref: { id: "custom-snapshot" },
    orderId: "custom-order",
    lines: [line],
    rawStatus: "FUTURE_STATUS",
    fulfillment: "unknown",
  });
  const page = fixtures.page({ items: [order], nextCursor: "next-page" });
  const received = await createMockReadOrders({
    market: "naver",
    scenarios: [{ request, result: page }],
  }).execute(request);
  assert.deepEqual(received, page);
  assert.deepEqual(received.items[0].lines, [line]);
  assert.equal(received.observedAt, "2026-10-18T03:00:00.123456Z");
  assert.equal(received.items[0].ref.id, "custom-snapshot");
  assert.deepEqual(fixtures.page({ items: [] }).items, []);
});

test("fixture defaults are reproducible and generated IDs avoid previously supplied IDs", () => {
  function build() {
    const fixtures = createOrderFixtures(context);
    return fixtures.page({ items: [fixtures.order(), fixtures.order()] });
  }
  assert.deepEqual(build(), build());
  const fixtures = createOrderFixtures(context);
  fixtures.line({ id: "fixture-line-1" });
  const generated = fixtures.line();
  assert.notEqual(generated.id, "fixture-line-1");
  const explicit = fixtures.order({
    ref: { id: "fixture-snapshot-9" },
    orderId: "fixture-order-10",
  });
  const orders = Array.from({ length: 20 }, () => fixtures.order());
  assert.ok(
    orders.every((order) =>
      order.ref.id !== explicit.ref.id && order.orderId !== explicit.orderId
    ),
  );
  assert.equal(
    new Set(orders.map((order) => order.ref.id)).size,
    orders.length,
  );
  assert.equal(
    new Set(orders.flatMap((order) => order.lines.map((line) => line.id))).size,
    orders.length,
  );
});

test("context, override inputs and returned models do not alias across builds", () => {
  const options = { ...context };
  const fixtures = createOrderFixtures(options);
  options.connectionId = "changed";
  const amount = { currency: "KRW", amount: "10.25" };
  const line = fixtures.line({ unitPrice: amount });
  amount.amount = "changed";
  const order = fixtures.order({ lines: [line] });
  line.unitPrice.amount = "changed";
  const page = fixtures.page({ items: [order] });
  order.lines[0].quantity = 999;
  assert.equal(page.items[0].ref.connectionId, context.connectionId);
  assert.equal(page.items[0].lines[0].unitPrice.amount, "10.25");
  assert.equal(page.items[0].lines[0].quantity, 1);
  page.coverage.from = "changed";
  assert.equal(fixtures.page().coverage.from, context.from);
});

test("invalid overrides identify the exact field instead of silently repairing data", () => {
  const fixtures = createOrderFixtures(context);
  const cases = [
    [() => fixtures.line({ quantity: -1 }), "line.quantity"],
    [
      () => fixtures.line({ unitPrice: { currency: "KRW", amount: 100 } }),
      "line.unitPrice.amount",
    ],
    [() => fixtures.order({ ref: { market: "coupang" } }), "order.ref.market"],
    [
      () => fixtures.order({ ref: { connectionId: "other" } }),
      "order.ref.connectionId",
    ],
    [() => fixtures.order({ ref: { kind: "shipment" } }), "order.ref.kind"],
    [
      () => fixtures.page({ coverage: { to: "2026-10-18T02:00+09:00" } }),
      "page.coverage.to",
    ],
    [() => fixtures.line(null), "line"],
    [() => fixtures.order({ ref: null }), "order.ref"],
    [
      () => createOrderFixtures({ ...context, from: "2026-02-31T00:00+09:00" }),
      "fixtures.from",
    ],
    [
      () => createOrderFixtures({ ...context, observedAt: "invalid" }),
      "fixtures.observedAt",
    ],
    [
      () => createOrderFixtures({ ...context, connectionId: "" }),
      "fixtures.connectionId",
    ],
    [
      () => createOrderFixtures({ ...context, to: context.from }),
      "fixtures.to",
    ],
  ];
  for (const [action, path] of cases) {
    assert.throws(
      action,
      (error) =>
        error instanceof MockFixtureError && error.code === "configuration" &&
        error.path === path,
    );
  }
});

test("duplicate explicit identities are rejected at the containing order or page", () => {
  const fixtures = createOrderFixtures(context);
  const line = fixtures.line();
  assert.throws(() => fixtures.order({ lines: [line, line] }), {
    path: "order.lines[1].id",
  });
  const order = fixtures.order();
  assert.throws(() => fixtures.page({ items: [order, order] }), {
    path: "page.items[1].ref.id",
  });
});
