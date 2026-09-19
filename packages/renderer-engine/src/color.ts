import { err, ok, type Result } from "@patternforge/shared";

import type { RenderError, RgbaColor } from "./types";

export const DEFAULT_BACKGROUND: RgbaColor = {
  a: 255,
  b: 255,
  g: 255,
  r: 255,
};

export const DEFAULT_FOREGROUND: RgbaColor = {
  a: 255,
  b: 0,
  g: 0,
  r: 0,
};

function invalidColor(
  message: string,
  value: boolean | number | string | null,
): Result<never, RenderError> {
  return err({
    code: "INVALID_COLOR",
    details: null,
    message: `${message} (received: ${String(value)})`,
  });
}

function isByte(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= 0 &&
    value <= 255
  );
}

/**
 * Validate an unknown value as an RGBA color.
 * All channels must be integers in 0..255.
 */
export function validateColor(value: unknown): Result<RgbaColor, RenderError> {
  if (typeof value !== "object" || value === null) {
    return invalidColor("Color must be an object.", null);
  }
  const candidate = value as Record<string, unknown>;
  if (
    !isByte(candidate.r) ||
    !isByte(candidate.g) ||
    !isByte(candidate.b) ||
    !isByte(candidate.a)
  ) {
    return invalidColor(
      "Color channels r/g/b/a must be integers in 0..255.",
      null,
    );
  }
  return ok({
    a: candidate.a as number,
    b: candidate.b as number,
    g: candidate.g as number,
    r: candidate.r as number,
  });
}

/**
 * Convert opacity in 0..1 to an alpha byte 0..255 deterministically.
 * Uses `Math.round(opacity * 255)`.
 */
export function opacityToAlphaByte(opacity: number): number {
  return Math.round(opacity * 255);
}

/**
 * Validate opacity in the inclusive range [0, 1].
 */
export function isValidOpacity(opacity: unknown): opacity is number {
  return (
    typeof opacity === "number" &&
    Number.isFinite(opacity) &&
    opacity >= 0 &&
    opacity <= 1
  );
}

/**
 * Alpha compositing ("over") with deterministic integer math.
 *
 * Formula (non-premultiplied, per channel):
 * - `srcA = round(src.a * opacity)` where `opacity` is 0..1.
 * - `outA = srcA + dstA * (255 - srcA) / 255`
 * - `outC = (srcC * srcA + dstC * dstA * (255 - srcA) / 255) / outA`
 *   for each of R, G, B; when `outA === 0`, outputs 0.
 * - All divisions are rounded with `Math.round` to the nearest integer
 *   and clamped to 0..255.
 *
 * For the common opaque-destination case (`dstA === 255`), this reduces to:
 * - `outA = 255`
 * - `outC = round((srcC * srcA + dstC * (255 - srcA)) / 255)`
 *
 * The formula is platform-independent for identical inputs because it uses
 * only integer-range arithmetic and `Math.round` (IEEE-754 deterministic).
 */
export function blendOver(
  dst: RgbaColor,
  src: RgbaColor,
  opacity: number,
): RgbaColor {
  const srcA = opacityToAlphaByte(opacity) * (src.a / 255);
  const roundedSrcA = Math.round(srcA);
  const clampedSrcA = Math.min(255, Math.max(0, roundedSrcA));
  const dstA = dst.a;
  const inv = 255 - clampedSrcA;
  const outA = clampedSrcA + Math.round((dstA * inv) / 255);

  if (outA === 0) {
    return { a: 0, b: 0, g: 0, r: 0 };
  }

  const blendChannel = (srcC: number, dstC: number): number => {
    const value = (srcC * clampedSrcA + (dstC * dstA * inv) / 255) / outA;
    return Math.min(255, Math.max(0, Math.round(value)));
  };

  return {
    a: Math.min(255, Math.max(0, outA)),
    b: blendChannel(src.b, dst.b),
    g: blendChannel(src.g, dst.g),
    r: blendChannel(src.r, dst.r),
  };
}
