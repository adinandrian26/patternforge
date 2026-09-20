import { err, ok } from "@patternforge/shared";

import {
  extensionForFormat,
  type ExportConfig,
  type ExportConfigInput,
  type ExportError,
  type ExportFormat,
  type ExportResult,
} from "./types";
import {
  DEFAULT_JPEG_QUALITY,
  isExportFormat,
  MAX_JPEG_QUALITY,
  MIN_JPEG_QUALITY,
} from "./types";
import { isRgbaColor } from "@patternforge/core";

const MAX_FILENAME_LENGTH = 100;

function invalid(
  code: ExportError["code"],
  message: string,
): ExportResult<never> {
  return err({ code, message });
}

/**
 * Validate untrusted export configuration. Quality is required to be a
 * JPEG-range integer only when format is JPEG; other formats ignore it
 * (normalized to the default).
 */
export function validateExportConfig(
  input: ExportConfigInput,
): ExportResult<ExportConfig> {
  const format = input.format ?? "png";
  if (!isExportFormat(format)) {
    return invalid(
      "INVALID_FORMAT",
      "format must be one of: png, jpeg, svg, eps.",
    );
  }

  let quality = DEFAULT_JPEG_QUALITY;
  if (format === "jpeg") {
    const q = input.quality ?? DEFAULT_JPEG_QUALITY;
    if (
      typeof q !== "number" ||
      !Number.isInteger(q) ||
      q < MIN_JPEG_QUALITY ||
      q > MAX_JPEG_QUALITY
    ) {
      return invalid(
        "INVALID_QUALITY",
        `quality must be an integer in ${MIN_JPEG_QUALITY}..${MAX_JPEG_QUALITY}.`,
      );
    }
    quality = q;
  }

  const background = input.background ?? {
    a: 255,
    b: 255,
    g: 255,
    r: 255,
  };
  if (!isRgbaColor(background)) {
    return invalid(
      "INVALID_COLOR",
      "background must have r/g/b/a integers in 0..255.",
    );
  }

  const rawName =
    typeof input.filename === "string" && input.filename.length > 0
      ? input.filename
      : defaultFilename(format);
  const filename = sanitizeFilename(rawName);
  if (!filename.ok) {
    return filename;
  }

  return ok({
    background: {
      a: background.a,
      b: background.b,
      g: background.g,
      r: background.r,
    },
    filename: withExtension(filename.value, format),
    format,
    quality,
  });
}

/** Default `patternforge-{timestamp-free}.ext` name (no clock in core). */
export function defaultFilename(format: ExportFormat): string {
  return `patternforge-pattern.${extensionForFormat(format)}`;
}

/**
 * Sanitize a filename: allowlist [A-Za-z0-9._-], map the rest to "_",
 * reject empty results, traversal (".."), separators, and overlong names.
 */
export function sanitizeFilename(name: unknown): ExportResult<string> {
  if (typeof name !== "string") {
    return invalid("INVALID_FILENAME", "filename must be a string.");
  }
  const trimmed = name.trim();
  if (trimmed.length === 0 || trimmed.length > MAX_FILENAME_LENGTH) {
    return invalid(
      "INVALID_FILENAME",
      `filename must be 1..${MAX_FILENAME_LENGTH} characters.`,
    );
  }
  if (
    trimmed.includes("..") ||
    trimmed.includes("/") ||
    trimmed.includes("\\") ||
    trimmed.startsWith(".")
  ) {
    return invalid(
      "INVALID_FILENAME",
      "filename must not contain traversal, separators, or leading dots.",
    );
  }
  const cleaned = trimmed.replace(/[^A-Za-z0-9._-]/g, "_");
  if (cleaned.length === 0 || cleaned === "." || cleaned === "..") {
    return invalid("INVALID_FILENAME", "filename has no valid characters.");
  }
  return ok(cleaned);
}

function withExtension(name: string, format: ExportFormat): string {
  const ext = `.${extensionForFormat(format)}`;
  const lower = name.toLowerCase();
  if (
    lower.endsWith(".png") ||
    lower.endsWith(".jpg") ||
    lower.endsWith(".jpeg") ||
    lower.endsWith(".svg") ||
    lower.endsWith(".eps")
  ) {
    const dot = name.lastIndexOf(".");
    return `${name.slice(0, dot)}${ext}`;
  }
  return `${name}${ext}`;
}

/**
 * Build a deterministic filename from seed + dimensions + optional index:
 * `patternforge-{seed}-{w}x{h}[-{index}].{ext}`. The seed is sanitized
 * through the same allowlist, so it can never escape the directory.
 */
export function buildFilename(
  seed: number | string,
  width: number,
  height: number,
  format: ExportFormat,
  index?: number,
): ExportResult<string> {
  const seedPart = String(seed).replace(/[^A-Za-z0-9_-]/g, "_");
  const indexPart =
    index === undefined ? "" : `-${Math.floor(Math.abs(index))}`;
  const candidate = `patternforge-${seedPart}-${width}x${height}${indexPart}.${extensionForFormat(format)}`;
  return sanitizeFilename(candidate);
}
