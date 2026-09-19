import type { PatternPrimitive } from "@patternforge/core";

import { renderTile } from "./render";
import type { RasterImage, RenderSettings } from "./types";

export interface SeamValidationResult {
  readonly mismatchedPixels: number;
  readonly pass: boolean;
  readonly tolerance: number;
  readonly totalPixels: number;
}

export interface TileSeamlessReport {
  readonly corner: SeamValidationResult;
  readonly horizontal: SeamValidationResult;
  readonly pass: boolean;
  readonly vertical: SeamValidationResult;
}

/** Compare two images channel-by-channel with an absolute tolerance. */
export function countMismatchedPixels(
  a: RasterImage,
  b: RasterImage,
  tolerance = 0,
): number {
  return countMismatchedPixelsExact(a, b, tolerance);
}

function countMismatchedPixelsExact(
  a: RasterImage,
  b: RasterImage,
  tolerance: number,
): number {
  if (a.width !== b.width || a.height !== b.height) {
    return Math.max(a.width * a.height, b.width * b.height);
  }
  let mismatched = 0;
  const pixels = a.width * a.height;
  for (let p = 0; p < pixels; p += 1) {
    const o = p * 4;
    let bad = false;
    for (let c = 0; c < 4; c += 1) {
      if (Math.abs((a.data[o + c] ?? 0) - (b.data[o + c] ?? 0)) > tolerance) {
        bad = true;
        break;
      }
    }
    if (bad) {
      mismatched += 1;
    }
  }
  return mismatched;
}

/** Exact (or tolerance-based) pixel equality. */
export function imagesEqual(
  a: RasterImage,
  b: RasterImage,
  tolerance = 0,
): boolean {
  return countMismatchedPixelsExact(a, b, tolerance) === 0;
}

function toPass(
  mismatched: number,
  total: number,
  tolerance: number,
): SeamValidationResult {
  return {
    mismatchedPixels: mismatched,
    pass: mismatched === 0,
    tolerance,
    totalPixels: total,
  };
}

function shiftPrimitives(
  primitives: readonly PatternPrimitive[],
  dx: number,
  dy: number,
): PatternPrimitive[] {
  return primitives.map((p) => ({ ...p, x: p.x + dx, y: p.y + dy }));
}

/**
 * Horizontal seam validation (left edge <-> right edge).
 *
 * Method: render the base tile, then render the same primitives shifted by
 * `(+W, 0)`. A correctly wrapped renderer produces an identical tile
 * because every primitive's wrapped center is invariant under `+W`.
 * Buffers are compared pixel-by-pixel with exact equality (tolerance 0).
 */
export function validateHorizontalSeam(
  primitives: readonly PatternPrimitive[],
  width: number,
  height: number,
  settings?: Partial<RenderSettings>,
  tolerance = 0,
): SeamValidationResult {
  const base = renderTile(primitives, width, height, settings);
  const shifted = renderTile(
    shiftPrimitives(primitives, width, 0),
    width,
    height,
    settings,
  );
  const total = width * height;
  if (!base.ok || !shifted.ok) {
    return {
      mismatchedPixels: total,
      pass: false,
      tolerance,
      totalPixels: total,
    };
  }
  const mismatched = countMismatchedPixelsExact(
    base.value,
    shifted.value,
    tolerance,
  );
  return toPass(mismatched, total, tolerance);
}

/**
 * Vertical seam validation (top edge <-> bottom edge).
 * Same shift-invariance principle with offset `(0, +H)`.
 */
export function validateVerticalSeam(
  primitives: readonly PatternPrimitive[],
  width: number,
  height: number,
  settings?: Partial<RenderSettings>,
  tolerance = 0,
): SeamValidationResult {
  const base = renderTile(primitives, width, height, settings);
  const shifted = renderTile(
    shiftPrimitives(primitives, 0, height),
    width,
    height,
    settings,
  );
  const total = width * height;
  if (!base.ok || !shifted.ok) {
    return {
      mismatchedPixels: total,
      pass: false,
      tolerance,
      totalPixels: total,
    };
  }
  const mismatched = countMismatchedPixelsExact(
    base.value,
    shifted.value,
    tolerance,
  );
  return toPass(mismatched, total, tolerance);
}

/**
 * Corner continuity validation (all four corners).
 * Shifts by `(+W, +H)` and additionally checks the four corner pixels
 * of the base tile against the diagonally-shifted render.
 */
export function validateCornerContinuity(
  primitives: readonly PatternPrimitive[],
  width: number,
  height: number,
  settings?: Partial<RenderSettings>,
  tolerance = 0,
): SeamValidationResult {
  const base = renderTile(primitives, width, height, settings);
  const shifted = renderTile(
    shiftPrimitives(primitives, width, height),
    width,
    height,
    settings,
  );
  const total = width * height;
  if (!base.ok || !shifted.ok) {
    return {
      mismatchedPixels: total,
      pass: false,
      tolerance,
      totalPixels: total,
    };
  }
  const mismatched = countMismatchedPixelsExact(
    base.value,
    shifted.value,
    tolerance,
  );
  return toPass(mismatched, total, tolerance);
}

/** Combined seamless report (horizontal + vertical + corner). */
export function validateTileSeamless(
  primitives: readonly PatternPrimitive[],
  width: number,
  height: number,
  settings?: Partial<RenderSettings>,
  tolerance = 0,
): TileSeamlessReport {
  const horizontal = validateHorizontalSeam(
    primitives,
    width,
    height,
    settings,
    tolerance,
  );
  const vertical = validateVerticalSeam(
    primitives,
    width,
    height,
    settings,
    tolerance,
  );
  const corner = validateCornerContinuity(
    primitives,
    width,
    height,
    settings,
    tolerance,
  );
  return {
    corner,
    horizontal,
    pass: horizontal.pass && vertical.pass && corner.pass,
    vertical,
  };
}

/**
 * Verify that every cell of a composed grid exactly equals its neighbors.
 * For a grid built by `composePreviewGrid`, all `columns * rows` cells must
 * match the source tile pixel-for-pixel (tolerance 0).
 */
export function validatePreviewGridConsistency(
  grid: RasterImage,
  tileWidth: number,
  tileHeight: number,
  tolerance = 0,
): SeamValidationResult {
  const columns = Math.round(grid.width / tileWidth);
  const rows = Math.round(grid.height / tileHeight);
  const total = grid.width * grid.height;
  if (
    columns <= 0 ||
    rows <= 0 ||
    columns * tileWidth !== grid.width ||
    rows * tileHeight !== grid.height
  ) {
    return {
      mismatchedPixels: total,
      pass: false,
      tolerance,
      totalPixels: total,
    };
  }
  let mismatched = 0;
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < columns; col += 1) {
      for (let y = 0; y < tileHeight; y += 1) {
        for (let x = 0; x < tileWidth; x += 1) {
          const refOffset = (y * tileWidth + x) * 4;
          void refOffset;
          const gx = col * tileWidth + x;
          const gy = row * tileHeight + y;
          const gOffset = (gy * grid.width + gx) * 4;
          const rx = x;
          const ry = y;
          void rx;
          void ry;
          // Compare against cell (0,0) as reference.
          const refCellOffset = (ry * grid.width + rx) * 4;
          for (let c = 0; c < 4; c += 1) {
            if (
              Math.abs(
                (grid.data[gOffset + c] ?? 0) -
                  (grid.data[refCellOffset + c] ?? 0),
              ) > tolerance
            ) {
              mismatched += 1;
              break;
            }
          }
        }
      }
    }
  }
  return toPass(mismatched, total, tolerance);
}
