import assert from "node:assert/strict";
import { test } from "node:test";
import { MarketplaceError } from "../dist/index.js";
import { createCoupangClient } from "../dist/coupang.js";
import { createNaverClient } from "../dist/naver.js";

test("importing and constructing readers do not resolve secrets or make requests", () => {
  const forbidden = () => {
    throw new Error("unexpected side effect");
  };
  const coupang = createCoupangClient({
    connectionId: "store-a",
    vendorId: "A00000001",
    orderStatus: "ACCEPT",
    credentials: forbidden,
    fetch: forbidden,
  });
  const naver = createNaverClient({
    connectionId: "store-b",
    credentials: forbidden,
    fetch: forbidden,
  });
  assert.equal(coupang.market, "coupang");
  assert.equal(naver.market, "naver");
});

test("public errors expose the normalized category without a raw provider cause", () => {
  const error = new MarketplaceError(
    "rateLimited",
    "The provider rejected the read.",
    { status: 429, retryAfterSeconds: 10 },
  );
  assert.equal(error.code, "rateLimited");
  assert.equal(error.status, 429);
  assert.equal(error.retryAfterSeconds, 10);
  assert.equal(error.cause, undefined);
});

test("a cancelled read never resolves credentials or sends HTTP", async () => {
  const forbidden = () => {
    throw new Error("secret-canary-must-not-escape");
  };
  const reader = createCoupangClient({
    connectionId: "cancelled",
    vendorId: "A00000001",
    orderStatus: "ACCEPT",
    credentials: forbidden,
    fetch: forbidden,
  });
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(
    reader.readOrders({
      from: "2026-10-18T00:00+09:00",
      to: "2026-10-18T00:01+09:00",
      signal: controller.signal,
    }),
    (error) =>
      error instanceof MarketplaceError && error.code === "cancelled" &&
      !String(error).includes("canary"),
  );
});

test("an impossible calendar date is rejected before credentials are resolved", async () => {
  const reader = createNaverClient({
    connectionId: "invalid-date",
    credentials: async () => {
      throw new Error("secret-canary");
    },
  });
  await assert.rejects(
    reader.readOrders({
      from: "2026-02-31T00:00:00+09:00",
      to: "2026-03-04T00:00:00+09:00",
    }),
    (error) =>
      error instanceof MarketplaceError && error.code === "invalidInput",
  );
});

test("an HTTP-date rate limit is actionable without exposing the provider body", async () => {
  const reader = createCoupangClient({
    connectionId: "limited",
    vendorId: "A00000001",
    orderStatus: "ACCEPT",
    credentials: async () => ({
      accessKey: "synthetic",
      secretKey: "synthetic",
    }),
    now: () => new Date("2026-10-18T03:00:00Z"),
    fetch: async () =>
      new Response("secret-canary", {
        status: 429,
        headers: { "retry-after": "Sun, 18 Oct 2026 03:00:15 GMT" },
      }),
  });
  await assert.rejects(
    reader.readOrders({
      from: "2026-10-18T00:00+09:00",
      to: "2026-10-18T00:01+09:00",
    }),
    (error) =>
      error.code === "rateLimited" && error.retryAfterSeconds === 15 &&
      !JSON.stringify(error).includes("canary"),
  );
});
