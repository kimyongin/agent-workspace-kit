import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createHmac } from "node:crypto";
import { createCoupangReadOrders } from "../dist/coupang.js";
const fixture = await readFile(
  new URL("./fixtures/coupang-orders.json", import.meta.url),
  "utf8",
);
const query = { from: "2026-10-18T10:00+09:00", to: "2026-10-18T10:59+09:00" };
const credentials = async () => ({
  accessKey: "synthetic-access",
  secretKey: "synthetic-secret",
});
const options = (extra = {}) => ({
  connectionId: "connection-1",
  vendorId: "A00012345",
  orderStatus: "ACCEPT",
  credentials,
  now: () => new Date("2026-10-18T01:00:00Z"),
  fetch: async () => new Response(fixture),
  ...extra,
});
test("reads v5 shipment identity, quantities and exact money without buyer fields", async () => {
  const page = await createCoupangReadOrders(options()).execute(query);
  assert.deepEqual(page, {
    items: [{
      ref: {
        market: "coupang",
        connectionId: "connection-1",
        kind: "shipment",
        id: "90071992547409931",
      },
      orderId: "90071992547409933",
      placedAt: "2026-10-18T10:01:12.123456+09:00",
      rawStatus: "ACCEPT",
      fulfillment: "pending",
      lines: [{
        id: "001",
        productId: "90071992547409935",
        optionId: "90071992547409937",
        title: "Synthetic item",
        quantity: 3,
        cancelledQuantity: 1,
        pendingCancellationQuantity: 1,
        unitPrice: { currency: "KRW", amount: "9007199254740993.125000001" },
        paidAmount: { currency: "KRW", amount: "27021597764222979.375000003" },
      }],
    }],
    nextCursor: null,
    observedAt: "2026-10-18T01:00:00.000Z",
    coverage: {
      kind: "statusWindow",
      from: query.from,
      to: query.to,
      status: "ACCEPT",
    },
  });
});

test("rejects unsupported cursors and non-minute same-KST-day windows before callbacks", async () => {
  let callbacks = 0;
  const client = createCoupangReadOrders(options({
    credentials: async () => {
      callbacks++;
      return credentials();
    },
    beforeRequest: async () => {
      callbacks++;
    },
    fetch: async () => {
      callbacks++;
      return new Response(fixture);
    },
  }));
  for (
    const invalid of [
      { ...query, cursor: "" },
      { ...query, cursor: "opaque" },
      { ...query, from: "2026-10-18T10:00:01+09:00" },
      { ...query, to: "2026-10-19T10:00+09:00" },
      { ...query, to: "2026-10-19T00:00+09:00" },
      { ...query, to: query.from },
      {
        ...query,
        from: "2026-02-30T10:00+09:00",
        to: "2026-02-30T10:01+09:00",
      },
    ]
  ) {
    await assert.rejects(client.execute(invalid), {
      code: invalid.cursor !== undefined ? "invalidCursor" : "invalidInput",
    });
  }
  assert.equal(callbacks, 0);
});
test("signs the exact encoded fixed-host request after coordination with fresh UTC time", async () => {
  let gated = false;
  let captured;
  const client = createCoupangReadOrders(options({
    beforeRequest: async (scope) => {
      assert.equal(scope.market, "coupang");
      gated = true;
    },
    credentials: async () => {
      assert.equal(gated, true);
      return credentials();
    },
    now: () =>
      new Date(gated ? "2026-10-18T01:02:03Z" : "2026-10-18T00:00:00Z"),
    fetch: async (url, init) => {
      captured = { url, init };
      return new Response(fixture);
    },
  }));
  assert.equal(gated, false);
  await client.execute(query);
  const url = new URL(captured.url);
  assert.equal(url.origin, "https://api-gateway.coupang.com");
  assert.equal(
    url.pathname,
    "/v2/providers/openapi/apis/api/v5/vendors/A00012345/ordersheets",
  );
  assert.equal(
    url.search,
    "?createdAtFrom=2026-10-18T10%3A00%2B09%3A00&createdAtTo=2026-10-18T10%3A59%2B09%3A00&searchType=timeFrame&status=ACCEPT",
  );
  const known = createHmac("sha256", "synthetic-secret").update(
    "261018T010203ZGET" + url.pathname + url.search.slice(1),
  ).digest("hex");
  const headers = new Headers(captured.init.headers);
  assert.equal(
    headers.get("authorization"),
    `CEA algorithm=HmacSHA256, access-key=synthetic-access, signed-date=261018T010203Z, signature=${known}`,
  );
  assert.equal(headers.get("x-market"), "KR");
  assert.equal(headers.get("content-type"), "application/json;charset=UTF-8");
  assert.equal(captured.init.redirect, "error");
});
test("unknown provider statuses stay unknown and null money is omitted", async () => {
  for (const status of ["FUTURE_STATE", "toString", "__proto__"]) {
    const body = JSON.parse(fixture);
    body.data[0].status = status;
    body.data[0].orderItems[0].salesPrice = null;
    body.data[0].orderItems[0].orderPrice = null;
    const page = await createCoupangReadOrders(
      options({ fetch: async () => new Response(JSON.stringify(body)) }),
    ).execute(query);
    assert.equal(page.items[0].fulfillment, "unknown");
    assert.equal("unitPrice" in page.items[0].lines[0], false);
    assert.equal("paidAmount" in page.items[0].lines[0], false);
  }
});
test("binds connection configuration and distinguishes dispatch instruction from shipment", async () => {
  const body = fixture.replace('"status": "ACCEPT"', '"status": "DEPARTURE"');
  const config = options({ fetch: async () => new Response(body) });
  const client = createCoupangReadOrders(config);
  config.connectionId = "changed";
  config.vendorId = "changed";
  config.orderStatus = "DELIVERING";
  const page = await client.execute(query);
  assert.equal(page.items[0].ref.connectionId, "connection-1");
  assert.equal(page.coverage.status, "ACCEPT");
  assert.equal(page.items[0].fulfillment, "dispatchRequested");
});
test("rejects malformed credentials before network and never exposes resolver errors", async () => {
  for (
    const bad of [{ accessKey: "", secretKey: "secret" }, {
      accessKey: "abc, signed-date=evil",
      secretKey: "secret",
    }, { accessKey: "abc", secretKey: "" }]
  ) {
    let fetched = false;
    await assert.rejects(
      createCoupangReadOrders(options({
        credentials: async () => bad,
        fetch: async () => {
          fetched = true;
          return new Response(fixture);
        },
      })).execute(query),
      { code: "configuration" },
    );
    assert.equal(fetched, false);
  }
  await assert.rejects(
    createCoupangReadOrders(options({
      credentials: async () => {
        throw new Error("synthetic-private-secret");
      },
    })).execute(query),
    (error) =>
      error.code === "configuration" &&
      !JSON.stringify(error).includes("synthetic-private-secret") &&
      !error.stack.includes("synthetic-private-secret"),
  );
});
test("fails closed on malformed response, incomplete minute results and unsafe quantities", async () => {
  const original = JSON.parse(fixture);
  for (
    const body of [
      null,
      {},
      { code: 200, data: [], nextToken: "more" },
      { code: 200, data: {}, nextToken: "" },
      { ...original, data: [{ ...original.data[0], orderedAt: "invalid" }] },
      {
        ...original,
        data: [{
          ...original.data[0],
          orderItems: [{
            ...original.data[0].orderItems[0],
            shippingCount: 1.5,
          }],
        }],
      },
      {
        ...original,
        data: [{
          ...original.data[0],
          orderItems: [{
            ...original.data[0].orderItems[0],
            sellerProductId: null,
          }],
        }],
      },
      {
        ...original,
        data: [{
          ...original.data[0],
          orderItems: [{
            ...original.data[0].orderItems[0],
            salesPrice: { currencyCode: "KRW", units: 1, nanos: 1000000000 },
          }],
        }],
      },
    ]
  ) {
    await assert.rejects(
      createCoupangReadOrders(
        options({ fetch: async () => new Response(JSON.stringify(body)) }),
      ).execute(query),
      { code: "invalidResponse" },
    );
  }
});
test("HTTP failures expose only safe categories and retry delay, never provider bodies", async () => {
  for (
    const [status, code] of [
      [401, "authentication"],
      [403, "permissionDenied"],
      [429, "rateLimited"],
      [500, "providerRejected"],
    ]
  ) {
    await assert.rejects(
      createCoupangReadOrders(options({
        fetch: async () =>
          new Response("private-address synthetic-secret", {
            status,
            headers: { "Retry-After": "12" },
          }),
      })).execute(query),
      (error) => {
        assert.equal(error.code, code);
        assert.equal(error.status, status);
        assert.equal(error.retryAfterSeconds, 12);
        assert.equal(
          (error.stack + JSON.stringify(error)).includes("private-address"),
          false,
        );
        assert.equal(
          (error.stack + JSON.stringify(error)).includes("synthetic-secret"),
          false,
        );
        return true;
      },
    );
  }
  await assert.rejects(
    createCoupangReadOrders(options({
      fetch: async () =>
        new Response('{"code":500,"message":"private-address"}'),
    })).execute(query),
    { code: "providerRejected" },
  );
});
test("cancellation prevents callbacks, and transport failures have safe messages", async () => {
  let calls = 0;
  const controller = new AbortController();
  controller.abort();
  const client = createCoupangReadOrders(options({
    credentials: async () => {
      calls++;
      return credentials();
    },
    beforeRequest: async () => {
      calls++;
    },
    fetch: async () => {
      calls++;
      throw Error("synthetic-secret");
    },
  }));
  assert.equal(calls, 0);
  await assert.rejects(
    client.execute({ ...query, signal: controller.signal }),
    { code: "cancelled" },
  );
  assert.equal(calls, 0);
  await assert.rejects(
    client.execute(query),
    (error) =>
      error.code === "transport" && !error.stack.includes("synthetic-secret"),
  );
});
test("empty complete results return a bounded status window without invented cursor", async () => {
  const page = await createCoupangReadOrders(
    options({
      fetch: async () => new Response('{"code":200,"data":[],"nextToken":""}'),
    }),
  ).execute(query);
  assert.deepEqual(page.items, []);
  assert.equal(page.nextCursor, null);
  assert.equal(page.coverage.kind, "statusWindow");
});
test("rejects duplicate shipment and line identities and impossible cancellation quantities", async () => {
  const original = JSON.parse(fixture);
  const shipment = original.data[0];
  const item = shipment.orderItems[0];
  for (
    const data of [
      [shipment, shipment],
      [{ ...shipment, orderItems: [item, item] }],
      [{
        ...shipment,
        orderItems: [{ ...item, cancelCount: 2, holdCountForCancel: 2 }],
      }],
    ]
  ) {
    await assert.rejects(
      createCoupangReadOrders(
        options({
          fetch: async () =>
            new Response(JSON.stringify({ ...original, data })),
        }),
      ).execute(query),
      { code: "invalidResponse" },
    );
  }
});
test("coordination keys include provider namespace", async () => {
  await createCoupangReadOrders(
    options({
      beforeRequest: async (scope) =>
        assert.deepEqual(scope.buckets, ["coupang:vendor:A00012345"]),
    }),
  ).execute(query);
});
