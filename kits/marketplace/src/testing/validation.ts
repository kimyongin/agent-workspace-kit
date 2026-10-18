import { MarketplaceError } from "../domain/errors.js";
import { OrderModelError } from "../domain/validation.js";

/** A fixture configuration error with a value-free field path. */
export class MockFixtureError extends MarketplaceError {
  constructor(readonly path: string, reason: string) {
    super("configuration", `${path}: ${reason}`);
    this.name = "MockFixtureError";
  }
}

export function checkFixture(check: () => void): void {
  try {
    check();
  } catch (error) {
    if (error instanceof OrderModelError) {
      throw new MockFixtureError(error.path, error.reason);
    }
    throw error;
  }
}

export function copyFixture<T>(value: T, path: string): T {
  try {
    return structuredClone(value);
  } catch {
    throw new MockFixtureError(path, "Expected cloneable fixture data.");
  }
}
