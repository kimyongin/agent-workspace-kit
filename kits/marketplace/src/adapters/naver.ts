import { hash } from "bcryptjs";
import { MarketplaceError } from "../domain/errors.js";
import { currentTime } from "../application/clock.js";
import {
  array,
  cursorScope,
  decodeCursor,
  encodeCursor,
  id,
  integer,
  invalidResponse,
  money,
  object,
  requestJson,
  text,
  validateConnectionId,
  validateDependencies,
  validateWindow,
} from "./protocol.js";
import type { OrderSnapshot } from "../domain/orders.js";
import type { ClientDependencies, RequestScope } from "./options.js";
import type { OrderSource } from "../application/ports.js";

export interface NaverCredentials {
  readonly clientId: string;
  readonly clientSecret: string;
  readonly type: "SELF" | "SELLER";
  readonly accountId?: string;
}
export interface NaverReadOrdersOptions extends ClientDependencies {
  readonly connectionId: string;
  readonly credentials: () => Promise<NaverCredentials>;
}
const base = "https://api.commerce.naver.com/external";
function timestamp(input: unknown): string {
  const value = text(input);
  if (
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/
      .test(value) ||
    !Number.isFinite(Date.parse(value)) || Number(value.slice(11, 13)) > 23 ||
    Number(value.slice(14, 16)) > 59 ||
    (value[16] === ":" && Number(value.slice(17, 19)) > 59)
  ) invalidResponse();
  const date = new Date(value.slice(0, 10) + "T00:00:00Z");
  if (
    !Number.isFinite(date.valueOf()) ||
    date.toISOString().slice(0, 10) !== value.slice(0, 10)
  ) invalidResponse();
  return value;
}
function continuationSequence(input: unknown): string {
  const value = text(input);
  if (value.length > 1024 || /[\u0000-\u001f\u007f]/.test(value)) {
    invalidResponse();
  }
  return value;
}
export function createNaverOrderSource(
  input: NaverReadOrdersOptions,
): OrderSource {
  const options = { ...input };
  validateConnectionId(options.connectionId);
  validateDependencies(options);
  if (typeof options.credentials !== "function") {
    throw new MarketplaceError(
      "configuration",
      "A credentials provider is required.",
    );
  }
  const now = () => currentTime(options.now);
  const tokens = new Map<string, { value: string; expiresAt: number }>();
  const pending = new Map<string, Promise<string>>();
  const scope = (operation: string, value: NaverCredentials): RequestScope => ({
    market: "naver",
    connectionId: options.connectionId,
    operation,
    buckets: [
      JSON.stringify(["naver", "app", value.clientId]),
      JSON.stringify(["naver", "appOperation", value.clientId, operation]),
      JSON.stringify([
        "naver",
        value.type,
        value.type === "SELLER" ? value.accountId : value.clientId,
      ]),
      JSON.stringify([
        "naver",
        value.type,
        value.type === "SELLER" ? value.accountId : value.clientId,
        operation,
      ]),
    ],
  });
  async function credentials(): Promise<NaverCredentials> {
    try {
      const value = await options.credentials();
      const identity = (entry: unknown, maximum: number): entry is string =>
        typeof entry === "string" &&
        entry.length > 0 && entry.length <= maximum && entry.trim() === entry &&
        !/[\u0000-\u001f\u007f]/.test(entry);
      if (
        !value || !identity(value.clientId, 58) ||
        new TextEncoder().encode(value.clientId).length > 58 ||
        typeof value.clientSecret !== "string" ||
        !/^\$2[aby]\$(?:0[4-9]|1[0-2])\$[./A-Za-z0-9]{22}$/.test(
          value.clientSecret,
        ) ||
        !["SELF", "SELLER"].includes(value.type) ||
        (value.type === "SELLER"
          ? !identity(value.accountId, 256)
          : value.accountId !== undefined)
      ) throw new Error();
      return { ...value };
    } catch {
      throw new MarketplaceError(
        "configuration",
        "Valid Naver credentials are required.",
      );
    }
  }
  const keyOf = (value: NaverCredentials) =>
    JSON.stringify([
      value.clientId,
      value.clientSecret,
      value.type,
      value.accountId ?? "",
    ]);
  function waitForToken<T>(
    promise: Promise<T>,
    signal: AbortSignal | undefined,
    callerSignal?: AbortSignal,
  ): Promise<T> {
    if (!signal) return promise;
    return new Promise<T>((resolve, reject) => {
      const abort = () =>
        reject(
          new MarketplaceError(
            callerSignal?.aborted ? "cancelled" : "transport",
            "The provider read did not complete.",
          ),
        );
      if (signal.aborted) abort();
      else signal.addEventListener("abort", abort, { once: true });
      promise.then(resolve, reject).finally(() =>
        signal.removeEventListener("abort", abort)
      );
    });
  }
  async function token(
    value: NaverCredentials,
    signal?: AbortSignal,
    callerSignal?: AbortSignal,
  ): Promise<string> {
    const key = keyOf(value);
    const cached = tokens.get(key);
    if (cached && cached.expiresAt > now().getTime() + 30_000) {
      return cached.value;
    }
    const active = pending.get(key);
    if (active) return waitForToken(active, signal, callerSignal);
    const deadline = AbortSignal.timeout(options.timeoutMs ?? 15_000);
    const promise = (async () => {
      const result = object(
        await waitForToken(
          requestJson(
            `${base}/v1/oauth2/token`,
            async () => {
              const timestamp = String(now().getTime());
              const password = `${value.clientId}_${timestamp}`;
              if (
                new TextEncoder().encode(password).length > 72 ||
                !/^\d+$/.test(timestamp)
              ) {
                throw new MarketplaceError(
                  "configuration",
                  "The authentication timestamp or client identifier is invalid.",
                );
              }
              const signature = btoa(await hash(password, value.clientSecret));
              const form = new URLSearchParams({
                client_id: value.clientId,
                timestamp,
                grant_type: "client_credentials",
                client_secret_sign: signature,
                type: value.type,
              });
              if (value.accountId !== undefined) {
                form.set(
                  "account_id",
                  value.accountId,
                );
              }
              return {
                method: "POST",
                headers: {
                  "Content-Type": "application/x-www-form-urlencoded",
                },
                body: form.toString(),
              };
            },
            options,
            scope("authenticate", value),
            deadline,
          ),
          deadline,
        ),
      );
      const access = text(result.access_token);
      const lifetime = integer(result.expires_in, 1, 86_400);
      if (
        text(result.token_type).toLowerCase() !== "bearer" ||
        /[\r\n]/.test(access)
      ) invalidResponse();
      tokens.set(key, {
        value: access,
        expiresAt: now().getTime() + lifetime * 1000,
      });
      return access;
    })().finally(() => {
      if (pending.get(key) === promise) pending.delete(key);
    });
    pending.set(key, promise);
    return waitForToken(promise, signal, callerSignal);
  }
  async function api(
    path: string,
    init: RequestInit,
    value: NaverCredentials,
    operation: string,
    signal?: AbortSignal,
  ): Promise<unknown> {
    let used: string | undefined;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        return await requestJson(
          `${base}${path}`,
          async (requestSignal) => {
            used = await token(value, requestSignal, signal);
            return {
              ...init,
              headers: { ...init.headers, Authorization: `Bearer ${used}` },
            };
          },
          options,
          scope(operation, value),
          signal,
        );
      } catch (error) {
        if (
          !(error instanceof MarketplaceError) ||
          error.code !== "authentication" || attempt !== 0 || used === undefined
        ) throw error;
        const key = keyOf(value);
        if (tokens.get(key)?.value === used) tokens.delete(key);
      }
    }
    return invalidResponse();
  }
  return {
    market: "naver",
    async readPage(query) {
      validateWindow(query, 86_400_000);
      if (query.signal?.aborted) {
        throw new MarketplaceError(
          "cancelled",
          "The read was cancelled.",
        );
      }
      const value = await credentials();
      const bound = cursorScope(
        "naver",
        options.connectionId,
        query,
        JSON.stringify([value.clientId, value.type, value.accountId ?? ""]),
      );
      const cursor = decodeCursor(query.cursor, bound);
      let from = query.from;
      let sequence: string | undefined;
      if (cursor !== undefined) {
        try {
          const position = object(cursor);
          from = timestamp(position.moreFrom);
          sequence = continuationSequence(position.moreSequence);
          if (
            !Number.isFinite(Date.parse(from)) ||
            Date.parse(from) < Date.parse(query.from) ||
            Date.parse(from) > Date.parse(query.to)
          ) throw new Error();
        } catch {
          throw new MarketplaceError(
            "invalidCursor",
            "The cursor contains an invalid provider position.",
          );
        }
      }
      const params = new URLSearchParams({
        lastChangedFrom: from,
        lastChangedTo: query.to,
        limitCount: "300",
      });
      if (sequence !== undefined) params.set("moreSequence", sequence);
      const feed = object(
        object(
          await api(
            `/v1/pay-order/seller/product-orders/last-changed-statuses?${params}`,
            { method: "GET" },
            value,
            "readOrderChanges",
            query.signal,
          ),
        ).data,
      );
      const changes = array(feed.lastChangeStatuses);
      if (
        changes.length > 300 || integer(feed.count, 0, 300) !== changes.length
      ) invalidResponse();
      const ids = changes.map((entry) => id(object(entry).productOrderId));
      if (new Set(ids).size !== ids.length) invalidResponse();
      const records = ids.length === 0 ? [] : array(
        object(
          await api(
            "/v1/pay-order/seller/product-orders/query",
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ productOrderIds: ids }),
            },
            value,
            "readOrderDetails",
            query.signal,
          ),
        ).data,
      );
      const requested = new Set(ids);
      const seen = new Set<string>();
      const items: OrderSnapshot[] = records.map((record) => {
        const detail = object(record);
        const order = object(detail.order);
        const product = object(detail.productOrder);
        const productOrderId = id(product.productOrderId);
        if (
          !requested.has(productOrderId) || seen.has(productOrderId)
        ) invalidResponse();
        seen.add(productOrderId);
        const status = text(product.productOrderStatus);
        const fulfillment = status === "PAYMENT_WAITING"
          ? "pending"
          : status === "PAYED"
          ? "preparing"
          : status === "DELIVERING"
          ? "shipped"
          : ["DELIVERED", "PURCHASE_DECIDED"].includes(status)
          ? "delivered"
          : "unknown";
        return {
          ref: {
            market: "naver",
            connectionId: options.connectionId,
            kind: "productOrder",
            id: productOrderId,
          },
          orderId: id(order.orderId),
          placedAt: timestamp(order.orderDate),
          rawStatus: status,
          fulfillment,
          lines: [{
            id: productOrderId,
            productId: id(product.productId),
            quantity: integer(product.quantity, 0),
            ...(product.productName !== undefined
              ? { title: text(product.productName) }
              : {}),
            ...(product.unitPrice !== undefined
              ? { unitPrice: money("KRW", product.unitPrice) }
              : {}),
            ...(product.totalPaymentAmount !== undefined
              ? { paidAmount: money("KRW", product.totalPaymentAmount) }
              : {}),
          }],
        };
      });
      if (seen.size !== requested.size) invalidResponse();
      let nextCursor: string | null = null;
      if (feed.more !== undefined && feed.more !== null) {
        const more = object(feed.more);
        const moreFrom = timestamp(more.moreFrom);
        const moreSequence = continuationSequence(more.moreSequence);
        if (
          changes.length === 0 || Date.parse(moreFrom) < Date.parse(from) ||
          Date.parse(moreFrom) > Date.parse(query.to) ||
          (Date.parse(moreFrom) === Date.parse(from) &&
            moreSequence === sequence)
        ) invalidResponse();
        nextCursor = encodeCursor(bound, { moreFrom, moreSequence });
        if (nextCursor.length > 16_384) invalidResponse();
      }
      return {
        items,
        nextCursor,
        coverage: { kind: "changedWindow", from: query.from, to: query.to },
      };
    },
  };
}
