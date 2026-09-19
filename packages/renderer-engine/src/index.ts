export type {
  RasterImage,
  RenderCancellationSignal,
  RenderError,
  RenderErrorCode,
  RenderResult,
  RenderSettings,
  RgbaColor,
} from "./types";
export {
  PREVIEW_GRID_COLUMNS,
  PREVIEW_GRID_ROWS,
  PREVIEW_MAX_DIMENSION,
  PREVIEW_TILE_SIZE,
  RENDER_MAX_BYTES,
  RENDER_MAX_DIMENSION,
  RENDER_MAX_PIXELS,
} from "./types";
export {
  DEFAULT_BACKGROUND,
  DEFAULT_FOREGROUND,
  blendOver,
  isValidOpacity,
  opacityToAlphaByte,
  validateColor,
} from "./color";
// Pure color helpers share the single core implementation (structurally
// identical RGBA); re-exported here for renderer consumers.
export {
  colorToHex,
  colorsEqual,
  hexToColor,
  isRgbaColor,
  normalizeColor,
  rgbaToCss,
} from "@patternforge/core";
export {
  cloneRasterImage,
  createRasterImage,
  getPixel,
  pixelOffset,
  validateRenderDimensions,
} from "./raster";
export { rasterizeSingleCopy, validatePrimitive } from "./primitives";
export { renderPattern, renderPrimitive, renderTile } from "./render";
export { composePreviewGrid, extractGridCell } from "./preview";
export {
  countMismatchedPixels,
  imagesEqual,
  validateCornerContinuity,
  validateHorizontalSeam,
  validatePreviewGridConsistency,
  validateTileSeamless,
  validateVerticalSeam,
  type SeamValidationResult,
  type TileSeamlessReport,
} from "./validate";
export { computeImageChecksum } from "./checksum";

export const RENDERER_ENGINE_PACKAGE_NAME =
  "@patternforge/renderer-engine" as const;
