import { err, ok, type Result } from "@patternforge/shared";
import type { GenerationConfig, GenerationResult } from "@patternforge/core";
import {
  buildFilename,
  exportPatternSvg,
  exportRaster,
  mimeForFormat,
  validateExportConfig,
  type EncodedFile,
  type ExportError,
  type ExportFormat,
} from "@patternforge/export-engine";
import type { RasterImage } from "@patternforge/renderer-engine";

/**
 * Pure export orchestration (no DOM): validate config -> encode the
 * current preview tile/pattern -> filename. The caller hands the
 * EncodedFile to a FileSink. Never executes files, never touches shell.
 */

export interface ExportRequestInput {
  readonly filename?: string;
  readonly format: ExportFormat;
  readonly quality?: number;
}

export interface PreparedExport {
  readonly config: {
    readonly background: GenerationConfig["backgroundColor"];
    readonly filename: string;
    readonly format: ExportFormat;
    readonly quality: number;
  };
}

/** Validate UI export choices against the current tile. */
export function prepareTileExport(
  tile: RasterImage,
  pattern: GenerationResult,
  config: GenerationConfig,
  request: ExportRequestInput,
  itemIndex?: number,
): Result<{ file: EncodedFile }, ExportError> {
  const validated = validateExportConfig({
    background: config.backgroundColor,
    filename:
      request.filename !== undefined && request.filename.length > 0
        ? request.filename
        : undefined,
    format: request.format,
    quality: request.quality,
  });
  if (!validated.ok) {
    return err(validated.error);
  }
  const resolved =
    request.filename !== undefined && request.filename.length > 0
      ? validated
      : withDeterministicName(validated, config, request, itemIndex);
  if (!resolved.ok) {
    return resolved;
  }
  const exportConfig = resolved.value;
  if (exportConfig.format === "svg") {
    const encoded = exportPatternSvg(pattern, exportConfig);
    if (!encoded.ok) {
      return err(encoded.error);
    }
    return ok({ file: encoded.value });
  }
  const encoded = exportRaster(tile, exportConfig);
  if (!encoded.ok) {
    return err(encoded.error);
  }
  return ok({ file: encoded.value });
}

function withDeterministicName(
  validated: Result<
    {
      background: GenerationConfig["backgroundColor"];
      filename: string;
      format: ExportFormat;
      quality: number;
    },
    ExportError
  >,
  config: GenerationConfig,
  request: ExportRequestInput,
  itemIndex: number | undefined,
): Result<
  {
    background: GenerationConfig["backgroundColor"];
    filename: string;
    format: ExportFormat;
    quality: number;
  },
  ExportError
> {
  if (!validated.ok) {
    return validated;
  }
  const named = buildFilename(
    config.seed,
    config.width,
    config.height,
    request.format,
    itemIndex,
  );
  if (!named.ok) {
    return err(named.error);
  }
  return ok({ ...validated.value, filename: named.value });
}

export function describeExport(file: EncodedFile): string {
  return `${file.filename} (${mimeForFormat(file.format)}, ${file.width}x${file.height}, ${file.bytes.length} B)`;
}
