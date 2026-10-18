import { MarketplaceError } from "../domain/errors.js";
import { currentTime } from "../application/clock.js";
import {
  array,
  id,
  integer,
  invalidResponse,
  money,
  object,
  requestJson,
  text,
  validateConnectionId,
  validateDependencies,
} from "./protocol.js";
import type { Money, OrderLine, OrderSnapshot } from "../domain/orders.js";
import type { ClientDependencies } from "./options.js";
import type { OrderSource } from "../application/ports.js";

export type CoupangOrderStatus =
  | "ACCEPT"
  | "INSTRUCT"
  | "DEPARTURE"
  | "DELIVERING"
  | "FINAL_DELIVERY"
  | "NONE_TRACKING";
export interface CoupangCredentials {
  readonly accessKey: string;
  readonly secretKey: string;
}
export interface CoupangClientOptions extends ClientDependencies {
  readonly connectionId: string;
  readonly vendorId: string;
  readonly orderStatus: CoupangOrderStatus;
  readonly credentials: () => Promise<CoupangCredentials>;
}
const states: Record<string, OrderSnapshot["fulfillment"]> = {
  ACCEPT: "pending",
  INSTRUCT: "preparing",
  DEPARTURE: "dispatchRequested",
  DELIVERING: "shipped",
  FINAL_DELIVERY: "delivered",
  NONE_TRACKING: "unknown",
};
function price(value: unknown): Money | undefined {
  if (value === null || value === undefined) return undefined;
  const row = object(value);
  const units = text(row.units);
  if (!/^-?(0|[1-9]\d*)$/.test(units)) invalidResponse();
  const whole = BigInt(units);
  if (whole < -9223372036854775808n || whole > 9223372036854775807n) {
    invalidResponse();
  }
  const nanos = BigInt(integer(row.nanos, -999999999, 999999999));
  if ((whole > 0n && nanos < 0n) || (whole < 0n && nanos > 0n)) {
    invalidResponse();
  }
  const total = whole * 1000000000n + nanos;
  const absolute = total < 0n ? -total : total;
  const fraction = (absolute % 1000000000n).toString().padStart(9, "0").replace(
    /0+$/,
    "",
  );
  return money(
    row.currencyCode,
    `${total < 0n ? "-" : ""}${absolute / 1000000000n}${
      fraction ? `.${fraction}` : ""
    }`,
  );
}
function line(value: unknown): OrderLine {
  const row = object(value);
  const unitPrice = price(row.salesPrice);
  const paidAmount = price(row.orderPrice);
  const quantity = integer(row.shippingCount);
  const cancelledQuantity = integer(row.cancelCount);
  const pendingCancellationQuantity = integer(row.holdCountForCancel);
  if (
    cancelledQuantity > quantity ||
    pendingCancellationQuantity > quantity - cancelledQuantity
  ) invalidResponse();
  return {
    id: id(row.sequenceNo),
    productId: id(row.sellerProductId),
    optionId: id(row.vendorItemId),
    ...(row.vendorItemName === undefined
      ? {}
      : { title: text(row.vendorItemName) }),
    quantity,
    cancelledQuantity,
    pendingCancellationQuantity,
    ...(unitPrice ? { unitPrice } : {}),
    ...(paidAmount ? { paidAmount } : {}),
  };
}
export function createCoupangOrderSource(
  configuration: CoupangClientOptions,
): OrderSource {
  const options = { ...configuration };
  validateConnectionId(options.connectionId);
  validateDependencies(options);
  if (
    !/^[A-Za-z0-9_-]{1,64}$/.test(options.vendorId) ||
    !Object.hasOwn(states, options.orderStatus) ||
    typeof options.credentials !== "function"
  ) {
    throw new MarketplaceError(
      "configuration",
      "A vendor, supported order status and credential resolver are required.",
    );
  }
  return {
    market: "coupang",
    async readPage(query) {
      if (query.cursor !== undefined) {
        throw new MarketplaceError(
          "invalidCursor",
          "Minute-window reads do not support cursors.",
        );
      }
      const minute = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}\+09:00$/;
      const valid = (value: string) =>
        minute.test(value) && Number.isFinite(Date.parse(value)) &&
        new Date(Date.parse(value) + 9 * 3600000).toISOString().slice(0, 16) ===
          value.slice(0, 16);
      const duration = Date.parse(query.to) - Date.parse(query.from);
      if (
        !valid(query.from) || !valid(query.to) || duration <= 0 ||
        duration >= 86400000 ||
        query.from.slice(0, 10) !== query.to.slice(0, 10)
      ) {
        throw new MarketplaceError(
          "invalidInput",
          "Provide a same-day KST minute window shorter than 24 hours.",
        );
      }
      const path =
        `/v2/providers/openapi/apis/api/v5/vendors/${options.vendorId}/ordersheets`;
      const parameters = new URLSearchParams({
        createdAtFrom: query.from,
        createdAtTo: query.to,
        searchType: "timeFrame",
        status: options.orderStatus,
      });
      const url = `https://api-gateway.coupang.com${path}?${parameters}`;
      const response = object(
        await requestJson(
          url,
          async () => {
            let credentials: CoupangCredentials;
            try {
              credentials = await options.credentials();
            } catch {
              throw new MarketplaceError(
                "configuration",
                "Signing credentials could not be resolved.",
              );
            }
            if (
              !credentials || typeof credentials.accessKey !== "string" ||
              !/^[A-Za-z0-9_-]{1,256}$/.test(credentials.accessKey) ||
              typeof credentials.secretKey !== "string" ||
              credentials.secretKey.length === 0 ||
              credentials.secretKey.length > 4096
            ) {
              throw new MarketplaceError(
                "configuration",
                "Valid signing credentials are required.",
              );
            }
            const date =
              currentTime(options.now).toISOString().replace(/[-:]/g, "")
                .slice(2, 15) + "Z";
            const key = await crypto.subtle.importKey(
              "raw",
              new TextEncoder().encode(credentials.secretKey),
              { name: "HMAC", hash: "SHA-256" },
              false,
              ["sign"],
            );
            const signed = await crypto.subtle.sign(
              "HMAC",
              key,
              new TextEncoder().encode(
                date + "GET" + path + parameters.toString(),
              ),
            );
            const signature = Array.from(
              new Uint8Array(signed),
              (byte) => byte.toString(16).padStart(2, "0"),
            ).join("");
            return {
              method: "GET",
              headers: {
                Authorization:
                  `CEA algorithm=HmacSHA256, access-key=${credentials.accessKey}, signed-date=${date}, signature=${signature}`,
                "X-MARKET": "KR",
                "Content-Type": "application/json;charset=UTF-8",
                Accept: "application/json",
              },
            };
          },
          options,
          {
            market: "coupang",
            connectionId: options.connectionId,
            operation: "readOrders",
            buckets: [`coupang:vendor:${options.vendorId}`],
          },
          query.signal,
        ),
      );
      if (integer(response.code, 100, 599) !== 200) {
        throw new MarketplaceError(
          "providerRejected",
          "The provider rejected the read.",
        );
      }
      if (response.nextToken !== "") invalidResponse();
      const items = array(response.data).map((value) => {
        const row = object(value);
        const rawStatus = text(row.status);
        const placedAt = text(row.orderedAt);
        if (
          !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/
            .test(placedAt) || !Number.isFinite(Date.parse(placedAt))
        ) invalidResponse();
        const shipmentId = id(row.shipmentBoxId);
        const lines = array(row.orderItems).map(line);
        return {
          ref: {
            market: "coupang" as const,
            connectionId: options.connectionId,
            kind: "shipment" as const,
            id: shipmentId,
          },
          orderId: id(row.orderId),
          placedAt,
          rawStatus,
          fulfillment: Object.hasOwn(states, rawStatus)
            ? states[rawStatus]!
            : "unknown",
          lines,
        };
      });
      return {
        items,
        nextCursor: null,
        coverage: {
          kind: "statusWindow",
          from: query.from,
          to: query.to,
          status: options.orderStatus,
        },
      };
    },
  };
}
