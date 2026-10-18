import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createCoupangClient } from "@kimyongin/marketplace-kit/coupang";
import { createNaverClient } from "@kimyongin/marketplace-kit/naver";

// The verifier copies canonical synthetic fixtures alongside this standalone consumer.
const fixture = async (name) =>
  readFile(new URL(`./fixtures/${name}.json`, import.meta.url), "utf8");
const replies = {
  coupang: await fixture("coupang-orders"),
  changes: await fixture("naver-changes"),
  details: await fixture("naver-details"),
};
let calls = 0;
const transport = async (input) => {
  calls += 1;
  const url = new URL(String(input));
  let body;
  if (
    url.hostname === "api-gateway.coupang.com" &&
    url.pathname.endsWith("/ordersheets")
  ) body = replies.coupang;
  else if (
    url.hostname === "api.commerce.naver.com" &&
    url.pathname.endsWith("/oauth2/token")
  ) {
    body =
      '{"access_token":"synthetic-token","token_type":"Bearer","expires_in":10800}';
  } else if (
    url.hostname === "api.commerce.naver.com" &&
    url.pathname.endsWith("/last-changed-statuses")
  ) body = replies.changes;
  else if (
    url.hostname === "api.commerce.naver.com" &&
    url.pathname.endsWith("/product-orders/query")
  ) body = replies.details;
  else throw new Error("Unexpected example request");
  return new Response(body, {
    headers: { "content-type": "application/json" },
  });
};
const now = () => new Date("2026-10-18T03:00:00Z");
const readers = [
  createCoupangClient({
    connectionId: "example-coupang",
    vendorId: "A00000001",
    orderStatus: "ACCEPT",
    credentials: async () => ({
      accessKey: "synthetic-access",
      secretKey: "synthetic-secret",
    }),
    fetch: transport,
    now,
  }),
  createNaverClient({
    connectionId: "example-naver",
    credentials: async () => ({
      clientId: "aaaabbbb",
      clientSecret: "$2a$10$abcdefghijklmnopqrstuv",
      type: "SELF",
    }),
    fetch: transport,
    now,
  }),
];

for (const reader of readers) {
  let committed = { items: [], cursor: null, observedAt: null };
  const page = await reader.readOrders({
    from: "2026-10-18T00:00+09:00",
    to: "2026-10-18T01:00+09:00",
  });
  // A production host replaces this whole-state assignment with one DB transaction.
  // No next page is requested until both records and cursor have been committed.
  const commit = async (next) => {
    committed = next;
  };
  await commit({
    items: page.items,
    cursor: page.nextCursor,
    observedAt: page.observedAt,
  });
  assert.ok(committed.items.length > 0);
  assert.equal(committed.cursor, null);
  assert.equal(committed.items[0].ref.connectionId, `example-${reader.market}`);
  assert.equal(typeof committed.items[0].orderId, "string");
  console.log(
    `${reader.market}: packed reader, signing/auth and atomic host checkpoint example passed`,
  );
}
assert.equal(calls, 4);
