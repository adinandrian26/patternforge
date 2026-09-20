import { err, ok } from "@patternforge/shared";
import {
  createCanonicalSeed,
  type SeedInput,
} from "@patternforge/pattern-engine";
import { isExportFormat } from "@patternforge/export-engine";
import { validateGenerationConfig } from "@patternforge/core";

import {
  MAX_BATCH_COUNT,
  type BatchError,
  type BatchRequest,
  type BatchRequestInput,
} from "./types";
import type { Result } from "@patternforge/shared";

const SEED_MODULO = 0x1_0000_0000;

/**
 * Derive item seed `startSeed + index (mod 2^32)` as a canonical string.
 * Same (startSeed, index) always yields the same seed; reruns and retries
 * reproduce identical sequences.
 */
export function deriveBatchSeed(
  startSeed: SeedInput,
  index: number,
): Result<string, BatchError> {
  const canonical = createCanonicalSeed(startSeed);
  if (!canonical.ok) {
    return err({ code: "INVALID_SEED", message: canonical.error.message });
  }
  const base = Number(canonical.value.value);
  const derived = (base + Math.floor(index)) % SEED_MODULO;
  return ok(String(derived));
}

export function validateBatchRequest(
  input: BatchRequestInput,
): Result<BatchRequest, BatchError> {
  const count = input.count ?? 0;
  if (
    typeof count !== "number" ||
    !Number.isInteger(count) ||
    count < 1 ||
    count > MAX_BATCH_COUNT
  ) {
    return err({
      code: "INVALID_COUNT",
      message: `count must be an integer in 1..${MAX_BATCH_COUNT}.`,
    });
  }
  if (input.startSeed === undefined || input.startSeed === null) {
    return err({ code: "INVALID_SEED", message: "startSeed is required." });
  }
  const seedCheck = createCanonicalSeed(input.startSeed as SeedInput);
  if (!seedCheck.ok) {
    return err({ code: "INVALID_SEED", message: seedCheck.error.message });
  }
  const format = input.format ?? "png";
  if (!isExportFormat(format)) {
    return err({
      code: "INVALID_FORMAT",
      message: "format must be one of: png, jpeg, svg, eps.",
    });
  }
  const configCheck = validateGenerationConfig(
    input.baseConfig as Parameters<typeof validateGenerationConfig>[0],
  );
  if (!configCheck.ok) {
    return err({
      code: "INVALID_CONFIG",
      message: `baseConfig invalid: ${configCheck.error.message}`,
    });
  }
  const quality = input.quality ?? 90;
  return ok({
    baseConfig: configCheck.value,
    count,
    format,
    quality: typeof quality === "number" ? quality : 90,
    startSeed: input.startSeed as SeedInput,
  });
}
