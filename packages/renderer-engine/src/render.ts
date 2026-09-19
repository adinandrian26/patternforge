import type { GenerationResult, PatternPrimitive } from "@patternforge/core";
import { err, ok } from "@patternforge/shared";
import { wrapCoordinate } from "@patternforge/tile-engine";

import { DEFAULT_BACKGROUND, DEFAULT_FOREGROUND } from "./color";
import { rasterizeSingleCopy, validatePrimitive } from "./primitives";
import { createRasterImage } from "./raster";
import type {
  RasterImage,
  RenderCancellationSignal,
  RenderError,
  RenderResult,
  RenderSettings,
  RgbaColor,
} from "./types";

const NEIGHBOR_OFFSETS = [-1, 0, 1] as const;

function cancelledError(): RenderError {
  return {
    code: "CANCELLED",
    details: null,
    message: "Rendering was cancelled.",
  };
}

function resolveSettings(partial?: Partial<RenderSettings>): RenderSettings {
  return {
    background: partial?.background ?? DEFAULT_BACKGROUND,
    foreground: partial?.foreground ?? DEFAULT_FOREGROUND,
  };
}

function validateSettingsColors(settings: RenderSettings): RenderError | null {
  const isByte = (v: number): boolean =>
    Number.isInteger(v) && v >= 0 && v <= 255;
  for (const color of [settings.background, settings.foreground] as const) {
    if (
      !isByte(color.r) ||
      !isByte(color.g) ||
      !isByte(color.b) ||
      !isByte(color.a)
    ) {
      return {
        code: "INVALID_COLOR",
        details: null,
        message: "RenderSettings colors must have r/g/b/a integers 0..255.",
      };
    }
  }
  return null;
}

/**
 * Render a tile with seamless wrapping.
 *
 * Algorithm (wrapped-center + 9 translated copies):
 * 1. For each primitive, compute the wrapped center
 *    `(wrapX(x), wrapY(y))` in `[0, W) x [0, H)`.
 * 2. For `dx in {-1,0,1}`, `dy in {-1,0,1}`, rasterize one copy at
 *    `(wx + dx*W, wy + dy*H)` clipped to the tile viewport.
 * 3. Composite copies in primitive order (deterministic z-order) with the
 *    documented integer "over" blending.
 * 4. Fill color per primitive is `primitive.color` when present,
 *    otherwise the `foreground` fallback from settings.
 *
 * SCALE (Phase 4): the renderer is the single source of truth for scale
 * (`effective = geometry * primitive.scale`). The generator produces
 * scale-independent base geometry, so scale is applied exactly once.
 *
 * Wrapping the center first guarantees shift-invariance: moving every
 * primitive by `(W, 0)`, `(0, H)`, or `(W, H)` yields an identical tile,
 * which is the foundation for horizontal, vertical, and corner continuity.
 * Generated primitives are small relative to the tile, so 9 copies are
 * sufficient and bounded.
 */
export function renderTile(
  primitives: readonly PatternPrimitive[],
  width: number,
  height: number,
  settings?: Partial<RenderSettings>,
  signal?: RenderCancellationSignal,
): RenderResult<RasterImage> {
  const resolved = resolveSettings(settings);
  const colorError = validateSettingsColors(resolved);
  if (colorError !== null) {
    return err(colorError);
  }

  for (const primitive of primitives) {
    const valid = validatePrimitive(primitive);
    if (!valid.ok) {
      return err(valid.error);
    }
  }

  const imageResult = createRasterImage(width, height, resolved.background);
  if (!imageResult.ok) {
    return imageResult;
  }
  const image = imageResult.value;

  if (signal?.isCancelled() === true) {
    return err(cancelledError());
  }

  let rowCounter = 0;
  for (const primitive of primitives) {
    const wrappedX = wrapCoordinate(primitive.x, width);
    const wrappedY = wrapCoordinate(primitive.y, height);
    const fill = primitive.color ?? resolved.foreground;

    for (const dy of NEIGHBOR_OFFSETS) {
      for (const dx of NEIGHBOR_OFFSETS) {
        const cx = wrappedX + dx * width;
        const cy = wrappedY + dy * height;
        const outcome = rasterizeSingleCopy(
          image,
          primitive,
          fill,
          cx,
          cy,
          signal,
        );
        if (outcome.cancelled) {
          return err(cancelledError());
        }
      }
    }

    rowCounter += 1;
    if (rowCounter % 16 === 0 && signal?.isCancelled() === true) {
      return err(cancelledError());
    }
  }

  return ok(image);
}

/**
 * Render a single primitive without wrapping (one copy at its own x/y).
 * Uses `primitive.color` when present, otherwise the given foreground.
 * Used for isolated unit tests. Seamless tiling uses `renderTile`.
 */
export function renderPrimitive(
  primitive: PatternPrimitive,
  width: number,
  height: number,
  foreground?: RgbaColor,
  background?: RgbaColor,
  signal?: RenderCancellationSignal,
): RenderResult<RasterImage> {
  const valid = validatePrimitive(primitive);
  if (!valid.ok) {
    return err(valid.error);
  }

  const imageResult = createRasterImage(
    width,
    height,
    background ?? DEFAULT_BACKGROUND,
  );
  if (!imageResult.ok) {
    return imageResult;
  }
  const image = imageResult.value;
  const outcome = rasterizeSingleCopy(
    image,
    primitive,
    primitive.color ?? foreground ?? DEFAULT_FOREGROUND,
    primitive.x,
    primitive.y,
    signal,
  );
  if (outcome.cancelled) {
    return err(cancelledError());
  }
  return ok(image);
}

/**
 * Render a full generation result (pattern data -> raster tile).
 * The pattern's own width/height are used; settings/signal are optional.
 */
export function renderPattern(
  pattern: GenerationResult,
  settings?: Partial<RenderSettings>,
  signal?: RenderCancellationSignal,
): RenderResult<RasterImage> {
  return renderTile(
    pattern.primitives,
    pattern.width,
    pattern.height,
    settings,
    signal,
  );
}
