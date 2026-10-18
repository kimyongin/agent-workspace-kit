import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
import { MarketplaceError } from "../dist/index.js";
import { createCoupangReadOrders } from "../dist/coupang.js";
import { createNaverReadOrders } from "../dist/naver.js";

test("importing and constructing readers do not resolve secrets or make requests", () => {
  const forbidden = () => {
    throw new Error("unexpected side effect");
  };
  const coupang = createCoupangReadOrders({
    connectionId: "store-a",
    vendorId: "A00000001",
    orderStatus: "ACCEPT",
    credentials: forbidden,
    fetch: forbidden,
  });
  const naver = createNaverReadOrders({
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
  const reader = createCoupangReadOrders({
    connectionId: "cancelled",
    vendorId: "A00000001",
    orderStatus: "ACCEPT",
    credentials: forbidden,
    fetch: forbidden,
  });
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(
    reader.execute({
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
  const reader = createNaverReadOrders({
    connectionId: "invalid-date",
    credentials: async () => {
      throw new Error("secret-canary");
    },
  });
  await assert.rejects(
    reader.execute({
      from: "2026-02-31T00:00:00+09:00",
      to: "2026-03-04T00:00:00+09:00",
    }),
    (error) =>
      error instanceof MarketplaceError && error.code === "invalidInput",
  );
});

test("an HTTP-date rate limit is actionable without exposing the provider body", async () => {
  const reader = createCoupangReadOrders({
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
    reader.execute({
      from: "2026-10-18T00:00+09:00",
      to: "2026-10-18T00:01+09:00",
    }),
    (error) =>
      error.code === "rateLimited" && error.retryAfterSeconds === 15 &&
      !JSON.stringify(error).includes("canary"),
  );
});

test("fractional request deadlines are rejected as configuration errors", () => {
  for (const timeoutMs of [0.5, 1.5]) {
    assert.throws(
      () =>
        createCoupangReadOrders({
          connectionId: "bad-timeout",
          vendorId: "A00000001",
          orderStatus: "ACCEPT",
          timeoutMs,
          credentials: async () => ({
            accessKey: "synthetic",
            secretKey: "synthetic",
          }),
        }),
      (error) =>
        error instanceof MarketplaceError && error.code === "configuration",
    );
  }
});

test("a resolver throwing the public error class cannot leak its original message", async () => {
  const reader = createCoupangReadOrders({
    connectionId: "safe-resolver",
    vendorId: "A00000001",
    orderStatus: "ACCEPT",
    credentials: async () => {
      throw new MarketplaceError("transport", "credential-secret-canary");
    },
  });
  await assert.rejects(
    reader.execute({
      from: "2026-10-18T00:00+09:00",
      to: "2026-10-18T00:01+09:00",
    }),
    (error) =>
      error instanceof MarketplaceError && error.code === "configuration" &&
      !String(error.stack).includes("canary"),
  );
});

test("an invalid or failing injected clock produces a safe configuration error", async () => {
  for (
    const now of [() => new Date(NaN), () => {
      throw new MarketplaceError("transport", "clock-secret-canary");
    }]
  ) {
    const reader = createCoupangReadOrders({
      connectionId: "safe-clock",
      vendorId: "A00000001",
      orderStatus: "ACCEPT",
      now,
      credentials: async () => ({
        accessKey: "synthetic",
        secretKey: "synthetic",
      }),
    });
    await assert.rejects(
      reader.execute({
        from: "2026-10-18T00:00+09:00",
        to: "2026-10-18T00:01+09:00",
      }),
      (error) =>
        error instanceof MarketplaceError && error.code === "configuration" &&
        !String(error.stack).includes("canary"),
    );
  }
});

for (const market of ["coupang", "naver"]) {
  test(`${market} observes a page after the final provider response and masks a failing observation clock`, async () => {
    const fixture = await readFile(
      new URL(
        `./fixtures/${
          market === "coupang" ? "coupang-orders" : "naver-details"
        }.json`,
        import.meta.url,
      ),
      "utf8",
    );
    const changes = market === "naver"
      ? await readFile(
        new URL("./fixtures/naver-changes.json", import.meta.url),
        "utf8",
      )
      : null;
    for (const failClock of [false, true]) {
      let finished = false;
      const options = {
        connectionId: "observed-page",
        now: () => {
          if (finished && failClock) {
            throw new Error("observation-clock-secret-canary");
          }
          return new Date(
            finished ? "2026-10-18T03:00:00Z" : "2026-10-18T01:00:00Z",
          );
        },
        fetch: async (url) => {
          if (url.endsWith("/oauth2/token")) {
            return new Response(JSON.stringify({
              access_token: "synthetic-token",
              token_type: "Bearer",
              expires_in: 3600,
            }));
          }
          if (url.includes("last-changed-statuses")) {
            return new Response(changes);
          }
          finished = true;
          return new Response(fixture);
        },
      };
      const reader = market === "coupang"
        ? createCoupangReadOrders({
          ...options,
          vendorId: "A00000001",
          orderStatus: "ACCEPT",
          credentials: async () => ({
            accessKey: "synthetic",
            secretKey: "synthetic",
          }),
        })
        : createNaverReadOrders({
          ...options,
          credentials: async () => ({
            clientId: "synthetic",
            clientSecret: "$2a$10$abcdefghijklmnopqrstuv",
            type: "SELF",
          }),
        });
      const result = reader.execute({
        from: "2026-10-18T00:00+09:00",
        to: "2026-10-18T01:00+09:00",
      });
      if (failClock) {
        await assert.rejects(
          result,
          (error) =>
            error instanceof MarketplaceError &&
            error.code === "configuration" &&
            !String(error.stack).includes("canary"),
        );
      } else {
        const page = await result;
        assert.equal(page.observedAt, "2026-10-18T03:00:00.000Z");
        assert.ok(page.items.length > 0);
      }
    }
  });
}
