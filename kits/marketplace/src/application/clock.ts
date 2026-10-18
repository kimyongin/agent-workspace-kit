import { MarketplaceError } from "../domain/errors.js";
import type { Clock } from "./ports.js";

export function currentTime(now?: Clock): Date {
  try {
    const value = now?.() ?? new Date();
    if (!(value instanceof Date) || !Number.isFinite(value.getTime())) {
      throw new Error();
    }
    return new Date(value.getTime());
  } catch {
    throw new MarketplaceError(
      "configuration",
      "The clock did not provide a valid time.",
    );
  }
}
