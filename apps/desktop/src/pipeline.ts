import type { GenerationConfig, GenerationResult } from "@patternforge/core";
import {
  PATTERN_ALGORITHM_VERSION,
  SCHEMA_VERSION,
  err,
  ok,
  type Result,
} from "@patternforge/shared";
import {
  generatePattern,
  type GenerationError,
} from "@patternforge/pattern-engine";
import {
  composePreviewGrid,
  computeImageChecksum,
  renderTile,
  validateTileSeamless,
  type RasterImage,
  type RenderError,
  type TileSeamlessReport,
} from "@patternforge/renderer-engine";

/**
 * Deterministic UI -> generator -> renderer pipeline (Phase 4).
 * Pure orchestration: no DOM, no Preact, no randomness. The UI only
 * supplies a validated `GenerationConfig` and renders the returned
 * `PreviewData`. Heavy pixel work runs synchronously behind the
 * explicit Generate button on bounded preview sizes.
 */

export interface PreviewData {
  readonly checksum: string;
  readonly grid: RasterImage;
  readonly pattern: GenerationResult;
  readonly seamless: TileSeamlessReport;
  readonly tile: RasterImage;
}

export type PipelineError =
  | { readonly kind: "generation"; readonly error: GenerationError }
  | { readonly kind: "preview"; readonly error: RenderError }
  | { readonly kind: "render"; readonly error: RenderError };

export function formatPipelineError(error: PipelineError): string {
  switch (error.kind) {
    case "generation":
      return `Generation failed: ${JSON.stringify(error.error)}`;
    case "render":
      return `Render failed: ${error.error.message}`;
    case "preview":
      return `Preview failed: ${error.error.message}`;
  }
}

/**
 * Run validate -> generate -> render -> 3x3 compose -> seamless check.
 * The config is assumed validated (`validateGenerationConfig` or
 * `normalizeUiForm`); invalid configs return typed errors, never pixels.
 */
export function runGenerationPipeline(
  config: GenerationConfig,
): Result<PreviewData, PipelineError> {
  const generated = generatePattern({
    algorithmVersion: PATTERN_ALGORITHM_VERSION,
    dimensions: { height: config.height, width: config.width },
    options: {
      colorOrder: config.colorOrder,
      lineThickness: config.lineThickness,
      opacityMax: config.opacityMax,
      opacityMin: config.opacityMin,
    },
    palette: config.palette,
    parameters: {
      canvasHeight: config.height,
      canvasWidth: config.width,
      complexity: config.complexity,
      density: config.density,
      positionJitter: config.positionJitter,
      primitiveType: config.primitiveType,
      rotationRange: config.rotationRange,
      scale: config.scale,
    },
    schemaVersion: SCHEMA_VERSION,
    seed: config.seed,
  });
  if (!generated.ok) {
    return err({ error: generated.error, kind: "generation" });
  }
  const pattern = generated.value;

  const rendered = renderTile(pattern.primitives, config.width, config.height, {
    background: config.backgroundColor,
    foreground: config.palette.colors[0] ?? {
      a: 255,
      b: 0,
      g: 0,
      r: 0,
    },
  });
  if (!rendered.ok) {
    return err({ error: rendered.error, kind: "render" });
  }

  const grid = composePreviewGrid(rendered.value, 3, 3);
  if (!grid.ok) {
    return err({ error: grid.error, kind: "preview" });
  }

  const seamless = validateTileSeamless(
    pattern.primitives,
    config.width,
    config.height,
    {
      background: config.backgroundColor,
      foreground: config.palette.colors[0] ?? {
        a: 255,
        b: 0,
        g: 0,
        r: 0,
      },
    },
  );

  return ok({
    checksum: computeImageChecksum(rendered.value),
    grid: grid.value,
    pattern,
    seamless,
    tile: rendered.value,
  });
}
