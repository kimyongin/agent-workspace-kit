import assert from "node:assert/strict";
import {
  createMockReadOrders,
  createOrderFixtures,
  MockFixtureError,
} from "@kimyongin/marketplace-kit/testing";
import page from "./fixtures/order-page.json" with { type: "json" };

const request = { from: page.coverage.from, to: page.coverage.to };
const useCase = createMockReadOrders({
  market: "naver",
  scenarios: [{ request, result: page }],
});
// This app function has the same public contract as with a real use case.
const loadOrders = (orders) => orders.execute(request);
const originalFetch = globalThis.fetch;
globalThis.fetch = () => {
  throw new Error("Mock attempted external communication");
};
try {
  const received = await loadOrders(useCase);
  assert.deepEqual(received, page);
  received.items[0].lines[0].title = "app changed the returned copy";
  assert.deepEqual(await loadOrders(useCase), page);
  const fixtures = createOrderFixtures({
    market: "naver",
    connectionId: "demo-store",
    ...request,
  });
  const builtPage = fixtures.page({
    items: [
      fixtures.order({
        lines: [fixtures.line({ title: "App demo item", quantity: 2 })],
      }),
    ],
  });
  const builtMock = createMockReadOrders({
    market: "naver",
    scenarios: [{ request, result: builtPage }],
  });
  assert.deepEqual(await loadOrders(builtMock), builtPage);
  assert.throws(
    () => fixtures.line({ quantity: -1 }),
    (error) =>
      error instanceof MockFixtureError && error.path === "line.quantity",
  );
  console.log(
    "mock: fixture builders, public model validation and isolated app consumption passed",
  );
} finally {
  globalThis.fetch = originalFetch;
}
