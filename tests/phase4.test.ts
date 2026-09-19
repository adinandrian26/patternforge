import { describe, expect, it } from "vitest";
import {
  colorsEqual,
  colorToHex,
  DEFAULT_GENERATION_CONFIG,
  degreesToRadians,
  hexToColor,
  isRgbaColor,
  MAX_PALETTE_COLORS,
  normalizeColor,
  radiansToDegrees,
  rgbaToCss,
  validateGenerationConfig,
  validatePalette,
  validateRgbaColor,
  type Circle,
  type GenerationConfig,
  type RgbaColor,
} from "@patternforge/core";
import {
  PATTERN_ALGORITHM_VERSION,
  SCHEMA_VERSION,
  type EntityId,
} from "@patternforge/shared";
import { generatePattern, MAX_PRIMITIVES } from "@patternforge/pattern-engine";
import {
  composePreviewGrid,
  getPixel,
  imagesEqual,
  renderPattern,
  renderTile,
  validateTileSeamless,
} from "@patternforge/renderer-engine";
import {
  DEFAULT_UI_FORM,
  normalizeUiForm,
  resolvePaletteColors,
} from "../apps/desktop/src/config";
import { runGenerationPipeline } from "../apps/desktop/src/pipeline";

function unwrap<T, E>(
  result: { ok: true; value: T } | { ok: false; error: E },
): T {
  if (!result.ok) {
    throw new Error(`Expected ok, got error: ${JSON.stringify(result)}`);
  }
  return result.value;
}

const WHITE: RgbaColor = { a: 255, b: 255, g: 255, r: 255 };
const BLACK: RgbaColor = { a: 255, b: 0, g: 0, r: 0 };
const RED: RgbaColor = { a: 255, b: 0, g: 0, r: 255 };
const BLUE: RgbaColor = { a: 255, b: 255, g: 0, r: 0 };
const YELLOW: RgbaColor = { a: 255, b: 0, g: 255, r: 255 };

function testConfig(
  overrides: Partial<GenerationConfig> = {},
): GenerationConfig {
  return { ...DEFAULT_GENERATION_CONFIG, ...overrides };
}

function patternInput(config: GenerationConfig) {
  return {
    algorithmVersion: PATTERN_ALGORITHM_VERSION,
    dimensions: { height: config.height, width: config.width },
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
  };
}

describe("A. config validation", () => {
  it("accepts the default config", () => {
    expect(validateGenerationConfig(DEFAULT_GENERATION_CONFIG).ok).toBe(true);
  });

  it("rejects invalid fields with typed codes", () => {
    const cases: Array<{ code: string; patch: Partial<GenerationConfig> }> = [
      { code: "INVALID_SEED", patch: { seed: "" } },
      { code: "INVALID_WIDTH", patch: { width: 0 } },
      { code: "INVALID_HEIGHT", patch: { height: -4 } },
      { code: "INVALID_DENSITY", patch: { density: 0 } },
      { code: "INVALID_DENSITY", patch: { density: 101 } },
      { code: "INVALID_SCALE", patch: { scale: 0 } },
      { code: "INVALID_SCALE", patch: { scale: 1.5 } },
      { code: "INVALID_COMPLEXITY", patch: { complexity: 0 } },
      { code: "INVALID_COMPLEXITY", patch: { complexity: 9 } },
      { code: "INVALID_ROTATION", patch: { rotationRange: -1 } },
      {
        code: "INVALID_ROTATION",
        patch: { rotationRange: Math.PI * 2 + 1 },
      },
      { code: "INVALID_POSITION_JITTER", patch: { positionJitter: -0.1 } },
      { code: "INVALID_POSITION_JITTER", patch: { positionJitter: 1.5 } },
      {
        code: "INVALID_PRIMITIVE_TYPE",
        patch: { primitiveType: "triangle" as never },
      },
      {
        code: "INVALID_PALETTE",
        patch: { palette: { colors: [] } },
      },
      {
        code: "INVALID_BACKGROUND",
        patch: {
          backgroundColor: { a: 255, b: 0, g: 0, r: 300 },
        },
      },
    ];
    for (const { code, patch } of cases) {
      const result = validateGenerationConfig(testConfig(patch));
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe(code);
      }
    }
  });

  it("rejects NaN and Infinity", () => {
    expect(
      validateGenerationConfig(testConfig({ density: Number.NaN })).ok,
    ).toBe(false);
    expect(
      validateGenerationConfig(testConfig({ scale: Number.POSITIVE_INFINITY }))
        .ok,
    ).toBe(false);
  });
});

describe("B. color validation", () => {
  it("accepts valid RGBA colors", () => {
    expect(validateRgbaColor({ a: 255, b: 255, g: 255, r: 255 }).ok).toBe(true);
    expect(validateRgbaColor({ a: 0, b: 0, g: 0, r: 0 }).ok).toBe(true);
    expect(isRgbaColor(BLACK)).toBe(true);
  });

  it("rejects out-of-range, fractional, and malformed colors", () => {
    const invalid = [
      { a: 255, b: 0, g: 0, r: 300 },
      { a: 255, b: 0, g: -1, r: 0 },
      { a: 255, b: 0, g: 0.5, r: 0 },
      { a: 255, b: 0, g: 0 },
      null,
      "red",
      42,
    ];
    for (const value of invalid) {
      expect(validateRgbaColor(value).ok).toBe(false);
      expect(isRgbaColor(value)).toBe(false);
    }
  });

  it("normalizes finite colors and compares exactly", () => {
    expect(normalizeColor({ a: 300, b: -20, g: 127.4, r: 127.5 })).toEqual({
      a: 255,
      b: 0,
      g: 127,
      r: 128,
    });
    expect(colorsEqual(BLACK, { ...BLACK })).toBe(true);
    expect(colorsEqual(BLACK, WHITE)).toBe(false);
  });
});

describe("C. hex conversion", () => {
  it("parses short, long, and alpha hex forms", () => {
    expect(unwrap(hexToColor("#000"))).toEqual(BLACK);
    expect(unwrap(hexToColor("#ffffff"))).toEqual(WHITE);
    expect(unwrap(hexToColor("#FF0000"))).toEqual(RED);
    expect(unwrap(hexToColor("#ff000080"))).toEqual({
      a: 128,
      b: 0,
      g: 0,
      r: 255,
    });
    expect(unwrap(hexToColor("00ff00"))).toEqual({
      a: 255,
      b: 0,
      g: 255,
      r: 0,
    });
  });

  it("round-trips opaque colors and rejects garbage", () => {
    expect(colorToHex(BLACK)).toBe("#000000");
    expect(colorToHex(WHITE)).toBe("#ffffff");
    expect(unwrap(hexToColor(colorToHex(RED)))).toEqual(RED);
    expect(colorToHex({ a: 128, b: 0, g: 0, r: 255 })).toBe("#ff000080");
    for (const bad of ["#gg", "red", "", "#12345", 123, null]) {
      expect(hexToColor(bad).ok).toBe(false);
    }
  });

  it("formats display-only CSS without becoming canonical", () => {
    expect(rgbaToCss(RED)).toBe("rgba(255, 0, 0, 1.000)");
    expect(rgbaToCss({ a: 128, b: 0, g: 0, r: 255 })).toBe(
      "rgba(255, 0, 0, 0.502)",
    );
  });
});

describe("D. palette validation", () => {
  it("enforces non-empty bounded palettes of valid colors", () => {
    expect(MAX_PALETTE_COLORS).toBe(32);
    expect(validatePalette({ colors: [BLACK] }).ok).toBe(true);
    expect(validatePalette([RED, BLUE, YELLOW]).ok).toBe(true);
    expect(
      validatePalette({
        colors: Array.from({ length: 32 }, () => ({ ...BLACK })),
      }).ok,
    ).toBe(true);
  });

  it("rejects empty, oversized, and invalid palettes", () => {
    for (const bad of [
      { colors: [] },
      [],
      { colors: Array.from({ length: 33 }, () => ({ ...BLACK })) },
      { colors: [{ a: 255, b: 0, g: 0, r: 999 }] },
      { colors: ["red"] },
      "mono",
      null,
    ]) {
      const result = validatePalette(bad);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("INVALID_PALETTE");
      }
    }
  });
});

describe("E. background", () => {
  it("fills empty tiles with the configured background", () => {
    const red = unwrap(
      renderTile([], 8, 8, { background: RED, foreground: BLACK }),
    );
    expect(getPixel(red, 0, 0)).toEqual(RED);
    expect(getPixel(red, 7, 7)).toEqual(RED);
  });

  it("changes the pipeline checksum predictably", () => {
    const white = unwrap(runGenerationPipeline(testConfig()));
    const red = unwrap(
      runGenerationPipeline(testConfig({ backgroundColor: RED })),
    );
    expect(white.checksum).not.toBe(red.checksum);
    expect(getPixel(red.tile, 0, 0).r).toBe(255);
  });
});

describe("F. primitive color", () => {
  it("prefers per-primitive color over the foreground fallback", () => {
    const redCircle: Circle = {
      color: RED,
      id: "primitive-000001" as EntityId,
      opacity: 1,
      radius: 5,
      rotation: 0,
      scale: 1,
      type: "circle",
      x: 8,
      y: 8,
    };
    const colored = unwrap(
      renderTile([redCircle], 16, 16, { background: WHITE, foreground: BLUE }),
    );
    expect(getPixel(colored, 8, 8)).toEqual(RED);

    const plain: Circle = {
      id: "primitive-000001" as EntityId,
      opacity: 1,
      radius: 5,
      rotation: 0,
      scale: 1,
      type: "circle",
      x: 8,
      y: 8,
    };
    const fallback = unwrap(
      renderTile([plain], 16, 16, { background: WHITE, foreground: BLUE }),
    );
    expect(getPixel(fallback, 8, 8)).toEqual(BLUE);
  });
});

describe("G. deterministic color selection", () => {
  const palette = { colors: [RED, BLUE, YELLOW] };

  it("picks identical colors for identical seeds", () => {
    const config = testConfig({ density: 10, height: 100, width: 100 });
    const first = unwrap(generatePattern({ ...patternInput(config), palette }));
    const second = unwrap(
      generatePattern({ ...patternInput(config), palette }),
    );
    expect(first.primitives.map((p) => p.color)).toEqual(
      second.primitives.map((p) => p.color),
    );
    for (const primitive of first.primitives) {
      expect(primitive.color).toBeDefined();
      expect(
        palette.colors.some(
          (c) =>
            primitive.color !== undefined && colorsEqual(primitive.color, c),
        ),
      ).toBe(true);
    }
  });

  it("varies colors across seeds", () => {
    const sequences = [1, 2, 3, 4, 5].map((seed) => {
      const config = testConfig({ density: 10, height: 100, seed, width: 100 });
      const result = unwrap(
        generatePattern({ ...patternInput(config), palette }),
      );
      return result.primitives
        .map((p) => colorToHex(p.color ?? BLACK))
        .join("|");
    });
    expect(new Set(sequences).size).toBeGreaterThan(1);
  });
});

describe("H. deterministic generation", () => {
  it("produces identical patterns for identical configs", () => {
    const config = testConfig();
    const first = unwrap(generatePattern(patternInput(config)));
    const second = unwrap(generatePattern(patternInput(config)));
    expect(first).toEqual(second);
  });
});

describe("I. density", () => {
  it("increases primitive count and respects the 10k cap", () => {
    expect(MAX_PRIMITIVES).toBe(10_000);
    const low = unwrap(
      generatePattern(patternInput(testConfig({ density: 2 }))),
    );
    const high = unwrap(
      generatePattern(patternInput(testConfig({ density: 20 }))),
    );
    expect(high.primitiveCount).toBeGreaterThan(low.primitiveCount);
    const over = generatePattern(
      patternInput(testConfig({ density: 100, height: 1000, width: 1001 })),
    );
    expect(over.ok).toBe(false);
    if (!over.ok) {
      expect(over.error.code).toBe("PRIMITIVE_LIMIT_EXCEEDED");
    }
  });
});

describe("J. scale", () => {
  it("scales rendered coverage from a single source of truth", () => {
    // 0.8 * 1.25 = 1.0: the variation band never clamps, so the ratio
    // between matching primitives is exactly 4.
    const small = testConfig({ scale: 0.2, seed: "7" });
    const large = testConfig({ scale: 0.8, seed: "7" });
    const smallPattern = unwrap(generatePattern(patternInput(small)));
    const largePattern = unwrap(generatePattern(patternInput(large)));
    // Same RNG stream: positions identical, per-primitive scale ratio exact.
    expect(smallPattern.primitives.map((p) => p.x)).toEqual(
      largePattern.primitives.map((p) => p.x),
    );
    const ratios = largePattern.primitives.map(
      (p, i) => p.scale / (smallPattern.primitives[i]?.scale ?? 1),
    );
    for (const ratio of ratios) {
      expect(ratio).toBeCloseTo(4, 10);
    }
    // Base geometry is scale-independent; only the scale field differs.
    expect(smallPattern.primitives.map((p) => ({ ...p, scale: 0 }))).toEqual(
      largePattern.primitives.map((p) => ({ ...p, scale: 0 })),
    );
    const smallImage = unwrap(renderPattern(smallPattern));
    const largeImage = unwrap(renderPattern(largePattern));
    const count = (pixels: { data: Uint8Array }) => {
      let n = 0;
      for (let i = 0; i < pixels.data.length; i += 4) {
        if (pixels.data[i] !== 255) {
          n += 1;
        }
      }
      return n;
    };
    expect(count(largeImage)).toBeGreaterThan(count(smallImage));
  });

  it("clamps per-primitive variation so scale 1 stays renderable", () => {
    const full = unwrap(
      generatePattern(patternInput(testConfig({ scale: 1, seed: "7" }))),
    );
    for (const primitive of full.primitives) {
      expect(primitive.scale).toBeGreaterThan(0);
      expect(primitive.scale).toBeLessThanOrEqual(1);
    }
    expect(unwrap(renderPattern(full)).width).toBe(full.width);
  });
});

describe("K. rotation degrees/radians", () => {
  it("converts deterministically between UI degrees and core radians", () => {
    expect(degreesToRadians(180)).toBe(Math.PI);
    expect(degreesToRadians(360)).toBe(Math.PI * 2);
    expect(radiansToDegrees(Math.PI)).toBe(180);
    expect(radiansToDegrees(degreesToRadians(45))).toBeCloseTo(45, 12);
  });

  it("normalizes UI degrees into config radians", () => {
    const config = unwrap(
      normalizeUiForm({ ...DEFAULT_UI_FORM, rotationDegrees: 180 }),
    );
    expect(config.rotationRange).toBe(Math.PI);
    for (const bad of [-1, 361, Number.NaN]) {
      const result = normalizeUiForm({
        ...DEFAULT_UI_FORM,
        rotationDegrees: bad,
      });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("INVALID_ROTATION");
      }
    }
  });
});

describe("L. complexity", () => {
  it("controls polygon point counts within bounds", () => {
    const simple = unwrap(
      generatePattern(
        patternInput(testConfig({ complexity: 1, primitiveType: "polygon" })),
      ),
    );
    const complex = unwrap(
      generatePattern(
        patternInput(testConfig({ complexity: 8, primitiveType: "polygon" })),
      ),
    );
    expect(simple.primitives[0]?.type).toBe("polygon");
    if (
      simple.primitives[0]?.type === "polygon" &&
      complex.primitives[0]?.type === "polygon"
    ) {
      expect(simple.primitives[0].points).toHaveLength(3);
      expect(complex.primitives[0].points).toHaveLength(10);
    }
  });
});

describe("M. position jitter", () => {
  it("shifts placement deterministically while staying seamless", () => {
    const calm = unwrap(
      generatePattern(patternInput(testConfig({ positionJitter: 0 }))),
    );
    const jittered = unwrap(
      generatePattern(patternInput(testConfig({ positionJitter: 1 }))),
    );
    expect(calm.primitives.map((p) => p.x)).not.toEqual(
      jittered.primitives.map((p) => p.x),
    );
    const again = unwrap(
      generatePattern(patternInput(testConfig({ positionJitter: 1 }))),
    );
    expect(again).toEqual(jittered);
    const report = validateTileSeamless(jittered.primitives, 128, 128);
    expect(report.pass).toBe(true);
  });
});

describe("N. primitive type", () => {
  it("generates the selected type for all five primitives", () => {
    const types = [
      "circle",
      "rectangle",
      "ellipse",
      "line",
      "polygon",
    ] as const;
    for (const primitiveType of types) {
      const result = unwrap(
        generatePattern(patternInput(testConfig({ primitiveType }))),
      );
      expect(result.primitives[0]?.type).toBe(primitiveType);
    }
  });
});

describe("O. same seed same checksum", () => {
  it("reproduces identical pixels and checksums end to end", () => {
    const first = unwrap(runGenerationPipeline(testConfig()));
    const second = unwrap(runGenerationPipeline(testConfig()));
    expect(first.checksum).toBe(second.checksum);
    expect(imagesEqual(first.tile, second.tile)).toBe(true);
    expect(imagesEqual(first.grid, second.grid)).toBe(true);
  });
});

describe("P. different seed behavior", () => {
  it("produces different checksums for different seeds", () => {
    const first = unwrap(runGenerationPipeline(testConfig({ seed: "12345" })));
    const second = unwrap(runGenerationPipeline(testConfig({ seed: "54321" })));
    expect(first.checksum).not.toBe(second.checksum);
    expect(first.pattern.primitives).not.toEqual(second.pattern.primitives);
  });
});

describe("Q. invalid config", () => {
  it("surfaces typed errors without rendering", () => {
    const badWidth = normalizeUiForm({ ...DEFAULT_UI_FORM, width: 0 });
    expect(badWidth.ok).toBe(false);
    const badHex = normalizeUiForm({
      ...DEFAULT_UI_FORM,
      backgroundHex: "#gg",
    });
    expect(badHex.ok).toBe(false);
    const badPalette = normalizeUiForm({
      ...DEFAULT_UI_FORM,
      customPaletteHex: "",
      paletteId: "custom",
    });
    expect(badPalette.ok).toBe(false);
    const unknown = resolvePaletteColors("neon", "");
    expect(unknown.ok).toBe(false);
  });
});

describe("R. oversized generation protection", () => {
  it("rejects primitive overflow and render overflow with typed errors", () => {
    const over = generatePattern(
      patternInput(testConfig({ density: 100, height: 1000, width: 1001 })),
    );
    expect(over.ok).toBe(false);
    const big = renderTile([], 3000, 16);
    expect(big.ok).toBe(false);
    if (!big.ok) {
      expect(big.error.code).toBe("RENDER_LIMIT_EXCEEDED");
    }
    const grid = composePreviewGrid(
      { data: new Uint8Array(16 * 16 * 4), height: 16, width: 16 },
      200,
      200,
    );
    expect(grid.ok).toBe(false);
  });
});

describe("S. seamless validation after generated colors", () => {
  it("stays seamless with multi-color palettes", () => {
    const config = testConfig({
      backgroundColor: WHITE,
      height: 64,
      palette: {
        colors: [
          { a: 255, b: 80, g: 120, r: 230 },
          { a: 255, b: 130, g: 90, r: 220 },
          { a: 255, b: 140, g: 70, r: 120 },
        ],
      },
      width: 64,
    });
    const preview = unwrap(runGenerationPipeline(config));
    expect(preview.seamless.pass).toBe(true);
    expect(preview.seamless.horizontal.mismatchedPixels).toBe(0);
    expect(preview.seamless.vertical.mismatchedPixels).toBe(0);
    expect(preview.seamless.corner.mismatchedPixels).toBe(0);
  });
});

describe("T. UI normalization", () => {
  it("resolves presets, custom hex, and background into domain values", () => {
    const config = unwrap(normalizeUiForm(DEFAULT_UI_FORM));
    expect(config.rotationRange).toBe(Math.PI);
    expect(config.backgroundColor).toEqual(WHITE);
    expect(config.palette.colors).toEqual([BLACK]);

    const custom = unwrap(
      normalizeUiForm({
        ...DEFAULT_UI_FORM,
        customPaletteHex: "#ff0000, #00ff00",
        paletteId: "custom",
      }),
    );
    expect(custom.palette.colors).toHaveLength(2);

    const twice = unwrap(normalizeUiForm(DEFAULT_UI_FORM));
    expect(twice).toEqual(config);
  });
});

describe("golden checksum (Phase 4 scale-semantics update)", () => {
  it("preserves the Phase 3 colorless 32x32 seed-12345 fixture", () => {
    // OLD (Phase 3): a319b114. NEW: a319b114 (UNCHANGED).
    // The scale fix (renderer as single source of truth) does not alter
    // this fixture: the RNG stream prefix is identical, so the single
    // circle keeps its center (17.53, 15.33); only its effective radius
    // grows (0.215px -> 0.476px). Both radii cover the same single pixel
    // center, and the fill stays BLACK (no palette -> foreground fallback),
    // so the tile is pixel-identical. No fixture update required.
    const config = testConfig({
      backgroundColor: WHITE,
      complexity: 3,
      density: 5,
      height: 32,
      palette: { colors: [BLACK] },
      positionJitter: 0.1,
      primitiveType: "circle",
      rotationRange: Math.PI,
      scale: 0.5,
      seed: "12345",
      width: 32,
    });
    const preview = unwrap(runGenerationPipeline(config));
    expect(preview.checksum).toHaveLength(8);
    expect(preview.checksum).toBe("a319b114");
    const rerun = unwrap(runGenerationPipeline(config));
    expect(rerun.checksum).toBe(preview.checksum);
  });

  it("locks a multi-color 64x64 regression fixture", () => {
    const config = testConfig({
      backgroundColor: WHITE,
      density: 10,
      height: 64,
      palette: { colors: [RED, BLUE, YELLOW] },
      seed: "12345",
      width: 64,
    });
    const preview = unwrap(runGenerationPipeline(config));
    expect(preview.pattern.primitiveCount).toBe(5);
    expect(preview.checksum).toBe("473443c3");
    expect(unwrap(runGenerationPipeline(config)).checksum).toBe(
      preview.checksum,
    );
  });

  it("keeps colorless result ids free of palette segments", () => {
    const colorlessInput = {
      ...patternInput(testConfig()),
      palette: undefined,
    };
    const plain = unwrap(generatePattern(colorlessInput));
    expect(plain.resultId).not.toContain("palette-");
    const colored = unwrap(
      generatePattern(
        patternInput(testConfig({ palette: { colors: [RED, BLUE] } })),
      ),
    );
    expect(colored.resultId).toContain("palette-");
  });
});
