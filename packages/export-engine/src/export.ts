import { err, ok } from "@patternforge/shared";
import type { GenerationResult } from "@patternforge/core";
import type {
  RasterImage,
  RenderCancellationSignal,
} from "@patternforge/renderer-engine";

import { encodeJpeg } from "./jpeg";
import { encodePng } from "./png";
import { serializeSvg } from "./svg";
import {
  DEFAULT_STOCK_EPS_SIZE,
  isStockEpsSize,
  MAX_STOCK_EPS_BYTES,
  serializeEps,
} from "./eps";
import {
  mimeForFormat,
  type EncodedFile,
  type ExportConfig,
  type ExportResult,
} from "./types";

const TEXT_ENCODER = new TextEncoder();

/**
 * Encode a rendered raster tile to PNG/JPEG bytes.
 * SVG is vector: use `exportPatternSvg` with pattern data instead.
 */
export function exportRaster(
  image: RasterImage,
  config: ExportConfig,
  signal?: RenderCancellationSignal,
): ExportResult<EncodedFile> {
  switch (config.format) {
    case "png": {
      const encoded = encodePng(image, signal);
      if (!encoded.ok) {
        return encoded;
      }
      return ok({
        bytes: encoded.value,
        filename: config.filename,
        format: config.format,
        height: image.height,
        mimeType: mimeForFormat(config.format),
        width: image.width,
      });
    }
    case "jpeg": {
      const encoded = encodeJpeg(
        image,
        config.quality,
        config.background,
        signal,
      );
      if (!encoded.ok) {
        return encoded;
      }
      return ok({
        bytes: encoded.value,
        filename: config.filename,
        format: config.format,
        height: image.height,
        mimeType: mimeForFormat(config.format),
        width: image.width,
      });
    }
    case "svg":
      return err({
        code: "INVALID_FORMAT",
        message: "SVG export requires pattern data; use exportPatternSvg.",
      });
    case "eps":
      return err({
        code: "INVALID_FORMAT",
        message: "EPS export requires pattern data; use exportPatternEps.",
      });
  }
}

/** Serialize pattern data to a standalone SVG file payload. */
export function exportPatternSvg(
  pattern: GenerationResult,
  config: ExportConfig,
  signal?: RenderCancellationSignal,
): ExportResult<EncodedFile> {
  if (config.format !== "svg") {
    return err({
      code: "INVALID_FORMAT",
      message: "exportPatternSvg requires the svg format.",
    });
  }
  const serialized = serializeSvg(
    pattern,
    {
      background: config.background,
      fallbackFill: { a: 255, b: 0, g: 0, r: 0 },
    },
    signal,
  );
  if (!serialized.ok) {
    return serialized;
  }
  return ok({
    bytes: TEXT_ENCODER.encode(serialized.value),
    filename: config.filename,
    format: config.format,
    height: pattern.height,
    mimeType: mimeForFormat(config.format),
    width: pattern.width,
  });
}

/**
 * Serialize pattern data to a Shutterstock-ready single-tile EPS payload.
 * The artwork is scaled so its longest side equals `targetLongSide`
 * (default 3000); the 4-25MP artwork rule is enforced by `serializeEps`.
 */
export function exportPatternEps(
  pattern: GenerationResult,
  config: ExportConfig,
  targetLongSide: number = DEFAULT_STOCK_EPS_SIZE,
  signal?: RenderCancellationSignal,
): ExportResult<EncodedFile> {
  if (config.format !== "eps") {
    return err({
      code: "INVALID_FORMAT",
      message: "exportPatternEps requires the eps format.",
    });
  }
  if (!isStockEpsSize(targetLongSide)) {
    return err({
      code: "STOCK_SIZE_INVALID",
      message:
        "EPS long side must be one of the Shutterstock presets: 2000, 3000, 4000.",
    });
  }
  const longest = Math.max(pattern.width, pattern.height);
  if (!Number.isSafeInteger(longest) || longest <= 0) {
    return err({
      code: "ENCODE_FAILED",
      message: "Pattern dimensions are invalid for EPS export.",
    });
  }
  const targetWidth = Math.round((pattern.width * targetLongSide) / longest);
  const targetHeight = Math.round((pattern.height * targetLongSide) / longest);
  const serialized = serializeEps(
    pattern,
    {
      background: config.background,
      fallbackFill: { a: 255, b: 0, g: 0, r: 0 },
      targetHeight,
      targetWidth,
    },
    signal,
  );
  if (!serialized.ok) {
    return serialized;
  }
  const bytes = TEXT_ENCODER.encode(serialized.value);
  if (bytes.length > MAX_STOCK_EPS_BYTES) {
    return err({
      code: "ENCODE_FAILED",
      details: { bytes: bytes.length, max: MAX_STOCK_EPS_BYTES },
      message: `EPS payload ${bytes.length} B exceeds the 100MB upload ceiling.`,
    });
  }
  return ok({
    bytes,
    filename: config.filename,
    format: config.format,
    height: targetHeight,
    mimeType: mimeForFormat(config.format),
    width: targetWidth,
  });
}
