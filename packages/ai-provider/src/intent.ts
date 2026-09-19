import { err, type Result } from "@patternforge/shared";
import {
  DEFAULT_GENERATION_CONFIG,
  degreesToRadians,
  hexToColor,
  validateGenerationConfig,
  type GenerationConfig,
  type GenerationConfigError,
} from "@patternforge/core";

import type { PatternIntent } from "./types";

/**
 * Merge a structured intent over a base config with full validation.
 * Every AI-generated field is checked; invalid fields reject the whole
 * intent (never silently reinterpreted). Unknown extra fields on the
 * intent object are ignored.
 */
export function intentToGenerationConfig(
  intent: PatternIntent,
  base: GenerationConfig = DEFAULT_GENERATION_CONFIG,
): Result<GenerationConfig, GenerationConfigError> {
  if (typeof intent !== "object" || intent === null) {
    return err({
      code: "INVALID_SEED",
      field: "seed",
      message: "Intent must be an object.",
      value: null,
    });
  }

  let backgroundColor = base.backgroundColor;
  if (intent.backgroundHex !== undefined) {
    const parsed = hexToColor(intent.backgroundHex);
    if (!parsed.ok) {
      return err({
        code: "INVALID_BACKGROUND",
        field: "backgroundColor",
        message: `Intent background invalid: ${parsed.error.message}`,
        value: intent.backgroundHex,
      });
    }
    backgroundColor = parsed.value;
  }

  let palette = base.palette;
  if (intent.paletteHex !== undefined) {
    if (!Array.isArray(intent.paletteHex)) {
      return err({
        code: "INVALID_PALETTE",
        field: "palette",
        message: "Intent palette must be an array of hex colors.",
        value: null,
      });
    }
    const colors = [];
    for (const entry of intent.paletteHex) {
      const parsed = hexToColor(entry);
      if (!parsed.ok) {
        return err({
          code: "INVALID_PALETTE",
          field: "palette",
          message: `Intent palette entry invalid: ${String(entry)}.`,
          value: typeof entry === "string" ? entry : null,
        });
      }
      colors.push(parsed.value);
    }
    palette = { colors };
  }

  let rotationRange = base.rotationRange;
  if (intent.rotationDegrees !== undefined) {
    if (
      typeof intent.rotationDegrees !== "number" ||
      !Number.isFinite(intent.rotationDegrees) ||
      intent.rotationDegrees < 0 ||
      intent.rotationDegrees > 360
    ) {
      return err({
        code: "INVALID_ROTATION",
        field: "rotationRange",
        message: "Intent rotation must be finite in 0..360 degrees.",
        value: intent.rotationDegrees,
      });
    }
    rotationRange = degreesToRadians(intent.rotationDegrees);
  }

  return validateGenerationConfig({
    backgroundColor,
    colorOrder: base.colorOrder,
    complexity: intent.complexity ?? base.complexity,
    density: intent.density ?? base.density,
    height: base.height,
    lineThickness: base.lineThickness,
    opacityMax: base.opacityMax,
    opacityMin: base.opacityMin,
    palette,
    positionJitter: intent.positionJitter ?? base.positionJitter,
    primitiveType: intent.primitiveType ?? base.primitiveType,
    rotationRange,
    scale: intent.scale ?? base.scale,
    seed: base.seed,
    width: base.width,
  });
}
