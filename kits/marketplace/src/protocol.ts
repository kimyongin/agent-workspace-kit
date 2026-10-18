import { parse } from "lossless-json";
import { MarketplaceError } from "./errors.js";
import type {
  ClientDependencies,
  Money,
  ReadOrdersQuery,
  RequestScope,
} from "./types.js";

export function object(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    invalidResponse();
  }
  return value as Record<string, unknown>;
}
export function array(value: unknown): unknown[] {
  if (!Array.isArray(value)) invalidResponse();
  return value;
}
export function text(value: unknown): string {
  if (typeof value !== "string" || value.length === 0) invalidResponse();
  return value;
}
export function id(value: unknown): string {
  const result = text(value);
  if (result.length > 256 || /[\u0000-\u001f]/.test(result)) invalidResponse();
  return result;
}
export function integer(
  value: unknown,
  min = 0,
  max = Number.MAX_SAFE_INTEGER,
): number {
  if (typeof value !== "string" || !/^-?\d+$/.test(value)) invalidResponse();
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < min || number > max) {
    invalidResponse();
  }
  return number;
}
export function money(currency: unknown, amount: unknown): Money {
  const unit = text(currency);
  const decimal = text(amount);
  if (!/^[A-Z]{3}$/.test(unit) || !/^-?(0|[1-9]\d*)(\.\d+)?$/.test(decimal)) {
    invalidResponse();
  }
  return { currency: unit, amount: decimal };
}
export function invalidResponse(): never {
  throw new MarketplaceError(
    "invalidResponse",
    "The provider response does not match the verified contract.",
  );
}

export function validateDependencies(deps: ClientDependencies): void {
  if (
    deps.timeoutMs !== undefined &&
    (!Number.isFinite(deps.timeoutMs) || deps.timeoutMs <= 0 ||
      deps.timeoutMs > 120_000)
  ) {
    throw new MarketplaceError(
      "configuration",
      "timeoutMs must be between 1 and 120000.",
    );
  }
}

export function validateConnectionId(value: string): void {
  if (
    typeof value !== "string" || value.length === 0 || value.length > 256 ||
    /[\u0000-\u001f]/.test(value)
  ) {
    throw new MarketplaceError(
      "configuration",
      "A nonempty connection identifier is required.",
    );
  }
}

export function validateWindow(
  query: ReadOrdersQuery,
  maxDurationMs: number,
): void {
  const pattern =
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/;
  const calendarValid = (value: string): boolean => {
    if (typeof value !== "string" || !pattern.test(value)) return false;
    const date = new Date(value.slice(0, 10) + "T00:00:00Z");
    return Number.isFinite(date.valueOf()) &&
      date.toISOString().slice(0, 10) === value.slice(0, 10) &&
      Number(value.slice(11, 13)) <= 23 && Number(value.slice(14, 16)) <= 59 &&
      (value[16] !== ":" || Number(value.slice(17, 19)) <= 59);
  };
  const from = Date.parse(query.from);
  const to = Date.parse(query.to);
  if (
    !calendarValid(query.from) || !calendarValid(query.to) ||
    !Number.isFinite(from) || !Number.isFinite(to) ||
    to <= from || to - from > maxDurationMs
  ) {
    throw new MarketplaceError(
      "invalidInput",
      "Provide an ordered, bounded ISO timestamp window with timezone.",
    );
  }
}

export function cursorScope(
  market: string,
  connectionId: string,
  query: ReadOrdersQuery,
  extra = "",
): string {
  return JSON.stringify([market, connectionId, query.from, query.to, extra]);
}
export function encodeCursor(scope: string, value: unknown): string {
  const bytes = new TextEncoder().encode(
    JSON.stringify({ version: 1, scope, value }),
  );
  return btoa(Array.from(bytes, (byte) => String.fromCharCode(byte)).join(""));
}
export function decodeCursor(
  cursor: string | undefined,
  scope: string,
): unknown {
  if (cursor === undefined) return undefined;
  try {
    if (cursor.length === 0 || cursor.length > 16_384) throw new Error();
    const bytes = Uint8Array.from(
      atob(cursor),
      (character) => character.charCodeAt(0),
    );
    const data: unknown = JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(bytes),
    );
    const record = object(data);
    if (
      record.version !== 1 || record.scope !== scope || !("value" in record)
    ) throw new Error();
    return record.value;
  } catch {
    throw new MarketplaceError(
      "invalidCursor",
      "The cursor is invalid for this connection and query.",
    );
  }
}

export async function requestJson(
  url: string,
  init: RequestInit | ((signal: AbortSignal) => Promise<RequestInit>),
  deps: ClientDependencies,
  scope: RequestScope,
  signal?: AbortSignal,
): Promise<unknown> {
  if (signal?.aborted) {
    throw new MarketplaceError("cancelled", "The read was cancelled.");
  }
  try {
    await deps.beforeRequest?.(scope, signal);
  } catch {
    throw new MarketplaceError(
      signal?.aborted ? "cancelled" : "transport",
      "Request coordination did not complete.",
    );
  }
  if (signal?.aborted) {
    throw new MarketplaceError("cancelled", "The read was cancelled.");
  }
  const deadline = AbortSignal.timeout(deps.timeoutMs ?? 15_000);
  const combined = signal ? AbortSignal.any([signal, deadline]) : deadline;
  let prepared: RequestInit;
  try {
    prepared = typeof init === "function" ? await init(combined) : init;
    if (combined.aborted) {
      throw new MarketplaceError(
        signal?.aborted ? "cancelled" : "transport",
        "The provider read did not complete.",
      );
    }
  } catch (error) {
    if (error instanceof MarketplaceError) throw error;
    throw new MarketplaceError(
      "configuration",
      "Request credentials could not be prepared.",
    );
  }
  let response: Response;
  try {
    response = await (deps.fetch ?? globalThis.fetch)(url, {
      ...prepared,
      redirect: "error",
      signal: combined,
    });
  } catch {
    throw new MarketplaceError(
      signal?.aborted ? "cancelled" : "transport",
      "The provider read did not complete.",
    );
  }
  if (!response.ok) {
    const code = response.status === 401
      ? "authentication"
      : response.status === 403
      ? "permissionDenied"
      : response.status === 429
      ? "rateLimited"
      : "providerRejected";
    const delay = response.headers.get("retry-after");
    const dateDelay = delay === null ? NaN : Date.parse(delay);
    const seconds = delay !== null && /^\d+$/.test(delay)
      ? Number(delay)
      : Number.isFinite(dateDelay)
      ? Math.max(
        0,
        Math.ceil((dateDelay - (deps.now?.() ?? new Date()).getTime()) / 1000),
      )
      : undefined;
    try {
      await response.body?.cancel();
    } catch { /* Keep the original safe error. */ }
    throw new MarketplaceError(code, "The provider rejected the read.", {
      status: response.status,
      ...(seconds !== undefined && Number.isSafeInteger(seconds)
        ? { retryAfterSeconds: seconds }
        : {}),
    });
  }
  try {
    if (!response.body) invalidResponse();
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let length = 0;
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      length += chunk.value.byteLength;
      if (length > 8 * 1024 * 1024) {
        await reader.cancel();
        invalidResponse();
      }
      chunks.push(chunk.value);
    }
    const data = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) {
      data.set(chunk, offset);
      offset += chunk.byteLength;
    }
    const body = new TextDecoder("utf-8", { fatal: true }).decode(data);
    return parse(body, undefined, { parseNumber: (number) => number });
  } catch (error) {
    if (error instanceof MarketplaceError) throw error;
    if (combined.aborted) {
      throw new MarketplaceError(
        signal?.aborted ? "cancelled" : "transport",
        "The provider read did not complete.",
      );
    }
    invalidResponse();
  }
}
