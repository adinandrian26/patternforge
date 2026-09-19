import { describe, expect, it } from "vitest";
import {
  DEFAULT_GENERATION_CONFIG,
  validateGenerationConfig,
  validateGenerationOptions,
} from "@patternforge/core";
import {
  PATTERN_ALGORITHM_VERSION,
  SCHEMA_VERSION,
} from "@patternforge/shared";
import { generatePattern } from "@patternforge/pattern-engine";
import {
  computeImageChecksum,
  renderPattern,
  renderTile,
} from "@patternforge/renderer-engine";

function configWith(patch: Record<string, unknown>) {
  const result = validateGenerationConfig({
    ...DEFAULT_GENERATION_CONFIG,
    ...patch,
  });
  if (!result.ok) {
    throw new Error(`config invalid: ${result.error.message}`);
  }
  return result.value;
}

function generateFor(
  seed: string | number,
  options: Record<string, unknown> = {},
  patch: Record<string, unknown> = {},
) {
  const config = configWith({ seed, ...patch });
  return generatePattern({
    algorithmVersion: PATTERN_ALGORITHM_VERSION,
    dimensions: { height: config.height, width: config.width },
    options: { ...options },
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
}

describe("advanced controls validation", () => {
  it("accepts defaults and rejects out-of-range controls", () => {
    expect(validateGenerationOptions({}).ok).toBe(true);
    expect(
      validateGenerationOptions({
        colorOrder: "random",
        lineThickness: 2,
        opacityMax: 0.9,
        opacityMin: 0.4,
      }).ok,
    ).toBe(true);
    expect(validateGenerationOptions({ lineThickness: 0.1 }).ok).toBe(false);
    expect(validateGenerationOptions({ lineThickness: 9 }).ok).toBe(false);
    expect(
      validateGenerationOptions({ opacityMin: 0.8, opacityMax: 0.2 }).ok,
    ).toBe(false);
    expect(validateGenerationOptions({ opacityMin: -0.1 }).ok).toBe(false);
    expect(validateGenerationOptions({ colorOrder: "shuffle" }).ok).toBe(false);
    expect(
      validateGenerationConfig({
        ...DEFAULT_GENERATION_CONFIG,
        lineThickness: 99,
      }).ok,
    ).toBe(false);
  });

  it("rejects invalid options at generation time", () => {
    const bad = generateFor("1", { lineThickness: 99 });
    expect(bad.ok).toBe(false);
    if (!bad.ok) {
      expect(bad.error.code).toBe("INVALID_OPTIONS");
    }
  });
});

describe("defaults preserve Phase 3/4 goldens", () => {
  it("keeps a319b114 and 473443c3 byte-identical", () => {
    const tiny = configWith({
      complexity: 3,
      density: 5,
      height: 32,
      positionJitter: 0.1,
      primitiveType: "circle",
      rotationRange: Math.PI,
      scale: 0.5,
      seed: "12345",
      width: 32,
    });
    const pattern = generateFor("12345", {}, { ...tiny, seed: "12345" });
    if (!pattern.ok) {
      throw new Error("generation failed");
    }
    const tile = renderPattern(pattern.value);
    if (!tile.ok) {
      throw new Error("render failed");
    }
    expect(computeImageChecksum(tile.value)).toBe("a319b114");

    const rich = generatePattern({
      algorithmVersion: PATTERN_ALGORITHM_VERSION,
      dimensions: { height: 64, width: 64 },
      options: {},
      palette: {
        colors: [
          { a: 255, b: 0, g: 0, r: 255 },
          { a: 255, b: 255, g: 0, r: 0 },
          { a: 255, b: 0, g: 255, r: 255 },
        ],
      },
      parameters: {
        canvasHeight: 64,
        canvasWidth: 64,
        complexity: 3,
        density: 10,
        positionJitter: 0.1,
        primitiveType: "circle",
        rotationRange: Math.PI,
        scale: 0.5,
      },
      schemaVersion: SCHEMA_VERSION,
      seed: "12345",
    });
    if (!rich.ok) {
      throw new Error("rich generation failed");
    }
    const richTile = renderTile(rich.value.primitives, 64, 64);
    if (!richTile.ok) {
      throw new Error("rich render failed");
    }
    expect(computeImageChecksum(richTile.value)).toBe("473443c3");
  });
});

describe("line thickness", () => {
  it("thickens lines and validates bounds", () => {
    const thin = generateFor(
      "5",
      { lineThickness: 1 },
      { primitiveType: "line" },
    );
    const thick = generateFor(
      "5",
      { lineThickness: 4 },
      { primitiveType: "line" },
    );
    if (!thin.ok || !thick.ok) {
      throw new Error("generation failed");
    }
    const thinTile = renderPattern(thin.value);
    const thickTile = renderPattern(thick.value);
    if (!thinTile.ok || !thickTile.ok) {
      throw new Error("render failed");
    }
    const count = (data: Uint8Array): number => {
      let n = 0;
      for (let i = 0; i < data.length; i += 4) {
        if (data[i] !== 255 || data[i + 1] !== 255 || data[i + 2] !== 255) {
          n += 1;
        }
      }
      return n;
    };
    expect(count(thickTile.value.data)).toBeGreaterThan(
      count(thinTile.value.data),
    );
  });
});

describe("opacity range", () => {
  it("varies per-primitive opacity deterministically", () => {
    const first = generateFor("9", { opacityMax: 0.9, opacityMin: 0.2 });
    const second = generateFor("9", { opacityMax: 0.9, opacityMin: 0.2 });
    if (!first.ok || !second.ok) {
      throw new Error("generation failed");
    }
    expect(first.value).toEqual(second.value);
    const opacities = first.value.primitives.map((p) => p.opacity);
    expect(opacities.length).toBeGreaterThan(0);
    for (const opacity of opacities) {
      expect(opacity).toBeGreaterThanOrEqual(0.2);
      expect(opacity).toBeLessThanOrEqual(0.9);
    }
    expect(new Set(opacities).size).toBeGreaterThan(1);
  });
});

describe("color order", () => {
  it("cycles sequentially without RNG draws", () => {
    const palette = {
      colors: [
        { a: 255, b: 0, g: 0, r: 255 },
        { a: 255, b: 255, g: 0, r: 0 },
      ],
    };
    const base = {
      algorithmVersion: PATTERN_ALGORITHM_VERSION,
      dimensions: { height: 64, width: 64 },
      palette,
      parameters: {
        canvasHeight: 64,
        canvasWidth: 64,
        complexity: 3,
        density: 10,
        positionJitter: 0.1,
        primitiveType: "circle" as const,
        rotationRange: Math.PI,
        scale: 0.5,
      },
      schemaVersion: SCHEMA_VERSION,
      seed: "3",
    };
    const sequential = generatePattern({
      ...base,
      options: { colorOrder: "sequential" },
    });
    if (!sequential.ok) {
      throw new Error("generation failed");
    }
    const colors = sequential.value.primitives.map((p) => p.color);
    expect(colors[0]).toEqual(palette.colors[0]);
    expect(colors[1]).toEqual(palette.colors[1]);
    expect(colors[2]).toEqual(palette.colors[0]);
    const rerun = generatePattern({
      ...base,
      options: { colorOrder: "sequential" },
    });
    expect(rerun.ok && rerun.value).toEqual(sequential.value);
  });
});
