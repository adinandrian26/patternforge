import { describe, expect, it } from "vitest";
import {
  DEFAULT_GENERATION_CONFIG,
  validateGenerationConfig,
  validatePatternParameters,
} from "@patternforge/core";
import {
  PATTERN_ALGORITHM_VERSION,
  SCHEMA_VERSION,
} from "@patternforge/shared";
import { generatePattern } from "@patternforge/pattern-engine";
import {
  computeImageChecksum,
  renderTile,
} from "@patternforge/renderer-engine";
import { serializeEps } from "@patternforge/export-engine";
import { serializeSvg } from "@patternforge/export-engine";
import type { GenerationResult } from "@patternforge/core";

const BG = { a: 255, b: 255, g: 255, r: 255 };
const FG = { a: 255, b: 0, g: 0, r: 0 };

function generateFor(
  seed: string | number,
  patch: Record<string, unknown> = {},
): GenerationResult {
  const config = validateGenerationConfig({
    ...DEFAULT_GENERATION_CONFIG,
    seed,
    ...patch,
  });
  if (!config.ok) {
    throw new Error(`config invalid: ${config.error.message}`);
  }
  const value = config.value;
  const generated = generatePattern({
    algorithmVersion: PATTERN_ALGORITHM_VERSION,
    dimensions: { height: value.height, width: value.width },
    options: {
      colorOrder: value.colorOrder,
      lineThickness: value.lineThickness,
      opacityMax: value.opacityMax,
      opacityMin: value.opacityMin,
    },
    palette: value.palette,
    parameters: {
      arrangement: value.arrangement,
      canvasHeight: value.height,
      canvasWidth: value.width,
      complexity: value.complexity,
      density: value.density,
      positionJitter: value.positionJitter,
      primitiveType: value.primitiveType,
      rotationBase: value.rotationBase,
      rotationRange: value.rotationRange,
      scale: value.scale,
    },
    schemaVersion: SCHEMA_VERSION,
    seed: value.seed,
  });
  if (!generated.ok) {
    throw new Error("generation failed");
  }
  return generated.value;
}

function checksumOf(pattern: GenerationResult): string {
  const rendered = renderTile(
    pattern.primitives,
    pattern.width,
    pattern.height,
    {
      background: BG,
      foreground: FG,
    },
  );
  if (!rendered.ok) {
    throw new Error(`render failed: ${rendered.error.message}`);
  }
  return computeImageChecksum(rendered.value);
}

describe("stock shape validation", () => {
  it("accepts star/ring/flower/wave types with defaults", () => {
    for (const primitiveType of ["star", "ring", "flower", "wave"] as const) {
      const config = validateGenerationConfig({
        ...DEFAULT_GENERATION_CONFIG,
        primitiveType,
      });
      expect(config.ok).toBe(true);
    }
  });

  it("rejects bad arrangement and rotationBase", () => {
    expect(
      validatePatternParameters({
        arrangement: "spiral",
        canvasHeight: 64,
        canvasWidth: 64,
        complexity: 3,
        density: 5,
        positionJitter: 0.1,
        primitiveType: "circle",
        rotationRange: Math.PI,
        scale: 0.5,
      }).ok,
    ).toBe(false);
    const badBase = validateGenerationConfig({
      ...DEFAULT_GENERATION_CONFIG,
      rotationBase: Math.PI * 3,
    });
    expect(badBase.ok).toBe(false);
    if (!badBase.ok) {
      expect(badBase.error.code).toBe("INVALID_ROTATION_BASE");
    }
  });

  it("defaults arrangement to scatter and rotationBase to 0", () => {
    const params = validatePatternParameters({
      canvasHeight: 64,
      canvasWidth: 64,
      complexity: 3,
      density: 5,
      positionJitter: 0.1,
      primitiveType: "circle",
      rotationRange: Math.PI,
      scale: 0.5,
    });
    if (!params.ok) {
      throw new Error("params invalid");
    }
    expect(params.value.arrangement).toBe("scatter");
    expect(params.value.rotationBase).toBe(0);
  });
});

describe("stock shape generation", () => {
  it("emits one typed primitive per slot, deterministically", () => {
    for (const primitiveType of ["star", "ring", "flower", "wave"] as const) {
      const first = generateFor("4242", {
        height: 64,
        primitiveType,
        width: 64,
      });
      const second = generateFor("4242", {
        height: 64,
        primitiveType,
        width: 64,
      });
      expect(first).toEqual(second);
      expect(first.primitiveCount).toBe(first.primitives.length);
      for (const primitive of first.primitives) {
        expect(primitive.type).toBe(primitiveType);
      }
    }
  });

  it("locks golden checksums for the new shapes", () => {
    const cases: ReadonlyArray<readonly [string, string]> = [
      ["star", "eee95304"],
      ["ring", "8cbfc1dd"],
      ["flower", "8ee75b44"],
      ["wave", "e5e42324"],
    ];
    for (const [primitiveType, golden] of cases) {
      const pattern = generateFor("4242", {
        complexity: 4,
        density: 10,
        height: 64,
        primitiveType,
        width: 64,
      });
      expect(checksumOf(pattern)).toBe(golden);
    }
  });

  it("shifts every rotation by rotationBase", () => {
    const pattern = generateFor("99", {
      height: 64,
      primitiveType: "star",
      rotationBase: Math.PI / 2,
      rotationRange: 0,
      width: 64,
    });
    expect(pattern.primitives.length).toBeGreaterThan(0);
    for (const primitive of pattern.primitives) {
      expect(primitive.rotation).toBeCloseTo(Math.PI / 2, 12);
    }
  });

  it("places grid items on lattice centers with zero jitter", () => {
    const pattern = generateFor("7", {
      arrangement: "grid",
      density: 25,
      height: 100,
      positionJitter: 0,
      primitiveType: "circle",
      width: 100,
    });
    // count = ceil(100*100*25/10000) = 25 -> 5x5 lattice, 20px cells.
    expect(pattern.primitiveCount).toBe(25);
    const xs = new Set(pattern.primitives.map((p) => Math.round(p.x)));
    const ys = new Set(pattern.primitives.map((p) => Math.round(p.y)));
    expect([...xs].sort((a, b) => a - b)).toEqual([10, 30, 50, 70, 90]);
    expect([...ys].sort((a, b) => a - b)).toEqual([10, 30, 50, 70, 90]);
    expect(checksumOf(pattern)).toBe("dcd0a1f5");
  });

  it("keeps rows items inside their bands", () => {
    const pattern = generateFor("7", {
      arrangement: "rows",
      density: 25,
      height: 100,
      positionJitter: 0,
      primitiveType: "line",
      width: 100,
    });
    // count 25 -> rows = round(sqrt(25) / 2) = 3 bands.
    const rows = Math.max(1, Math.round(Math.sqrt(25) / 2));
    for (const primitive of pattern.primitives) {
      const band = Math.floor((primitive.y / 100) * rows);
      expect(band).toBeGreaterThanOrEqual(0);
      expect(band).toBeLessThan(rows);
      const center = ((band + 0.5) * 100) / rows;
      expect(Math.abs(primitive.y - center)).toBeLessThan(1);
    }
    expect(checksumOf(pattern)).toBe("83e6e9fd");
  });
});

describe("stock shape vectors", () => {
  it("serializes new shapes to SVG without strokes", () => {
    for (const primitiveType of ["star", "ring", "flower", "wave"] as const) {
      const pattern = generateFor("4242", {
        height: 64,
        primitiveType,
        width: 64,
      });
      const serialized = serializeSvg(pattern, {
        background: BG,
        fallbackFill: FG,
      });
      if (!serialized.ok) {
        throw new Error(`svg failed: ${serialized.error.message}`);
      }
      expect(serialized.value).toContain("<svg");
      expect(serialized.value).not.toContain("<script");
    }
    const ring = generateFor("4242", {
      height: 64,
      primitiveType: "ring",
      width: 64,
    });
    const ringSvg = serializeSvg(ring, {
      background: BG,
      fallbackFill: FG,
    });
    if (!ringSvg.ok) {
      throw new Error("ring svg failed");
    }
    expect(ringSvg.value).toContain('fill-rule="evenodd"');
    const flower = generateFor("4242", {
      height: 64,
      primitiveType: "flower",
      width: 64,
    });
    const flowerSvg = serializeSvg(flower, {
      background: BG,
      fallbackFill: FG,
    });
    if (!flowerSvg.ok) {
      throw new Error("flower svg failed");
    }
    expect(flowerSvg.value).toContain("<ellipse");
  });

  it("serializes new shapes to stock-safe EPS", () => {
    for (const primitiveType of ["star", "ring", "flower", "wave"] as const) {
      const pattern = generateFor("4242", {
        height: 64,
        primitiveType,
        width: 64,
      });
      const serialized = serializeEps(pattern, {
        background: BG,
        fallbackFill: FG,
        targetHeight: 3000,
        targetWidth: 3000,
      });
      if (!serialized.ok) {
        throw new Error(`eps failed: ${serialized.error.message}`);
      }
      const body = serialized.value.slice(
        serialized.value.indexOf("%%EndComments"),
      );
      expect(/\bstroke\b/.test(body)).toBe(false);
      expect(body).toContain(" fill\n");
    }
    const ring = generateFor("4242", {
      height: 64,
      primitiveType: "ring",
      width: 64,
    });
    const ringEps = serializeEps(ring, {
      background: BG,
      fallbackFill: FG,
      targetHeight: 3000,
      targetWidth: 3000,
    });
    if (!ringEps.ok) {
      throw new Error("ring eps failed");
    }
    expect(ringEps.value).toContain("eofill");
  });
});
