import type { Result } from "@patternforge/shared";

/** Raster export formats. SVG is vector; PNG/JPEG are raster. */
export const EXPORT_FORMATS = ["png", "jpeg", "svg"] as const;

export type ExportFormat = (typeof EXPORT_FORMATS)[number];

export function isExportFormat(value: unknown): value is ExportFormat {
  return value === "png" || value === "jpeg" || value === "svg";
}

export const DEFAULT_JPEG_QUALITY = 90;
export const MIN_JPEG_QUALITY = 1;
export const MAX_JPEG_QUALITY = 100;

/** Max encoded bytes = 4x the Phase 3 raster budget (stored-block overhead). */
export const MAX_EXPORT_BYTES = 67_108_864;

export interface ExportConfig {
  readonly background: {
    readonly a: number;
    readonly b: number;
    readonly g: number;
    readonly r: number;
  };
  readonly filename: string;
  readonly format: ExportFormat;
  /** JPEG only, 1..100. Ignored by PNG/SVG. */
  readonly quality: number;
}

export interface ExportConfigInput {
  readonly background?: unknown;
  readonly filename?: unknown;
  readonly format?: unknown;
  readonly quality?: unknown;
}

export type ExportErrorCode =
  | "INVALID_FORMAT"
  | "INVALID_QUALITY"
  | "INVALID_FILENAME"
  | "INVALID_COLOR"
  | "RENDER_LIMIT_EXCEEDED"
  | "ENCODE_FAILED"
  | "FILESYSTEM_ERROR"
  | "CANCELLED";

export interface ExportError {
  readonly code: ExportErrorCode;
  readonly message: string;
  readonly details?:
    | Readonly<Record<string, boolean | number | string | null>>
    | null
    | undefined;
}

export type ExportResult<T> = Result<T, ExportError>;

/** Fully encoded file payload, ready for a FileSink. */
export interface EncodedFile {
  readonly bytes: Uint8Array;
  readonly filename: string;
  readonly format: ExportFormat;
  readonly height: number;
  readonly mimeType: string;
  readonly width: number;
}

export function extensionForFormat(format: ExportFormat): string {
  switch (format) {
    case "png":
      return "png";
    case "jpeg":
      return "jpg";
    case "svg":
      return "svg";
  }
}

export function mimeForFormat(format: ExportFormat): string {
  switch (format) {
    case "png":
      return "image/png";
    case "jpeg":
      return "image/jpeg";
    case "svg":
      return "image/svg+xml";
  }
}
