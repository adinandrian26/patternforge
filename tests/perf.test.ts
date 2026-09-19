import { describe, expect, it } from "vitest";
import { DEFAULT_GENERATION_CONFIG } from "@patternforge/core";
import {
  PATTERN_ALGORITHM_VERSION,
  SCHEMA_VERSION,
} from "@patternforge/shared";
import { generatePattern } from "@patternforge/pattern-engine";
import { renderTile } from "@patternforge/renderer-engine";
import { runGenerationPipeline } from "../apps/desktop/src/pipeline";
import { normalizeUiForm, DEFAULT_UI_FORM } from "../apps/desktop/src/config";

function configFor(size: number, density: number) {
  const normalized = normalizeUiForm({
    ...DEFAULT_UI_FORM,
    density,
    height: size,
    width: size,
  });
  if (!normalized.ok) {
    throw new Error("config invalid");
  }
  return normalized.value;
}

describe("performance smoke", () => {
  it("completes 128x128", () => {
    const preview = runGenerationPipeline(configFor(128, 5));
    expect(preview.ok).toBe(true);
  });

  it("completes 256x256", () => {
    const preview = runGenerationPipeline(configFor(256, 5));
    expect(preview.ok).toBe(true);
  });

  it("completes 512x512", () => {
    const preview = runGenerationPipeline(configFor(512, 4));
    expect(preview.ok).toBe(true);
  }, 30000);

  it("completes 1024x1024 tile within bounded memory", () => {
    // Tile-only: a 3x3 grid at 1024px (3072px) exceeds the 2048px
    // renderer limit by design, so the max-axis smoke test covers
    // generate + single-tile render, which is the bounded unit of work.
    const config = {
      ...DEFAULT_GENERATION_CONFIG,
      density: 2,
      height: 1024,
      width: 1024,
    };
    const generated = generatePattern({
      algorithmVersion: PATTERN_ALGORITHM_VERSION,
      dimensions: { height: 1024, width: 1024 },
      palette: config.palette,
      parameters: {
        canvasHeight: 1024,
        canvasWidth: 1024,
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
    expect(generated.ok).toBe(true);
    if (!generated.ok) {
      return;
    }
    const rendered = renderTile(generated.value.primitives, 1024, 1024, {
      background: config.backgroundColor,
      foreground: config.palette.colors[0] ?? {
        a: 255,
        b: 0,
        g: 0,
        r: 0,
      },
    });
    expect(rendered.ok).toBe(true);
    if (rendered.ok) {
      expect(rendered.value.data.length).toBe(1024 * 1024 * 4);
    }
  }, 60000);
});
