import assert from "node:assert/strict";
import { test } from "node:test";
import { createMockReadOrders } from "../dist/testing.js";
import { MarketplaceError } from "../dist/index.js";
import fixture from "./fixtures/order-page.json" with { type: "json" };

const request = { from: fixture.coverage.from, to: fixture.coverage.to };
const options = (result = fixture) => ({
  market: "naver",
  scenarios: [{ request, result }],
});

test("mock returns the complete public OrderPage including exact observation, money and cursor", async () => {
  const page = { ...fixture, nextCursor: "opaque-synthetic-cursor" };
  const useCase = createMockReadOrders(options(page));
  assert.equal(useCase.market, "naver");
  assert.deepEqual(await useCase.execute(request), page);
});

test("fixtures and results are isolated deeply across callers, repeated reads and instances", async () => {
  const configuration = structuredClone(options());
  const first = createMockReadOrders(configuration);
  const second = createMockReadOrders(configuration);
  configuration.market = "coupang";
  configuration.scenarios[0].request.from = "mutated";
  configuration.scenarios[0].result.items[0].lines[0].title = "mutated";
  const result = await first.execute(request);
  result.items[0].lines[0].title = "caller changed this";
  result.coverage.from = "changed";
  result.items.push(structuredClone(result.items[0]));
  assert.equal(first.market, "naver");
  assert.deepEqual(await first.execute(request), fixture);
  assert.deepEqual(await second.execute(request), fixture);
});

test("matches windows and cursors exactly without consuming state during concurrent reads", async () => {
  const firstPage = { ...fixture, nextCursor: "page-2" };
  const lastPage = { ...fixture, items: [], nextCursor: null };
  const otherRequest = { ...request, to: "2026-10-18T02:00+09:00" };
  const otherPage = {
    ...lastPage,
    coverage: { kind: "changedWindow", ...otherRequest },
  };
  const useCase = createMockReadOrders({
    market: "naver",
    scenarios: [
      { request, result: firstPage },
      { request: { ...request, cursor: "page-2" }, result: lastPage },
      { request: otherRequest, result: otherPage },
    ],
  });
  const results = await Promise.all([
    useCase.execute({ ...request, cursor: "page-2" }),
    useCase.execute(request),
    useCase.execute(otherRequest),
    useCase.execute({ ...request, cursor: undefined }),
  ]);
  assert.deepEqual(results, [lastPage, firstPage, otherPage, firstPage]);
  await assert.rejects(useCase.execute({ ...request, cursor: "unknown" }), {
    code: "configuration",
  });
  await assert.rejects(useCase.execute({ ...request, from: "different" }), {
    code: "configuration",
  });
});

test("failure scenarios expose the same normalized error category and metadata with fresh errors", async () => {
  const useCase = createMockReadOrders({
    market: "naver",
    scenarios: [{
      request,
      error: {
        code: "rateLimited",
        status: 429,
        retryAfterSeconds: 10,
        message: "secret-canary",
      },
    }],
  });
  const errors = [];
  for (let i = 0; i < 2; i++) {
    await assert.rejects(useCase.execute(request), (error) => {
      errors.push(error);
      return error instanceof MarketplaceError &&
        error.code === "rateLimited" &&
        error.status === 429 && error.retryAfterSeconds === 10 &&
        error.cause === undefined && !String(error.stack).includes("canary");
    });
  }
  assert.notEqual(errors[0], errors[1]);
});

test("pre-aborted reads fail as cancelled and leave later calls unchanged", async () => {
  const useCase = createMockReadOrders(options());
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(
    useCase.execute({ ...request, signal: controller.signal }),
    { code: "cancelled" },
  );
  assert.deepEqual(await useCase.execute(request), fixture);
});

test("unregistered requests fail explicitly while an explicitly empty page succeeds", async () => {
  await assert.rejects(
    createMockReadOrders({ market: "naver", scenarios: [] }).execute(request),
    { code: "configuration" },
  );
  const empty = { ...fixture, items: [] };
  assert.deepEqual(
    await createMockReadOrders(options(empty)).execute(request),
    empty,
  );
});

test("invalid mock configuration is reported safely and duplicate requests are rejected", () => {
  const badConfigurations = [
    null,
    { market: "unsupported", scenarios: [] },
    { market: "naver", scenarios: null },
    { market: "naver", scenarios: [null] },
    {
      market: "naver",
      scenarios: [{ request, result: fixture }, { request, result: fixture }],
    },
    { market: "naver", scenarios: [{ request }] },
    {
      market: "naver",
      scenarios: [{ request, result: fixture, error: { code: "transport" } }],
    },
    {
      market: "naver",
      scenarios: [{ request: { from: 1, to: "a" }, result: fixture }],
    },
    { market: "coupang", scenarios: [{ request, result: fixture }] },
    {
      market: "naver",
      scenarios: [{ request, result: { ...fixture, observedAt: undefined } }],
    },
    { market: "naver", scenarios: [{ request, error: { code: "unknown" } }] },
    {
      market: "naver",
      scenarios: [{ request, error: { code: "transport", status: 0 } }],
    },
    {
      market: "naver",
      scenarios: [{
        request,
        error: { code: "rateLimited", retryAfterSeconds: -1 },
      }],
    },
    {
      market: "naver",
      scenarios: [{
        request,
        result: () => {
          throw new Error("secret-canary");
        },
      }],
    },
  ];
  for (const configuration of badConfigurations) {
    assert.throws(
      () => createMockReadOrders(configuration),
      (error) =>
        error instanceof MarketplaceError && error.code === "configuration" &&
        !String(error.stack).includes("canary"),
    );
  }
});

test("malformed execute requests produce normalized input errors", async () => {
  const useCase = createMockReadOrders(options());
  for (const value of [null, {}, { ...request, cursor: 1 }]) {
    await assert.rejects(useCase.execute(value), { code: "invalidInput" });
  }
});
