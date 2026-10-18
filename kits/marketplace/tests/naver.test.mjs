import test from "node:test";
import assert from "node:assert/strict";
import { createNaverReadOrders } from "../dist/naver.js";
const window = {
  from: "2026-10-17T00:00:00+09:00",
  to: "2026-10-18T00:00:00+09:00",
};
const credentials = {
  clientId: "aaaabbbbcccc",
  clientSecret: "$2a$10$abcdefghijklmnopqrstuv",
  type: "SELF",
};
const json = (value) =>
  new Response(JSON.stringify(value), {
    headers: { "content-type": "application/json" },
  });
const empty = { data: { count: 0, lastChangeStatuses: [] } };
test("authenticates with the official bcrypt vector and reads an empty changed window", async () => {
  const calls = [];
  const reader = createNaverReadOrders({
    connectionId: "shop",
    credentials: async () => credentials,
    now: () => new Date(1643961623299),
    fetch: async (url, init) => {
      calls.push([url, init]);
      return json(
        calls.length === 1
          ? { access_token: "token", expires_in: 10800, token_type: "Bearer" }
          : empty,
      );
    },
  });
  assert.equal(calls.length, 0);
  const page = await reader.execute(window);
  const form = new URLSearchParams(calls[0][1].body);
  assert.equal(
    form.get("client_secret_sign"),
    "JDJhJDEwJGFiY2RlZmdoaWprbG1ub3BxcnN0dXVCVldZSk42T0VPdEx1OFY0cDQxa2IuTnpVaUEzbmsy",
  );
  assert.equal(form.get("grant_type"), "client_credentials");
  assert.equal(
    calls[0][1].headers["Content-Type"],
    "application/x-www-form-urlencoded",
  );
  assert.equal(calls[1][1].headers.Authorization, "Bearer token");
  assert.equal(calls[1][1].redirect, "error");
  assert.deepEqual(page.items, []);
  assert.equal(page.nextCursor, null);
});
const changes = JSON.parse(
  await (await import("node:fs/promises")).readFile(
    new URL("./fixtures/naver-changes.json", import.meta.url),
    "utf8",
  ),
);
const details = await (await import("node:fs/promises")).readFile(
  new URL("./fixtures/naver-details.json", import.meta.url),
  "utf8",
);
function harness(responses, extra = {}) {
  const calls = [];
  const reader = createNaverReadOrders({
    connectionId: "shop",
    credentials: async () => credentials,
    now: () => new Date("2026-10-18T00:00:00Z"),
    fetch: async (url, init) => {
      calls.push([url, init]);
      const response = responses.shift();
      if (response instanceof Response) return response;
      return typeof response === "string"
        ? new Response(response)
        : json(response);
    },
    ...extra,
  });
  return { reader, calls };
}
const auth = { access_token: "token", expires_in: 10800, token_type: "Bearer" };
test("hydrates only requested product orders and preserves identifiers and exact amounts without private fields", async () => {
  const { reader, calls } = harness([auth, changes, details]);
  const page = await reader.execute(window);
  assert.equal(calls[2][1].method, "POST");
  assert.deepEqual(JSON.parse(calls[2][1].body), {
    productOrderIds: ["90071992547409931234"],
  });
  assert.deepEqual(page.items, [{
    ref: {
      market: "naver",
      connectionId: "shop",
      kind: "productOrder",
      id: "90071992547409931234",
    },
    orderId: "90071992547409935678",
    placedAt: "2026-10-17T11:59:00+09:00",
    rawStatus: "PAYED",
    fulfillment: "preparing",
    lines: [{
      id: "90071992547409931234",
      productId: "90071992547409939999",
      title: "Synthetic item",
      quantity: 2,
      unitPrice: { currency: "KRW", amount: "9007199254740993" },
      paidAmount: { currency: "KRW", amount: "18014398509481986" },
    }],
  }]);
  assert.ok(!JSON.stringify(page).includes("PRIVATE"));
});
test("continues at the exact same-timestamp sequence and binds cursors to connection, window, and seller", async () => {
  const more = {
    moreFrom: "2026-10-17T12:00:00.000+09:00",
    moreSequence: "00090071992547409935555",
  };
  const feed = { data: { ...changes.data, more } };
  const { reader, calls } = harness([auth, feed, details, empty]);
  const first = await reader.execute(window);
  assert.ok(first.nextCursor);
  await reader.execute({ ...window, cursor: first.nextCursor });
  const params = new URL(calls[3][0]).searchParams;
  assert.equal(params.get("lastChangedFrom"), more.moreFrom);
  assert.equal(params.get("moreSequence"), more.moreSequence);
  assert.equal(params.get("lastChangedTo"), window.to);
  await assert.rejects(
    reader.execute({
      ...window,
      to: "2026-10-17T22:00:00+09:00",
      cursor: first.nextCursor,
    }),
    { code: "invalidCursor" },
  );
  const other = harness([], { connectionId: "other" });
  await assert.rejects(
    other.reader.execute({ ...window, cursor: first.nextCursor }),
    { code: "invalidCursor" },
  );
  assert.equal(other.calls.length, 0);
  const seller = harness([], {
    credentials: async () => ({
      ...credentials,
      type: "SELLER",
      accountId: "seller",
    }),
  });
  await assert.rejects(
    seller.reader.execute({ ...window, cursor: first.nextCursor }),
    { code: "invalidCursor" },
  );
});
test("fails the entire page when detail identifiers are missing, duplicated or unrequested", async () => {
  for (
    const data of [[], [
      JSON.parse(details).data[0],
      JSON.parse(details).data[0],
    ], [{
      ...JSON.parse(details).data[0],
      productOrder: {
        ...JSON.parse(details).data[0].productOrder,
        productOrderId: "other",
      },
    }]]
  ) {
    const { reader } = harness([auth, changes, { data }]);
    await assert.rejects(reader.execute(window), {
      code: "invalidResponse",
    });
  }
});
test("keeps future product statuses as unknown without exposing the source record", async () => {
  const detail = JSON.parse(details);
  detail.data[0].productOrder.productOrderStatus = "FUTURE_STATUS";
  const { reader } = harness([auth, changes, detail]);
  const page = await reader.execute(window);
  assert.equal(page.items[0].rawStatus, "FUTURE_STATUS");
  assert.equal(page.items[0].fulfillment, "unknown");
});
test("validates window and malformed cursors before any network request", async () => {
  let resolves = 0;
  const { reader, calls } = harness([], {
    credentials: async () => {
      resolves++;
      return credentials;
    },
  });
  await assert.rejects(reader.execute({ ...window, from: window.to }), {
    code: "invalidInput",
  });
  await assert.rejects(
    reader.execute({ ...window, to: "2026-10-19T00:00:00+09:00" }),
    { code: "invalidInput" },
  );
  assert.equal(resolves, 0);
  await assert.rejects(reader.execute({ ...window, cursor: "garbage" }), {
    code: "invalidCursor",
  });
  assert.equal(calls.length, 0);
});
test("rotated credentials acquire their own token and concurrent reads share local issuance", async () => {
  let current = credentials;
  let issues = 0;
  const reader = createNaverReadOrders({
    connectionId: "shop",
    credentials: async () => current,
    fetch: async (url) => {
      if (url.endsWith("/token")) {
        issues++;
        return json(auth);
      }
      return json(empty);
    },
  });
  await Promise.all([reader.execute(window), reader.execute(window)]);
  assert.equal(issues, 1);
  current = { ...credentials, clientId: "rotated" };
  await reader.execute(window);
  assert.equal(issues, 2);
  current = { ...current, type: "SELLER", accountId: "other" };
  await reader.execute(window);
  assert.equal(issues, 3);
});
test("refreshes once on API 401 and masks provider error bodies and credential callback failures", async () => {
  const { reader, calls } = harness([
    auth,
    new Response("SECRET token", { status: 401 }),
    auth,
    empty,
  ]);
  await reader.execute(window);
  assert.equal(calls.length, 4);
  const broken = harness([
    auth,
    new Response("SECRET token", { status: 401 }),
    auth,
    new Response("SECRET token", { status: 401 }),
  ]);
  await assert.rejects(
    broken.reader.execute(window),
    (error) =>
      error.code === "authentication" && !String(error).includes("SECRET"),
  );
  assert.equal(broken.calls.length, 4);
  const callback = harness([], {
    credentials: async () => {
      throw new Error("SECRET");
    },
  });
  await assert.rejects(
    callback.reader.execute(window),
    (error) =>
      error.code === "configuration" && !String(error).includes("SECRET"),
  );
});
test("waits for coordination before reading authentication clock or signing", async () => {
  const events = [];
  const { reader } = harness([auth, empty], {
    now: () => {
      events.push("clock");
      return new Date("2026-10-18T00:00:00Z");
    },
    beforeRequest: async (s) => {
      events.push(s.operation);
    },
  });
  await reader.execute(window);
  assert.deepEqual(events.slice(0, 3), [
    "readOrderChanges",
    "authenticate",
    "clock",
  ]);
});
test("coordinates shared app and seller operation quotas across separate connections without secrets", async () => {
  const scopes = [];
  for (const connectionId of ["one", "two"]) {
    const { reader } = harness([auth, empty], {
      connectionId,
      credentials: async () => ({
        ...credentials,
        type: "SELLER",
        accountId: "seller-a",
      }),
      beforeRequest: async (scope) => {
        scopes.push(scope);
      },
    });
    await reader.execute(window);
  }
  const first = scopes.find((s) =>
    s.connectionId === "one" && s.operation === "readOrderChanges"
  );
  const second = scopes.find((s) =>
    s.connectionId === "two" && s.operation === "readOrderChanges"
  );
  assert.ok(
    first.buckets.some((bucket) =>
      bucket.includes(credentials.clientId) && second.buckets.includes(bucket)
    ),
  );
  assert.ok(
    first.buckets.some((bucket) =>
      bucket.includes("seller-a") && bucket.includes("readOrderChanges")
    ),
  );
  const otherAppScopes = [];
  const otherApp = harness([auth, empty], {
    credentials: async () => ({
      ...credentials,
      clientId: "other-app",
      type: "SELLER",
      accountId: "seller-a",
    }),
    beforeRequest: async (scope) => {
      otherAppScopes.push(scope);
    },
  });
  await otherApp.reader.execute(window);
  const otherAppRead = otherAppScopes.find((s) =>
    s.operation === "readOrderChanges"
  );
  assert.ok(
    first.buckets.some((bucket) =>
      bucket.includes("seller-a") && otherAppRead.buckets.includes(bucket)
    ),
  );
  assert.ok(!JSON.stringify(scopes).includes(credentials.clientSecret));
});
test("cancelling the first token waiter leaves a concurrent read able to finish", async () => {
  let finishToken;
  let startedResolve;
  const started = new Promise((resolve) => {
    startedResolve = resolve;
  });
  let issues = 0;
  const controller = new AbortController();
  const reader = createNaverReadOrders({
    connectionId: "shared",
    credentials: async () => credentials,
    fetch: async (url, init) => {
      if (!url.endsWith("/token")) return json(empty);
      issues++;
      startedResolve();
      return new Promise((resolve, reject) => {
        finishToken = () => resolve(json(auth));
        init.signal.addEventListener(
          "abort",
          () => reject(new Error("aborted")),
          { once: true },
        );
      });
    },
  });
  const first = reader.execute({ ...window, signal: controller.signal });
  const firstRejected = assert.rejects(first, { code: "cancelled" });
  const second = reader.execute(window);
  await started;
  controller.abort();
  finishToken();
  await firstRejected;
  assert.deepEqual((await second).items, []);
  assert.equal(issues, 1);
});
test("rejects unsafe credential identities and bcrypt inputs before signing or requests", async () => {
  for (
    const invalid of [
      { ...credentials, accountId: "unexpected" },
      { ...credentials, type: "SELLER", accountId: 123 },
      { ...credentials, type: "SELLER", accountId: "seller\n" },
      { ...credentials, type: "SELLER", accountId: "x".repeat(257) },
      { ...credentials, clientId: "a".repeat(59) },
      { ...credentials, clientId: "한".repeat(21) },
      { ...credentials, clientId: "bad\n" },
      { ...credentials, clientSecret: "$2a$31$abcdefghijklmnopqrstuv" },
    ]
  ) {
    const { reader, calls } = harness([], { credentials: async () => invalid });
    await assert.rejects(reader.execute(window), { code: "configuration" });
    assert.equal(calls.length, 0);
  }
});
test("rejects unbounded, empty-page, malformed and non-progressing provider positions", async () => {
  for (
    const more of [
      { moreFrom: "2026-10-17T12:00:00+09:00", moreSequence: "x".repeat(1025) },
      { moreFrom: "2026-10-17T24:00:00+09:00", moreSequence: "1" },
      { moreFrom: "2026-10-17T12:00:00+09:00", moreSequence: "x\n" },
    ]
  ) {
    const { reader } = harness([
      auth,
      { data: { ...changes.data, more } },
      details,
    ]);
    await assert.rejects(reader.execute(window), {
      code: "invalidResponse",
    });
  }
  const emptyMore = harness([auth, {
    data: { ...empty.data, more: { moreFrom: window.from, moreSequence: "1" } },
  }]);
  await assert.rejects(emptyMore.reader.execute(window), {
    code: "invalidResponse",
  });
  const firstMore = {
    moreFrom: "2026-10-17T12:00:00+09:00",
    moreSequence: "001",
  };
  const equivalent = { moreFrom: "2026-10-17T03:00:00Z", moreSequence: "001" };
  const loop = harness([
    auth,
    { data: { ...changes.data, more: firstMore } },
    details,
    { data: { ...changes.data, more: equivalent } },
    details,
  ]);
  const first = await loop.reader.execute(window);
  await assert.rejects(
    loop.reader.execute({ ...window, cursor: first.nextCursor }),
    { code: "invalidResponse" },
  );
});
test("rejects malformed order timestamps rather than producing invalid snapshots", async () => {
  const detail = JSON.parse(details);
  detail.data[0].order.orderDate = "2026-10-17T24:00:00+09:00";
  const { reader } = harness([auth, changes, detail]);
  await assert.rejects(reader.execute(window), { code: "invalidResponse" });
});
