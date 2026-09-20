import { describe, expect, it } from "vitest";
import {
  DEFAULT_GENERATION_CONFIG,
  validateGenerationConfig,
} from "@patternforge/core";
import {
  PATTERN_ALGORITHM_VERSION,
  SCHEMA_VERSION,
} from "@patternforge/shared";
import { generatePattern } from "@patternforge/pattern-engine";
import {
  DEFAULT_STOCK_EPS_SIZE,
  exportPatternEps,
  exportRaster,
  extensionForFormat,
  isStockEpsSize,
  mimeForFormat,
  serializeEps,
  STOCK_EPS_SIZES,
  validateExportConfig,
} from "@patternforge/export-engine";
import type { GenerationResult } from "@patternforge/core";
import type { RasterImage } from "@patternforge/renderer-engine";

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
  patch: Record<string, unknown> = {},
): GenerationResult {
  const config = configWith({ seed, ...patch });
  const generated = generatePattern({
    algorithmVersion: PATTERN_ALGORITHM_VERSION,
    dimensions: { height: config.height, width: config.width },
    options: {},
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
    throw new Error("generation failed");
  }
  return generated.value;
}

const WHITE_BG = { a: 255, b: 255, g: 255, r: 255 };
const BLACK_FILL = { a: 255, b: 0, g: 0, r: 0 };

function epsConfig() {
  const validated = validateExportConfig({
    background: WHITE_BG,
    format: "eps",
  });
  if (!validated.ok) {
    throw new Error(`eps config invalid: ${validated.error.message}`);
  }
  return validated.value;
}

describe("shutterstock EPS presets", () => {
  it("exposes 2000/3000/4000 long-side presets", () => {
    expect([...STOCK_EPS_SIZES]).toEqual([2000, 3000, 4000]);
    expect(DEFAULT_STOCK_EPS_SIZE).toBe(3000);
    expect(isStockEpsSize(3000)).toBe(true);
    expect(isStockEpsSize(1234)).toBe(false);
    expect(extensionForFormat("eps")).toBe("eps");
    expect(mimeForFormat("eps")).toBe("application/postscript");
  });
});

describe("serializeEps structure", () => {
  it("emits an EPSF header with matching bounding box", () => {
    const pattern = generateFor("12345", { height: 64, width: 64 });
    const serialized = serializeEps(pattern, {
      background: WHITE_BG,
      fallbackFill: BLACK_FILL,
      targetHeight: 3000,
      targetWidth: 3000,
    });
    if (!serialized.ok) {
      throw new Error(`eps failed: ${serialized.error.message}`);
    }
    const text = serialized.value;
    expect(text.startsWith("%!PS-Adobe-3.0 EPSF-3.0\n")).toBe(true);
    expect(text).toContain("%%BoundingBox: 0 0 3000 3000");
    expect(text).toContain("%%HiResBoundingBox: 0 0 3000.000 3000.000");
    expect(text.trimEnd().endsWith("%%EOF")).toBe(true);
    expect(text).toContain("\nshowpage\n");
  });

  it("is byte-deterministic for the same pattern", () => {
    const pattern = generateFor("12345", { height: 64, width: 64 });
    const options = {
      background: WHITE_BG,
      fallbackFill: BLACK_FILL,
      targetHeight: 3000,
      targetWidth: 3000,
    };
    const first = serializeEps(pattern, options);
    const second = serializeEps(pattern, options);
    if (!first.ok || !second.ok) {
      throw new Error("eps failed");
    }
    expect(first.value).toBe(second.value);
  });

  it("emits no timestamps", () => {
    const pattern = generateFor("12345", { height: 32, width: 32 });
    const serialized = serializeEps(pattern, {
      background: WHITE_BG,
      fallbackFill: BLACK_FILL,
      targetHeight: 2000,
      targetWidth: 2000,
    });
    if (!serialized.ok) {
      throw new Error("eps failed");
    }
    expect(/\d{4}-\d{2}-\d{2}/.test(serialized.value)).toBe(false);
    expect(serialized.value).not.toContain("CreationDate");
  });

  it("keeps gsave/grestore balanced", () => {
    const pattern = generateFor("12345", { height: 64, width: 64 });
    const serialized = serializeEps(pattern, {
      background: WHITE_BG,
      fallbackFill: BLACK_FILL,
      targetHeight: 3000,
      targetWidth: 3000,
    });
    if (!serialized.ok) {
      throw new Error("eps failed");
    }
    const saves = serialized.value.match(/^gsave$/gm) ?? [];
    const restores = serialized.value.match(/^grestore$/gm) ?? [];
    expect(saves.length).toBeGreaterThan(0);
    expect(saves.length).toBe(restores.length);
  });
});

describe("serializeEps stock safety", () => {
  it("uses only Illustrator 8-safe operators", () => {
    const pattern = generateFor("7", {
      height: 64,
      primitiveType: "line",
      width: 64,
    });
    const serialized = serializeEps(pattern, {
      background: WHITE_BG,
      fallbackFill: BLACK_FILL,
      targetHeight: 3000,
      targetWidth: 3000,
    });
    if (!serialized.ok) {
      throw new Error(`eps failed: ${serialized.error.message}`);
    }
    const body = serialized.value.slice(
      serialized.value.indexOf("%%EndComments"),
    );
    for (const banned of [
      /\bstroke\b/,
      /\bsetlinewidth\b/,
      /\bsetgray\b/,
      /\bsetcmykcolor\b/,
      /\bimage\b/,
      /\bshow\b/,
      /opacity/,
      /gradient/,
    ]) {
      expect(banned.test(body)).toBe(false);
    }
    // Lines are expanded to filled paths with round caps (beziers).
    expect(body).toContain("curveto");
    expect(body).toContain(" fill\n");
  });

  it("flattens opaque colors to solid sRGB", () => {
    const pattern = generateFor("12345", {
      height: 32,
      primitiveType: "circle",
      width: 32,
    });
    const first = pattern.primitives[0];
    if (first === undefined) {
      throw new Error("no primitives");
    }
    const solid = {
      ...pattern,
      primitives: [
        { ...first, color: { a: 255, b: 0, g: 0, r: 255 }, opacity: 1 },
      ],
    };
    const serialized = serializeEps(solid, {
      background: WHITE_BG,
      fallbackFill: BLACK_FILL,
      targetHeight: 2000,
      targetWidth: 2000,
    });
    if (!serialized.ok) {
      throw new Error(`eps failed: ${serialized.error.message}`);
    }
    expect(serialized.value).toContain("1 0 0 setrgbcolor");
  });

  it("flattens half opacity to 0.502 gray over white", () => {
    const pattern = generateFor("12345", {
      height: 32,
      primitiveType: "circle",
      width: 32,
    });
    const first = pattern.primitives[0];
    if (first === undefined) {
      throw new Error("no primitives");
    }
    const faded = {
      ...pattern,
      primitives: [
        { ...first, color: { a: 255, b: 0, g: 0, r: 0 }, opacity: 0.5 },
      ],
    };
    const serialized = serializeEps(faded, {
      background: WHITE_BG,
      fallbackFill: BLACK_FILL,
      targetHeight: 2000,
      targetWidth: 2000,
    });
    if (!serialized.ok) {
      throw new Error(`eps failed: ${serialized.error.message}`);
    }
    expect(serialized.value).toContain("0.502 0.502 0.502 setrgbcolor");
  });

  it("rejects artwork outside 4..25MP", () => {
    const pattern = generateFor("12345", { height: 32, width: 32 });
    const tiny = serializeEps(pattern, {
      background: WHITE_BG,
      fallbackFill: BLACK_FILL,
      targetHeight: 100,
      targetWidth: 100,
    });
    expect(tiny.ok).toBe(false);
    if (!tiny.ok) {
      expect(tiny.error.code).toBe("STOCK_SIZE_INVALID");
    }
    const huge = serializeEps(pattern, {
      background: WHITE_BG,
      fallbackFill: BLACK_FILL,
      targetHeight: 6000,
      targetWidth: 6000,
    });
    expect(huge.ok).toBe(false);
    if (!huge.ok) {
      expect(huge.error.code).toBe("STOCK_SIZE_INVALID");
    }
  });
});

describe("exportPatternEps", () => {
  it("scales the longest side to the preset and names .eps", () => {
    const pattern = generateFor("12345", { height: 600, width: 800 });
    const encoded = exportPatternEps(pattern, epsConfig(), 3000);
    if (!encoded.ok) {
      throw new Error(`eps failed: ${encoded.error.message}`);
    }
    expect(encoded.value.width).toBe(3000);
    expect(encoded.value.height).toBe(2250);
    expect(encoded.value.format).toBe("eps");
    expect(encoded.value.mimeType).toBe("application/postscript");
    expect(encoded.value.filename.endsWith(".eps")).toBe(true);
    expect(encoded.value.bytes.length).toBeGreaterThan(100);
  });

  it("rejects non-preset long sides", () => {
    const pattern = generateFor("12345", { height: 64, width: 64 });
    const encoded = exportPatternEps(pattern, epsConfig(), 1234);
    expect(encoded.ok).toBe(false);
    if (!encoded.ok) {
      expect(encoded.error.code).toBe("STOCK_SIZE_INVALID");
    }
  });

  it("rejects extreme aspects that fall below 4MP", () => {
    const pattern = generateFor("12345", { height: 100, width: 2000 });
    const encoded = exportPatternEps(pattern, epsConfig(), 2000);
    expect(encoded.ok).toBe(false);
    if (!encoded.ok) {
      expect(encoded.error.code).toBe("STOCK_SIZE_INVALID");
    }
  });

  it("requires the eps format", () => {
    const pattern = generateFor("12345", { height: 32, width: 32 });
    const pngConfig = validateExportConfig({ format: "png" });
    if (!pngConfig.ok) {
      throw new Error("png config invalid");
    }
    expect(exportPatternEps(pattern, pngConfig.value).ok).toBe(false);
    const tile: RasterImage = {
      data: new Uint8Array(32 * 32 * 4),
      height: 32,
      width: 32,
    };
    const raster = exportRaster(tile, {
      ...pngConfig.value,
      format: "eps",
    });
    expect(raster.ok).toBe(false);
  });
});
