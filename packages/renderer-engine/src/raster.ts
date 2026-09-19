import { err, ok } from "@patternforge/shared";

import {
  RENDER_MAX_BYTES,
  RENDER_MAX_DIMENSION,
  RENDER_MAX_PIXELS,
  type RasterImage,
  type RenderError,
  type RenderResult,
  type RgbaColor,
} from "./types";

export function validateRenderDimensions(
  width: number,
  height: number,
): RenderResult<{ height: number; width: number }> {
  if (
    !Number.isSafeInteger(width) ||
    !Number.isSafeInteger(height) ||
    width <= 0 ||
    height <= 0
  ) {
    return err({
      code: "INVALID_DIMENSIONS",
      details: { height, width },
      message: "width and height must be positive safe integers.",
    });
  }

  if (width > RENDER_MAX_DIMENSION || height > RENDER_MAX_DIMENSION) {
    return err({
      code: "RENDER_LIMIT_EXCEEDED",
      details: { height, maxDimension: RENDER_MAX_DIMENSION, width },
      message: `Dimensions exceed the renderer limit of ${RENDER_MAX_DIMENSION}px per axis.`,
    });
  }

  if (!Number.isSafeInteger(width * height)) {
    return err({
      code: "INVALID_DIMENSIONS",
      details: null,
      message: "width * height overflows safe integer range.",
    });
  }

  const pixels = width * height;
  if (pixels > RENDER_MAX_PIXELS) {
    return err({
      code: "RENDER_LIMIT_EXCEEDED",
      details: { maxPixels: RENDER_MAX_PIXELS, pixels },
      message: `Pixel count ${pixels} exceeds the renderer limit of ${RENDER_MAX_PIXELS}.`,
    });
  }

  const bytes = pixels * 4;
  if (!Number.isSafeInteger(bytes) || bytes > RENDER_MAX_BYTES) {
    return err({
      code: "RENDER_LIMIT_EXCEEDED",
      details: { bytes, maxBytes: RENDER_MAX_BYTES },
      message: `Buffer size ${bytes} bytes exceeds the renderer limit of ${RENDER_MAX_BYTES}.`,
    });
  }

  return ok({ height, width });
}

/**
 * Create a raster image filled with `fill` (defaults to opaque white).
 * Memory is validated before allocation (reject-before-allocate).
 */
export function createRasterImage(
  width: number,
  height: number,
  fill?: RgbaColor,
): RenderResult<RasterImage> {
  const dims = validateRenderDimensions(width, height);
  if (!dims.ok) {
    return dims;
  }

  const color: RgbaColor = fill ?? { a: 255, b: 255, g: 255, r: 255 };
  const data = new Uint8Array(width * height * 4);
  for (let i = 0; i < width * height; i += 1) {
    const o = i * 4;
    data[o] = color.r;
    data[o + 1] = color.g;
    data[o + 2] = color.b;
    data[o + 3] = color.a;
  }

  return ok({ data, height, width });
}

export function getPixel(image: RasterImage, x: number, y: number): RgbaColor {
  const offset = (y * image.width + x) * 4;
  return {
    a: image.data[offset + 3] ?? 0,
    b: image.data[offset + 2] ?? 0,
    g: image.data[offset + 1] ?? 0,
    r: image.data[offset] ?? 0,
  };
}

export function pixelOffset(image: RasterImage, x: number, y: number): number {
  return (y * image.width + x) * 4;
}

/** Assert internal image integrity (used by validators, not hot paths). */
export function assertImageIntegrity(image: RasterImage): void {
  if (
    !Number.isSafeInteger(image.width) ||
    !Number.isSafeInteger(image.height) ||
    image.width <= 0 ||
    image.height <= 0 ||
    image.data.length !== image.width * image.height * 4
  ) {
    throw new RangeError("RasterImage has inconsistent dimensions/data.");
  }
}

export function cloneRasterImage(image: RasterImage): RasterImage {
  return {
    data: new Uint8Array(image.data),
    height: image.height,
    width: image.width,
  };
}

export type { RenderError };
