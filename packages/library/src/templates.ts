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
const BLOOM_BG: RgbaColor = { a: 255, b: 40, g: 90, r: 245 };
const CREAM: RgbaColor = { a: 255, b: 235, g: 245, r: 255 };
const LEAF_GREEN: RgbaColor = { a: 255, b: 110, g: 150, r: 70 };
const MINT_BG: RgbaColor = { a: 255, b: 230, g: 245, r: 240 };
const BERRY: RgbaColor = { a: 255, b: 60, g: 50, r: 200 };

function base(overrides: Partial<GenerationConfig>): GenerationConfig {
  return {
    arrangement: "scatter",
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
    rotationBase: 0,
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
  {
    config: base({
      backgroundColor: BLOOM_BG,
      complexity: 4,
      density: 6,
      palette: { colors: [CREAM, SAND] },
      positionJitter: 0.15,
      primitiveType: "flower",
      rotationRange: Math.PI * 2,
      scale: 0.55,
    }),
    description: "Retro cream blooms on orange.",
    id: "retro-bloom",
    name: "Retro Bloom",
  },
  {
    config: base({
      arrangement: "rows",
      density: 9,
      lineThickness: 3,
      palette: { colors: [INK] },
      positionJitter: 0.05,
      primitiveType: "wave",
      rotationBase: Math.PI / 2,
      rotationRange: 0,
      scale: 0.8,
    }),
    description: "Vertical wavy zebra stripes.",
    id: "zebra",
    name: "Zebra",
  },
  {
    config: base({
      arrangement: "rows",
      density: 8,
      lineThickness: 2.5,
      palette: { colors: [INK] },
      positionJitter: 0.08,
      primitiveType: "line",
      rotationBase: 0,
      rotationRange: 0,
      scale: 0.6,
    }),
    description: "Hand-brushed horizontal dashes.",
    id: "brush-dash",
    name: "Brush Dash",
  },
  {
    config: base({
      arrangement: "grid",
      density: 9,
      lineThickness: 2,
      palette: { colors: [CRIMSON, NAVY, TEAL] },
      positionJitter: 0.08,
      primitiveType: "ring",
      rotationRange: 0,
      scale: 0.55,
    }),
    description: "Bauhaus rings on a neat grid.",
    id: "bauhaus-rings",
    name: "Bauhaus Rings",
  },
  {
    config: base({
      backgroundColor: MINT_BG,
      complexity: 5,
      density: 8,
      palette: { colors: [LEAF_GREEN, FOREST, BERRY] },
      positionJitter: 0.2,
      primitiveType: "sprig",
      rotationRange: Math.PI * 2,
      scale: 0.75,
    }),
    description: "Botanical sprigs with berries and blooms.",
    id: "botanical-sprig",
    name: "Botanical Sprig",
  },
  {
    config: base({
      arrangement: "scatter",
      density: 12,
      palette: { colors: [LEAF_GREEN, FOREST] },
      positionJitter: 0.3,
      primitiveType: "leaf",
      rotationRange: Math.PI * 2,
      scale: 0.8,
    }),
    description: "Tossed leaves in two greens.",
    id: "leaf-toss",
    name: "Leaf Toss",
  },
  {
    config: base({
      backgroundColor: PAPER,
      complexity: 8,
      density: 5,
      lineThickness: 1.5,
      palette: { colors: [INK] },
      positionJitter: 0.15,
      primitiveType: "flower",
      rotationRange: Math.PI * 2,
      scale: 0.6,
    }),
    description: "Inky hand-drawn style blooms.",
    id: "ink-bloom",
    name: "Ink Bloom",
  },
];

export function getTemplate(id: string): BuiltinTemplate | undefined {
  return BUILTIN_TEMPLATES.find((template) => template.id === id);
}
