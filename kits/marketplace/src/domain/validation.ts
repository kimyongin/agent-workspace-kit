import type { Market, OrderLine, OrderPage, OrderSnapshot } from "./orders.js";

/** Internal, value-free diagnostics; callers map these to their public error contract. */
export class OrderModelError extends Error {
  constructor(readonly path: string, readonly reason: string) {
    super(`${path}: ${reason}`);
    this.name = "OrderModelError";
  }
}

function fail(path: string, reason: string): never {
  throw new OrderModelError(path, reason);
}
function object(value: unknown, path: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    fail(path, "Expected an object.");
  }
  return value as Record<string, unknown>;
}
function text(value: unknown, path: string): asserts value is string {
  if (typeof value !== "string" || value.length === 0) {
    fail(path, "Expected a nonempty string.");
  }
}
export function assertIdentifier(
  value: unknown,
  path: string,
): asserts value is string {
  text(value, path);
  if (value.length > 256 || /[\u0000-\u001f]/.test(value)) {
    fail(
      path,
      "Expected an identifier of at most 256 characters without control characters.",
    );
  }
}
export function assertMarket(
  value: unknown,
  path: string,
): asserts value is Market {
  if (value !== "coupang" && value !== "naver") {
    fail(path, "Expected a supported market.");
  }
}
export function assertTimestamp(
  value: unknown,
  path: string,
): asserts value is string {
  text(value, path);
  if (
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,9})?)?(?:Z|[+-]\d{2}:\d{2})$/
      .test(value) ||
    !Number.isFinite(Date.parse(value)) || Number(value.slice(11, 13)) > 23 ||
    Number(value.slice(14, 16)) > 59 ||
    (value[16] === ":" && Number(value.slice(17, 19)) > 59)
  ) fail(path, "Expected a valid ISO timestamp with timezone.");
  const day = new Date(value.slice(0, 10) + "T00:00:00Z");
  if (
    !Number.isFinite(day.getTime()) ||
    day.toISOString().slice(0, 10) !== value.slice(0, 10)
  ) {
    fail(path, "Expected an existing calendar date.");
  }
}
export function assertWindow(from: unknown, to: unknown, path: string): void {
  assertTimestamp(from, `${path}.from`);
  assertTimestamp(to, `${path}.to`);
  if (Date.parse(to) <= Date.parse(from)) {
    fail(`${path}.to`, "Expected a time after from.");
  }
}
function quantity(value: unknown, path: string): asserts value is number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    fail(path, "Expected a nonnegative safe integer.");
  }
}
function money(value: unknown, path: string): void {
  const row = object(value, path);
  if (typeof row.currency !== "string" || !/^[A-Z]{3}$/.test(row.currency)) {
    fail(`${path}.currency`, "Expected a three-letter currency code.");
  }
  if (
    typeof row.amount !== "string" ||
    !/^-?(0|[1-9]\d*)(\.\d+)?$/.test(row.amount)
  ) {
    fail(`${path}.amount`, "Expected an exact decimal string.");
  }
}
function array(value: unknown, path: string): unknown[] {
  if (!Array.isArray(value)) fail(path, "Expected an array.");
  return value;
}

export function assertOrderLine(
  value: unknown,
  path: string,
): asserts value is OrderLine {
  const row = object(value, path);
  assertIdentifier(row.id, `${path}.id`);
  assertIdentifier(row.productId, `${path}.productId`);
  if (row.optionId !== undefined) {
    assertIdentifier(row.optionId, `${path}.optionId`);
  }
  if (row.title !== undefined) text(row.title, `${path}.title`);
  quantity(row.quantity, `${path}.quantity`);
  for (
    const field of ["cancelledQuantity", "pendingCancellationQuantity"] as const
  ) {
    if (row[field] !== undefined) quantity(row[field], `${path}.${field}`);
  }
  const cancelled = (row.cancelledQuantity ?? 0) as number;
  const pending = (row.pendingCancellationQuantity ?? 0) as number;
  if (cancelled > row.quantity) {
    fail(`${path}.cancelledQuantity`, "Cannot exceed quantity.");
  }
  if (pending > row.quantity - cancelled) {
    fail(
      `${path}.pendingCancellationQuantity`,
      "Cannot exceed the remaining quantity.",
    );
  }
  if (row.unitPrice !== undefined) money(row.unitPrice, `${path}.unitPrice`);
  if (row.paidAmount !== undefined) money(row.paidAmount, `${path}.paidAmount`);
}

export interface OrderScope {
  readonly market?: Market;
  readonly connectionId?: string;
}
export function assertOrderSnapshot(
  value: unknown,
  path: string,
  scope: OrderScope = {},
): asserts value is OrderSnapshot {
  const row = object(value, path);
  const ref = object(row.ref, `${path}.ref`);
  assertMarket(ref.market, `${path}.ref.market`);
  if (scope.market !== undefined && ref.market !== scope.market) {
    fail(`${path}.ref.market`, "Must match the selected market.");
  }
  assertIdentifier(ref.connectionId, `${path}.ref.connectionId`);
  if (
    scope.connectionId !== undefined && ref.connectionId !== scope.connectionId
  ) {
    fail(`${path}.ref.connectionId`, "Must match the selected connection.");
  }
  if (ref.kind !== (ref.market === "coupang" ? "shipment" : "productOrder")) {
    fail(`${path}.ref.kind`, "Must match the market's order unit.");
  }
  assertIdentifier(ref.id, `${path}.ref.id`);
  assertIdentifier(row.orderId, `${path}.orderId`);
  assertTimestamp(row.placedAt, `${path}.placedAt`);
  text(row.rawStatus, `${path}.rawStatus`);
  if (
    ![
      "pending",
      "preparing",
      "dispatchRequested",
      "shipped",
      "delivered",
      "unknown",
    ].includes(row.fulfillment as string)
  ) {
    fail(
      `${path}.fulfillment`,
      "Expected a supported normalized fulfillment state.",
    );
  }
  const identities = new Set<string>();
  for (const [index, line] of array(row.lines, `${path}.lines`).entries()) {
    const at = `${path}.lines[${index}]`;
    assertOrderLine(line, at);
    if (identities.has(line.id)) {
      fail(`${at}.id`, "Duplicate line identifier within this order.");
    }
    identities.add(line.id);
  }
}

export interface OrderPageScope extends OrderScope {
  readonly request?: { readonly from: string; readonly to: string };
}
export function assertOrderPage(
  value: unknown,
  path: string,
  scope: OrderPageScope = {},
): asserts value is OrderPage {
  const page = object(value, path);
  if (scope.market !== undefined) assertMarket(scope.market, `${path}.market`);
  if (scope.connectionId !== undefined) {
    assertIdentifier(scope.connectionId, `${path}.connectionId`);
  }
  assertTimestamp(page.observedAt, `${path}.observedAt`);
  if (
    page.nextCursor !== null &&
    (typeof page.nextCursor !== "string" || page.nextCursor.length === 0 ||
      page.nextCursor.length > 16384)
  ) {
    fail(
      `${path}.nextCursor`,
      "Expected null or a nonempty cursor of at most 16384 characters.",
    );
  }
  const coverage = object(page.coverage, `${path}.coverage`);
  if (coverage.kind !== "changedWindow" && coverage.kind !== "statusWindow") {
    fail(`${path}.coverage.kind`, "Expected changedWindow or statusWindow.");
  }
  if (
    scope.market !== undefined &&
    coverage.kind !==
      (scope.market === "coupang" ? "statusWindow" : "changedWindow")
  ) {
    fail(
      `${path}.coverage.kind`,
      "Must match the selected market's query meaning.",
    );
  }
  assertWindow(coverage.from, coverage.to, `${path}.coverage`);
  if (scope.request !== undefined) {
    for (const field of ["from", "to"] as const) {
      if (coverage[field] !== scope.request[field]) {
        fail(`${path}.coverage.${field}`, "Must match the requested window.");
      }
    }
  }
  if (coverage.status !== undefined) {
    text(coverage.status, `${path}.coverage.status`);
  }
  const identities = new Set<string>();
  let connectionId = scope.connectionId;
  for (const [index, order] of array(page.items, `${path}.items`).entries()) {
    const at = `${path}.items[${index}]`;
    assertOrderSnapshot(order, at, {
      ...scope,
      ...(connectionId !== undefined ? { connectionId } : {}),
    });
    connectionId ??= order.ref.connectionId;
    const identity = JSON.stringify([order.ref.kind, order.ref.id]);
    if (identities.has(identity)) {
      fail(
        `${at}.ref.id`,
        "Duplicate order snapshot identifier within this page.",
      );
    }
    identities.add(identity);
  }
}
