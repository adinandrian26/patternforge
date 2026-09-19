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
