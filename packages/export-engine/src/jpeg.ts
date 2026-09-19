import { encode } from "jpeg-js";
import { err, ok } from "@patternforge/shared";
import {
  RENDER_MAX_BYTES,
  RENDER_MAX_DIMENSION,
  RENDER_MAX_PIXELS,
  type RasterImage,
  type RenderCancellationSignal,
  type RgbaColor,
} from "@patternforge/renderer-engine";

import {
  DEFAULT_JPEG_QUALITY,
  MAX_JPEG_QUALITY,
  MIN_JPEG_QUALITY,
  type ExportResult,
} from "./types";

/**
 * JPEG encoder via the small `jpeg-js` dependency (pure JS, deterministic
 * for identical input + quality). The encoder consumes RGBA; alpha is
 * composited over the configured background first so the payload is
 * fully opaque — no alpha ambiguity in the output file.
 */

function compositeOver(
  image: RasterImage,
  background: RgbaColor,
): Uint8Array<ArrayBuffer> {
  const { width, height, data } = image;
  const rgba = new Uint8Array(width * height * 4);
  for (let p = 0; p < width * height; p += 1) {
    const s = p * 4;
    const srcA = data[s + 3] ?? 255;
    const inv = 255 - srcA;
    rgba[s] = Math.round(((data[s] ?? 0) * srcA + background.r * inv) / 255);
    rgba[s + 1] = Math.round(
      ((data[s + 1] ?? 0) * srcA + background.g * inv) / 255,
    );
    rgba[s + 2] = Math.round(
      ((data[s + 2] ?? 0) * srcA + background.b * inv) / 255,
    );
    rgba[s + 3] = 255;
  }
  return rgba;
}

export function encodeJpeg(
  image: RasterImage,
  quality: number = DEFAULT_JPEG_QUALITY,
  background: RgbaColor = { a: 255, b: 255, g: 255, r: 255 },
  signal?: RenderCancellationSignal,
): ExportResult<Uint8Array> {
  const { width, height, data } = image;
  if (
    !Number.isSafeInteger(width) ||
    !Number.isSafeInteger(height) ||
    width <= 0 ||
    height <= 0 ||
    width > RENDER_MAX_DIMENSION ||
    height > RENDER_MAX_DIMENSION ||
    data.length !== width * height * 4
  ) {
    return err({
      code: "RENDER_LIMIT_EXCEEDED",
      message: "Image dimensions are invalid or exceed renderer limits.",
    });
  }
  const pixels = width * height;
  if (
    !Number.isSafeInteger(pixels) ||
    pixels > RENDER_MAX_PIXELS ||
    pixels * 4 > RENDER_MAX_BYTES
  ) {
    return err({
      code: "RENDER_LIMIT_EXCEEDED",
      message: "Image exceeds renderer memory limits.",
    });
  }
  if (
    !Number.isInteger(quality) ||
    quality < MIN_JPEG_QUALITY ||
    quality > MAX_JPEG_QUALITY
  ) {
    return err({
      code: "INVALID_QUALITY",
      message: `quality must be an integer in ${MIN_JPEG_QUALITY}..${MAX_JPEG_QUALITY}.`,
    });
  }
  if (signal?.isCancelled() === true) {
    return err({ code: "CANCELLED", message: "JPEG encoding cancelled." });
  }

  let encoded: Uint8Array;
  try {
    const rgba = compositeOver(image, background);
    encoded = encode({ data: rgba, height, width }, quality).data;
  } catch (error) {
    return err({
      code: "ENCODE_FAILED",
      message: `JPEG encoder failed: ${error instanceof Error ? error.message : "unknown"}.`,
    });
  }
  if (signal?.isCancelled() === true) {
    return err({ code: "CANCELLED", message: "JPEG encoding cancelled." });
  }
  return ok(new Uint8Array(encoded));
}
