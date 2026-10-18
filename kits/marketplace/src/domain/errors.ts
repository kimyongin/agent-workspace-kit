export type MarketplaceErrorCode =
  | "configuration"
  | "invalidInput"
  | "invalidCursor"
  | "authentication"
  | "permissionDenied"
  | "rateLimited"
  | "transport"
  | "cancelled"
  | "invalidResponse"
  | "providerRejected";

/** Messages are authored by the kit; provider bodies and secrets are never attached. */
export class MarketplaceError extends Error {
  readonly code: MarketplaceErrorCode;
  readonly status: number | undefined;
  readonly retryAfterSeconds: number | undefined;
  constructor(code: MarketplaceErrorCode, message: string, details: {
    status?: number;
    retryAfterSeconds?: number;
  } = {}) {
    super(message);
    this.name = "MarketplaceError";
    this.code = code;
    this.status = details.status;
    this.retryAfterSeconds = details.retryAfterSeconds;
  }
}
