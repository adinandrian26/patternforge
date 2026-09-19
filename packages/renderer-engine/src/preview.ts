import { err, ok } from "@patternforge/shared";

import { validateRenderDimensions } from "./raster";
import type { RasterImage, RenderResult } from "./types";

const MAX_GRID_CELLS = 8;

/**
 * Compose a preview grid by repeating a tile.
 *
 * Example for 3x3:
 * ```
 * ┌──────┬──────┬──────┐
 * │ TILE │ TILE │ TILE │
 * ├──────┼──────┼──────┤
 * │ TILE │ TILE │ TILE │
 * ├──────┼──────┼──────┤
 * │ TILE │ TILE │ TILE │
 * └──────┴──────┴──────┘
 * ```
 * The center tile is the original. All neighbor tiles are exact pixel
 * copies of the same tile buffer, so users can visually verify that the
 * wrapped rendering is seamless. Pixel-exact repetition is intentional:
 * any visible seam in the grid indicates a renderer wrapping defect,
 * not a composition defect.
 */
export function composePreviewGrid(
  tile: RasterImage,
  columns = 3,
  rows = 3,
): RenderResult<RasterImage> {
  if (
    !Number.isSafeInteger(columns) ||
    !Number.isSafeInteger(rows) ||
    columns <= 0 ||
    rows <= 0 ||
    columns > MAX_GRID_CELLS ||
    rows > MAX_GRID_CELLS
  ) {
    return err({
      code: "INVALID_DIMENSIONS",
      details: { columns, rows },
      message: `Grid must use integer columns/rows in 1..${MAX_GRID_CELLS}.`,
    });
  }

  if (
    !Number.isSafeInteger(tile.width) ||
    !Number.isSafeInteger(tile.height) ||
    tile.width <= 0 ||
    tile.height <= 0 ||
    tile.data.length !== tile.width * tile.height * 4
  ) {
    return err({
      code: "INVALID_DIMENSIONS",
      details: null,
      message: "Tile image has inconsistent dimensions/data.",
    });
  }

  const width = tile.width * columns;
  const height = tile.height * rows;
  const dims = validateRenderDimensions(width, height);
  if (!dims.ok) {
    return dims;
  }

  const data = new Uint8Array(width * height * 4);
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < columns; col += 1) {
      const destX = col * tile.width;
      const destY = row * tile.height;
      for (let y = 0; y < tile.height; y += 1) {
        const srcOffset = y * tile.width * 4;
        const dstOffset = ((destY + y) * width + destX) * 4;
        data.set(
          tile.data.subarray(srcOffset, srcOffset + tile.width * 4),
          dstOffset,
        );
      }
    }
  }

  return ok({ data, height, width });
}

/**
 * Extract a single tile cell from a composed grid (column/row, 0-indexed).
 * Used by tests to verify every cell equals the source tile.
 */
export function extractGridCell(
  grid: RasterImage,
  tileWidth: number,
  tileHeight: number,
  column: number,
  row: number,
): RenderResult<RasterImage> {
  const dims = validateRenderDimensions(tileWidth, tileHeight);
  if (!dims.ok) {
    return dims;
  }
  const x0 = column * tileWidth;
  const y0 = row * tileHeight;
  if (
    x0 < 0 ||
    y0 < 0 ||
    x0 + tileWidth > grid.width ||
    y0 + tileHeight > grid.height
  ) {
    return err({
      code: "INVALID_DIMENSIONS",
      details: { column, row },
      message: "Grid cell is out of bounds.",
    });
  }

  const data = new Uint8Array(tileWidth * tileHeight * 4);
  for (let y = 0; y < tileHeight; y += 1) {
    const srcOffset = ((y0 + y) * grid.width + x0) * 4;
    const dstOffset = y * tileWidth * 4;
    data.set(
      grid.data.subarray(srcOffset, srcOffset + tileWidth * 4),
      dstOffset,
    );
  }
  return ok({ data, height: tileHeight, width: tileWidth });
}
