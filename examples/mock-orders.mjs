import assert from "node:assert/strict";
import { createMockReadOrders } from "@kimyongin/marketplace-kit/testing";
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
  console.log(
    "mock: complete public result injection and isolated app consumption passed",
  );
} finally {
  globalThis.fetch = originalFetch;
}
