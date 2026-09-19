import type { GenerationConfig, RgbaColor } from "@patternforge/core";

/**
 * Built-in deterministic templates. A template is a named description plus
 * a fixed GenerationConfig — it NEVER contains generated output or
 * randomness. Selecting a template maps Template -> GenerationConfig ->
 * Generator through the standard validated pipeline.
 */

export interface BuiltinTemplate {
  readonly config: GenerationConfig;
  readonly description: string;
  readonly id: string;
  readonly name: string;
}

const WHITE: RgbaColor = { a: 255, b: 255, g: 255, r: 255 };
const BLACK: RgbaColor = { a: 255, b: 0, g: 0, r: 0 };
const NAVY: RgbaColor = { a: 255, b: 80, g: 30, r: 20 };
const SKY: RgbaColor = { a: 255, b: 230, g: 180, r: 135 };
const CRIMSON: RgbaColor = { a: 255, b: 60, g: 30, r: 200 };
const FOREST: RgbaColor = { a: 255, b: 110, g: 140, r: 60 };
const SAND: RgbaColor = { a: 255, b: 200, g: 230, r: 245 };
const INK: RgbaColor = { a: 255, b: 40, g: 40, r: 40 };
const PAPER: RgbaColor = { a: 255, b: 245, g: 240, r: 235 };
const TEAL: RgbaColor = { a: 255, b: 150, g: 130, r: 30 };
const CORAL: RgbaColor = { a: 255, b: 110, g: 130, r: 240 };
const PLUM: RgbaColor = { a: 255, b: 130, g: 70, r: 110 };

function base(overrides: Partial<GenerationConfig>): GenerationConfig {
  return {
    backgroundColor: WHITE,
    colorOrder: "random",
    complexity: 3,
    density: 5,
    height: 128,
    lineThickness: 1,
    opacityMax: 1,
    opacityMin: 1,
    palette: { colors: [BLACK] },
    positionJitter: 0.1,
    primitiveType: "circle",
    rotationRange: Math.PI,
    scale: 0.5,
    seed: "12345",
    width: 128,
    ...overrides,
  };
}

export const BUILTIN_TEMPLATES: readonly BuiltinTemplate[] = [
  {
    config: base({ density: 3, primitiveType: "circle", scale: 0.4 }),
    description: "Sparse small dots on white.",
    id: "minimal",
    name: "Minimal",
  },
  {
    config: base({
      density: 8,
      palette: { colors: [NAVY, SKY, WHITE] },
      primitiveType: "rectangle",
      rotationRange: Math.PI / 2,
    }),
    description: "Bold rotated rectangles in navy and sky.",
    id: "geometric",
    name: "Geometric",
  },
  {
    config: base({
      complexity: 6,
      density: 6,
      palette: { colors: [FOREST, SAND, INK] },
      positionJitter: 0.4,
      primitiveType: "polygon",
    }),
    description: "Organic polygons with heavy jitter.",
    id: "organic",
    name: "Organic",
  },
  {
    config: base({
      density: 12,
      palette: { colors: [INK] },
      primitiveType: "circle",
      scale: 0.3,
    }),
    description: "Dense monochrome dot field.",
    id: "dots",
    name: "Dots",
  },
  {
    config: base({
      density: 7,
      palette: { colors: [NAVY] },
      primitiveType: "line",
      rotationRange: Math.PI / 4,
      scale: 0.7,
    }),
    description: "Thin directional line work.",
    id: "lines",
    name: "Lines",
  },
  {
    config: base({
      complexity: 7,
      density: 9,
      palette: { colors: [TEAL, CORAL, PLUM, SAND] },
      positionJitter: 0.5,
      primitiveType: "polygon",
      rotationRange: Math.PI * 2,
    }),
    description: "High-variation multicolor polygons.",
    id: "abstract",
    name: "Abstract",
  },
  {
    config: base({
      density: 10,
      palette: { colors: [INK] },
      positionJitter: 0,
      primitiveType: "rectangle",
      rotationRange: 0,
      scale: 0.45,
    }),
    description: "Aligned grid, no rotation or jitter.",
    id: "grid",
    name: "Grid",
  },
  {
    config: base({
      density: 9,
      palette: { colors: [CRIMSON, NAVY, SAND] },
      primitiveType: "ellipse",
    }),
    description: "Mixed ellipses in warm and cool tones.",
    id: "shapes",
    name: "Shapes",
  },
  {
    config: base({
      backgroundColor: PAPER,
      density: 6,
      palette: { colors: [INK] },
      primitiveType: "circle",
    }),
    description: "Single-ink pattern on paper.",
    id: "monochrome",
    name: "Monochrome",
  },
  {
    config: base({
      complexity: 5,
      density: 11,
      palette: { colors: [CRIMSON, TEAL, CORAL, PLUM, SAND, NAVY] },
      positionJitter: 0.3,
      primitiveType: "ellipse",
      rotationRange: Math.PI * 2,
    }),
    description: "Full-spectrum colorful tile.",
    id: "colorful",
    name: "Colorful",
  },
];

export function getTemplate(id: string): BuiltinTemplate | undefined {
  return BUILTIN_TEMPLATES.find((template) => template.id === id);
}
