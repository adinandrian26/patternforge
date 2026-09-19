import type { Brand, Seed } from "@patternforge/shared";
import {
  PRNG_ALGORITHM_VERSION,
  err,
  ok,
  type Result,
} from "@patternforge/shared";

export type SeedInput = number | string;
export type CanonicalSeedValue = Brand<string, "CanonicalSeedValue">;

export interface CanonicalSeed extends Seed {
  readonly algorithmVersion: typeof PRNG_ALGORITHM_VERSION;
  readonly value: CanonicalSeedValue;
}

export type SeedErrorReason = "empty" | "not-integer" | "out-of-range";

export interface SeedValidationError {
  readonly code: "INVALID_SEED";
  readonly inputType: "number" | "string";
  readonly message: string;
  readonly reason: SeedErrorReason;
}

export const MIN_SEED = 0;
export const MAX_SEED = 0xffff_ffff;

function seedError(
  input: SeedInput,
  reason: SeedErrorReason,
  message: string,
): SeedValidationError {
  return {
    code: "INVALID_SEED",
    inputType: typeof input === "number" ? "number" : "string",
    message,
    reason,
  };
}

export function createCanonicalSeed(
  input: SeedInput,
): Result<CanonicalSeed, SeedValidationError> {
  let parsed: bigint;

  if (typeof input === "number") {
    if (!Number.isSafeInteger(input)) {
      return err(
        seedError(
          input,
          "not-integer",
          "Seed numbers must be finite safe integers.",
        ),
      );
    }

    parsed = BigInt(input);
  } else {
    const trimmed = input.trim();

    if (trimmed.length === 0) {
      return err(seedError(input, "empty", "Seed strings cannot be empty."));
    }

    if (!/^\+?\d+$/.test(trimmed)) {
      return err(
        seedError(
          input,
          "not-integer",
          "Seed strings must contain an unsigned integer.",
        ),
      );
    }

    parsed = BigInt(trimmed);
  }

  const minimum = BigInt(MIN_SEED);
  const maximum = BigInt(MAX_SEED);

  if (parsed < minimum || parsed > maximum) {
    return err(
      seedError(
        input,
        "out-of-range",
        `Seed must be in the inclusive range ${MIN_SEED}-${MAX_SEED}.`,
      ),
    );
  }

  return ok({
    algorithmVersion: PRNG_ALGORITHM_VERSION,
    value: parsed.toString() as CanonicalSeedValue,
  });
}
