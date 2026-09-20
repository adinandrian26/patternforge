import type {
  AlgorithmVersion,
  Brand,
  EntityId,
  FoundationError,
  Result,
  SchemaVersion,
  Seed,
} from "@patternforge/shared";
import { err, ok } from "@patternforge/shared";

export type RandomSeed = Seed;
export type PatternStyle = Brand<string, "PatternStyle">;

export const PRIMITIVE_TYPES = [
  "circle",
  "rectangle",
  "ellipse",
  "line",
  "polygon",
  "star",
  "ring",
  "flower",
  "wave",
  "leaf",
  "sprig",
] as const;

export type PrimitiveType = (typeof PRIMITIVE_TYPES)[number];

/** Placement strategy: free scatter, lattice grid, or horizontal rows. */
export const ARRANGEMENTS = ["scatter", "grid", "rows"] as const;

export type Arrangement = (typeof ARRANGEMENTS)[number];

export function isArrangement(value: unknown): value is Arrangement {
  return value === "scatter" || value === "grid" || value === "rows";
}

export interface Point {
  readonly x: number;
  readonly y: number;
}

/** Star vertices in local units, alternating outer/inner, starting top. */
export function starVertices(
  spikes: number,
  outerRadius: number,
  innerRadius: number,
): Point[] {
  const vertices: Point[] = [];
  for (let i = 0; i < spikes * 2; i += 1) {
    const angle = -Math.PI / 2 + (i * Math.PI) / spikes;
    const radius = i % 2 === 0 ? outerRadius : innerRadius;
    vertices.push({
      x: Math.cos(angle) * radius,
      y: Math.sin(angle) * radius,
    });
  }
  return vertices;
}

/** Sample count per wave band edge (band polygon holds 2 * (n + 1) points). */
export const WAVE_BAND_SEGMENTS = 24;

/**
 * Filled sine band in local units: top edge left-to-right, then bottom
 * edge right-to-left. Shared by raster-adjacent serializers so SVG and
 * EPS render the same silhouette.
 */
export function waveBandPoints(
  length: number,
  amplitude: number,
  wavelength: number,
  thickness: number,
): Point[] {
  const points: Point[] = [];
  const halfThickness = thickness / 2;
  for (let i = 0; i <= WAVE_BAND_SEGMENTS; i += 1) {
    const x = -length / 2 + (length * i) / WAVE_BAND_SEGMENTS;
    const y = amplitude * Math.sin((Math.PI * 2 * x) / wavelength);
    points.push({ x, y: y - halfThickness });
  }
  for (let i = WAVE_BAND_SEGMENTS; i >= 0; i -= 1) {
    const x = -length / 2 + (length * i) / WAVE_BAND_SEGMENTS;
    const y = amplitude * Math.sin((Math.PI * 2 * x) / wavelength);
    points.push({ x, y: y + halfThickness });
  }
  return points;
}

export interface LeafCubicEdge {
  readonly c1x: number;
  readonly c1y: number;
  readonly c2x: number;
  readonly c2y: number;
}

/**
 * Cubic bezier controls for a plump leaf lens (tips at +/-length/2 on
 * the x-axis, quadratic control at (0, -/+width) converted to cubic).
 * Shared so SVG (`Q`) and EPS (`curveto`) trace the same silhouette.
 */
export function leafCubicEdges(
  length: number,
  width: number,
): { bottom: LeafCubicEdge; top: LeafCubicEdge } {
  const sixth = length / 6;
  const twoThirds = (width * 2) / 3;
  return {
    bottom: { c1x: sixth, c1y: twoThirds, c2x: -sixth, c2y: twoThirds },
    top: { c1x: -sixth, c1y: -twoThirds, c2x: sixth, c2y: -twoThirds },
  };
}

export interface Size {
  readonly height: number;
  readonly width: number;
}

export interface Rect extends Point, Size {}

export interface Transform {
  readonly rotation: number;
  readonly scaleX: number;
  readonly scaleY: number;
  readonly x: number;
  readonly y: number;
}

export interface PatternParameters {
  readonly arrangement: Arrangement;
  readonly canvasHeight: number;
  readonly canvasWidth: number;
  readonly complexity: number;
  readonly density: number;
  readonly positionJitter: number;
  readonly primitiveType: PrimitiveType;
  readonly rotationBase: number;
  readonly rotationRange: number;
  readonly scale: number;
}

export interface PatternParametersInput {
  readonly arrangement?: unknown;
  readonly canvasHeight: number;
  readonly canvasWidth: number;
  readonly complexity: number;
  readonly density: number;
  readonly positionJitter: number;
  readonly primitiveType: string;
  readonly rotationBase?: unknown;
  readonly rotationRange: number;
  readonly scale: number;
}

export type PatternParameterField = keyof PatternParametersInput;

export type PatternValidationCode =
  | "INVALID_ARRANGEMENT"
  | "INVALID_CANVAS_HEIGHT"
  | "INVALID_CANVAS_WIDTH"
  | "INVALID_COMPLEXITY"
  | "INVALID_DENSITY"
  | "INVALID_POSITION_JITTER"
  | "INVALID_PRIMITIVE_TYPE"
  | "INVALID_ROTATION_BASE"
  | "INVALID_ROTATION_RANGE"
  | "INVALID_SCALE";

export interface PatternValidationError {
  readonly code: PatternValidationCode;
  readonly field: PatternParameterField;
  readonly message: string;
  readonly value: boolean | number | string | null;
}

export const MAX_CANVAS_DIMENSION = 8_192;
export const MAX_COMPLEXITY = 8;
export const MAX_DENSITY = 100;
export const MAX_POSITION_JITTER = 1;
export const MAX_ROTATION_RANGE = Math.PI * 2;
export const MAX_SCALE = 1;

function invalidParameter(
  field: PatternParameterField,
  code: PatternValidationCode,
  message: string,
  value: boolean | number | string | null,
): Result<never, PatternValidationError> {
  return err({ code, field, message, value });
}

function isPrimitiveType(value: string): value is PrimitiveType {
  return PRIMITIVE_TYPES.includes(value as PrimitiveType);
}

export function validatePatternParameters(
  parameters: PatternParametersInput,
): Result<PatternParameters, PatternValidationError> {
  if (
    !Number.isSafeInteger(parameters.canvasWidth) ||
    parameters.canvasWidth <= 0 ||
    parameters.canvasWidth > MAX_CANVAS_DIMENSION
  ) {
    return invalidParameter(
      "canvasWidth",
      "INVALID_CANVAS_WIDTH",
      `canvasWidth must be an integer in the range 1-${MAX_CANVAS_DIMENSION}.`,
      parameters.canvasWidth,
    );
  }

  if (
    !Number.isSafeInteger(parameters.canvasHeight) ||
    parameters.canvasHeight <= 0 ||
    parameters.canvasHeight > MAX_CANVAS_DIMENSION
  ) {
    return invalidParameter(
      "canvasHeight",
      "INVALID_CANVAS_HEIGHT",
      `canvasHeight must be an integer in the range 1-${MAX_CANVAS_DIMENSION}.`,
      parameters.canvasHeight,
    );
  }

  if (
    !Number.isFinite(parameters.density) ||
    parameters.density <= 0 ||
    parameters.density > MAX_DENSITY
  ) {
    return invalidParameter(
      "density",
      "INVALID_DENSITY",
      `density must be finite and in the range (0, ${MAX_DENSITY}].`,
      parameters.density,
    );
  }

  if (
    !Number.isFinite(parameters.scale) ||
    parameters.scale <= 0 ||
    parameters.scale > MAX_SCALE
  ) {
    return invalidParameter(
      "scale",
      "INVALID_SCALE",
      `scale must be finite and in the range (0, ${MAX_SCALE}].`,
      parameters.scale,
    );
  }

  if (
    !Number.isSafeInteger(parameters.complexity) ||
    parameters.complexity <= 0 ||
    parameters.complexity > MAX_COMPLEXITY
  ) {
    return invalidParameter(
      "complexity",
      "INVALID_COMPLEXITY",
      `complexity must be an integer in the range 1-${MAX_COMPLEXITY}.`,
      parameters.complexity,
    );
  }

  if (
    !Number.isFinite(parameters.rotationRange) ||
    parameters.rotationRange < 0 ||
    parameters.rotationRange > MAX_ROTATION_RANGE
  ) {
    return invalidParameter(
      "rotationRange",
      "INVALID_ROTATION_RANGE",
      `rotationRange must be finite and in the range [0, ${MAX_ROTATION_RANGE}].`,
      parameters.rotationRange,
    );
  }

  if (
    !Number.isFinite(parameters.positionJitter) ||
    parameters.positionJitter < 0 ||
    parameters.positionJitter > MAX_POSITION_JITTER
  ) {
    return invalidParameter(
      "positionJitter",
      "INVALID_POSITION_JITTER",
      `positionJitter must be finite and in the range [0, ${MAX_POSITION_JITTER}].`,
      parameters.positionJitter,
    );
  }

  if (!isPrimitiveType(parameters.primitiveType)) {
    return invalidParameter(
      "primitiveType",
      "INVALID_PRIMITIVE_TYPE",
      `primitiveType must be one of: ${PRIMITIVE_TYPES.join(", ")}.`,
      parameters.primitiveType,
    );
  }

  const arrangement = parameters.arrangement ?? "scatter";
  if (!isArrangement(arrangement)) {
    return invalidParameter(
      "arrangement",
      "INVALID_ARRANGEMENT",
      `arrangement must be one of: ${ARRANGEMENTS.join(", ")}.`,
      typeof arrangement === "string" ? arrangement : null,
    );
  }

  const rotationBase = parameters.rotationBase ?? 0;
  if (
    typeof rotationBase !== "number" ||
    !Number.isFinite(rotationBase) ||
    rotationBase < 0 ||
    rotationBase > MAX_ROTATION_RANGE
  ) {
    return invalidParameter(
      "rotationBase",
      "INVALID_ROTATION_BASE",
      `rotationBase must be finite and in the range [0, ${MAX_ROTATION_RANGE}].`,
      typeof rotationBase === "number" ? rotationBase : null,
    );
  }

  return ok({
    ...parameters,
    arrangement,
    primitiveType: parameters.primitiveType,
    rotationBase,
  });
}

export interface PatternPrimitiveBase {
  readonly color?: RgbaColor;
  readonly id: EntityId;
  readonly opacity: number;
  readonly rotation: number;
  readonly scale: number;
  readonly type: PrimitiveType;
  readonly x: number;
  readonly y: number;
}

export interface Circle extends PatternPrimitiveBase {
  readonly radius: number;
  readonly type: "circle";
}

export interface Rectangle extends PatternPrimitiveBase {
  readonly height: number;
  readonly type: "rectangle";
  readonly width: number;
}

export interface Ellipse extends PatternPrimitiveBase {
  readonly radiusX: number;
  readonly radiusY: number;
  readonly type: "ellipse";
}

export interface Line extends PatternPrimitiveBase {
  readonly length: number;
  /** Stroke thickness in pixels; defaults to 1 when absent. */
  readonly thickness?: number;
  readonly type: "line";
}

export interface Polygon extends PatternPrimitiveBase {
  readonly points: readonly Point[];
  readonly type: "polygon";
}

export interface Star extends PatternPrimitiveBase {
  /** Inner radius; outer radius is `radius`. Spikes in 3..12. */
  readonly innerRadius: number;
  readonly radius: number;
  readonly spikes: number;
  readonly type: "star";
}

export interface Ring extends PatternPrimitiveBase {
  readonly radius: number;
  /** Band thickness in pixels; defaults to 1 when absent. */
  readonly thickness?: number;
  readonly type: "ring";
}

export interface Flower extends PatternPrimitiveBase {
  readonly centerRadius: number;
  readonly petalLength: number;
  /** Petal count in 3..12. */
  readonly petals: number;
  readonly petalWidth: number;
  readonly type: "flower";
}

export interface Wave extends PatternPrimitiveBase {
  /** Sine amplitude in pixels. */
  readonly amplitude: number;
  readonly length: number;
  /** Band thickness in pixels; defaults to 1 when absent. */
  readonly thickness?: number;
  /** Wavelength in pixels (one full sine period). */
  readonly wavelength: number;
  readonly type: "wave";
}

export interface Leaf extends PatternPrimitiveBase {
  /** Tip-to-tip length in pixels (points along local +x). */
  readonly length: number;
  readonly type: "leaf";
  readonly width: number;
}

/** One leaf on a sprig stem (sprig-local units, stem along +y). */
export interface SprigLeaf {
  /** Tilt from the stem in radians (signed: side included). */
  readonly angle: number;
  /** Position on the stem in 0..1. */
  readonly along: number;
  readonly length: number;
  readonly width: number;
}

export interface SprigBerry {
  readonly radius: number;
  readonly x: number;
  readonly y: number;
}

export interface SprigFlower {
  readonly centerRadius: number;
  readonly petalLength: number;
  readonly petals: number;
  readonly petalWidth: number;
  readonly x: number;
  readonly y: number;
}

/**
 * Botanical sprig: stem + leaves + optional flower head + berries,
 * all in sprig-local units (stem from origin up +y). `accent` colors
 * the flower head; everything else uses the primitive color.
 */
export interface Sprig extends PatternPrimitiveBase {
  readonly accent?: RgbaColor;
  readonly berries: readonly SprigBerry[];
  readonly flower: SprigFlower | null;
  readonly leaves: readonly SprigLeaf[];
  readonly stemLength: number;
  readonly stemThickness: number;
  readonly type: "sprig";
}

export type PatternPrimitive =
  | Circle
  | Rectangle
  | Ellipse
  | Line
  | Polygon
  | Star
  | Ring
  | Flower
  | Wave
  | Leaf
  | Sprig;
export type PatternElement = PatternPrimitive;

export interface ColorPalette {
  readonly background?: string;
  readonly colors: readonly string[];
  readonly paletteId?: EntityId;
  readonly selectionMode: string;
}

export interface TileSettings {
  readonly coordinateMode: "wrapped-modular";
  readonly cornerPolicy: "translated-copies";
  readonly edgePolicy: "translated-copies";
  readonly height: number;
  readonly width: number;
}

export interface ExportSettings {
  readonly filenameTemplate: string;
  readonly format: string;
  readonly overwritePolicy: "fail" | "replace" | "unique";
}

export interface PatternDefinition {
  readonly algorithmVersion: AlgorithmVersion;
  readonly definitionId: EntityId;
  readonly name?: string;
  readonly parameters: PatternParameters;
  readonly palette: ColorPalette;
  readonly schemaVersion: SchemaVersion;
  readonly style: PatternStyle;
  readonly tile: TileSettings;
  readonly seed: RandomSeed;
}

export type BatchJobStatus =
  | "queued"
  | "running"
  | "cancelling"
  | "completed"
  | "cancelled"
  | "failed";

export interface BatchJob {
  readonly baseSeed: RandomSeed;
  readonly count: number;
  readonly definition: PatternDefinition;
  readonly export: ExportSettings;
  readonly jobId: EntityId;
  readonly status: BatchJobStatus;
}

export interface GenerationResult {
  readonly algorithmVersion: AlgorithmVersion;
  readonly effectiveSeed: RandomSeed;
  readonly height: number;
  readonly primitiveCount: number;
  readonly primitives: readonly PatternPrimitive[];
  readonly resultId: EntityId;
  readonly schemaVersion: SchemaVersion;
  readonly tileable: boolean;
  readonly width: number;
}

export type CoreResult<T> = Result<T, FoundationError>;

export const CORE_PACKAGE_NAME = "@patternforge/core" as const;

// ---------------------------------------------------------------------------
// Phase 4: typed color system, palette, and generation config.
// Core uses typed numeric RGBA everywhere. CSS/hex strings only exist at
// UI adapter boundaries and are never the canonical representation.
// ---------------------------------------------------------------------------

/**
 * Typed numeric RGBA color. Each channel is an integer in 0..255.
 * `a` is alpha: 0 fully transparent, 255 fully opaque.
 */
export interface RgbaColor {
  readonly a: number;
  readonly b: number;
  readonly g: number;
  readonly r: number;
}

export const MAX_PALETTE_COLORS = 32;

export const DEFAULT_BACKGROUND_COLOR: RgbaColor = {
  a: 255,
  b: 255,
  g: 255,
  r: 255,
};

export const DEFAULT_PRIMITIVE_COLOR: RgbaColor = {
  a: 255,
  b: 0,
  g: 0,
  r: 0,
};

export const DEFAULT_PALETTE_COLORS: readonly RgbaColor[] = [
  DEFAULT_PRIMITIVE_COLOR,
];

/** A bounded, non-empty list of typed RGBA colors. */
export interface Palette {
  readonly colors: readonly RgbaColor[];
}

export type ColorValidationCode =
  | "INVALID_COLOR"
  | "INVALID_PALETTE"
  | "INVALID_BACKGROUND";

export type GenerationConfigField =
  | "arrangement"
  | "backgroundColor"
  | "colorOrder"
  | "complexity"
  | "density"
  | "height"
  | "lineThickness"
  | "opacityMax"
  | "opacityMin"
  | "palette"
  | "positionJitter"
  | "primitiveType"
  | "rotationBase"
  | "rotationRange"
  | "scale"
  | "seed"
  | "width";

export type GenerationConfigCode =
  | "INVALID_ARRANGEMENT"
  | "INVALID_BACKGROUND"
  | "INVALID_COLOR_ORDER"
  | "INVALID_COMPLEXITY"
  | "INVALID_DENSITY"
  | "INVALID_HEIGHT"
  | "INVALID_LINE_THICKNESS"
  | "INVALID_OPACITY_RANGE"
  | "INVALID_PALETTE"
  | "INVALID_POSITION_JITTER"
  | "INVALID_PRIMITIVE_TYPE"
  | "INVALID_ROTATION"
  | "INVALID_ROTATION_BASE"
  | "INVALID_SCALE"
  | "INVALID_SEED"
  | "INVALID_WIDTH";

/** Palette traversal order: random (PRNG pick) or sequential cycling. */
export const COLOR_ORDERS = ["random", "sequential"] as const;

export type ColorOrder = (typeof COLOR_ORDERS)[number];

export function isColorOrder(value: unknown): value is ColorOrder {
  return value === "random" || value === "sequential";
}

export const MIN_LINE_THICKNESS = 0.5;
export const MAX_LINE_THICKNESS = 8;
export const DEFAULT_LINE_THICKNESS = 1;

export interface ColorValidationError {
  readonly code: ColorValidationCode;
  readonly field: string;
  readonly message: string;
  readonly value: boolean | number | string | null;
}

export interface GenerationConfigError {
  readonly code: GenerationConfigCode;
  readonly field: GenerationConfigField;
  readonly message: string;
  readonly value: boolean | number | string | null;
}

/**
 * Flat, UI-driven generation configuration.
 * `rotationRange` is always radians in core (UI shows degrees).
 * `palette` always holds 1..MAX_PALETTE_COLORS typed colors.
 * Phase 8 advanced controls default to Phase 4 behavior:
 * `lineThickness: 1`, `opacityMin/Max: 1`, `colorOrder: "random"`.
 */
export interface GenerationConfig {
  readonly arrangement: Arrangement;
  readonly backgroundColor: RgbaColor;
  readonly colorOrder: ColorOrder;
  readonly complexity: number;
  readonly density: number;
  readonly height: number;
  readonly lineThickness: number;
  readonly opacityMax: number;
  readonly opacityMin: number;
  readonly palette: Palette;
  readonly positionJitter: number;
  readonly primitiveType: PrimitiveType;
  readonly rotationBase: number;
  readonly rotationRange: number;
  readonly scale: number;
  readonly seed: number | string;
  readonly width: number;
}

/**
 * Untrusted input shape for `validateGenerationConfig`.
 * Numbers stay numeric (NaN/Infinity rejected at runtime);
 * seed, palette, and background accept unknown runtime values.
 */
export interface GenerationConfigInput {
  readonly arrangement?: unknown;
  readonly backgroundColor: unknown;
  readonly colorOrder: unknown;
  readonly complexity: number;
  readonly density: number;
  readonly height: number;
  readonly lineThickness: unknown;
  readonly opacityMax: unknown;
  readonly opacityMin: unknown;
  readonly palette: unknown;
  readonly positionJitter: number;
  readonly primitiveType: string;
  readonly rotationBase?: unknown;
  readonly rotationRange: number;
  readonly scale: number;
  readonly seed: unknown;
  readonly width: number;
}

export const DEFAULT_GENERATION_CONFIG: GenerationConfig = {
  arrangement: "scatter",
  backgroundColor: DEFAULT_BACKGROUND_COLOR,
  colorOrder: "random",
  complexity: 3,
  density: 5,
  height: 128,
  lineThickness: DEFAULT_LINE_THICKNESS,
  opacityMax: 1,
  opacityMin: 1,
  palette: { colors: DEFAULT_PALETTE_COLORS },
  positionJitter: 0.1,
  primitiveType: "circle",
  rotationBase: 0,
  rotationRange: Math.PI,
  scale: 0.5,
  seed: "12345",
  width: 128,
};

/** Standalone options subset, reused by pattern-engine direct callers. */
export interface GenerationOptions {
  readonly colorOrder: ColorOrder;
  readonly lineThickness: number;
  readonly opacityMax: number;
  readonly opacityMin: number;
}

export const DEFAULT_GENERATION_OPTIONS: GenerationOptions = {
  colorOrder: "random",
  lineThickness: DEFAULT_LINE_THICKNESS,
  opacityMax: 1,
  opacityMin: 1,
};

function isByte(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= 0 &&
    value <= 255
  );
}

/** Runtime guard for typed numeric RGBA colors. */
export function isRgbaColor(value: unknown): value is RgbaColor {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  return (
    isByte(candidate.r) &&
    isByte(candidate.g) &&
    isByte(candidate.b) &&
    isByte(candidate.a)
  );
}

/** Validate an unknown value as a typed RGBA color. */
export function validateRgbaColor(
  value: unknown,
): Result<RgbaColor, ColorValidationError> {
  if (!isRgbaColor(value)) {
    return err({
      code: "INVALID_COLOR",
      field: "color",
      message: "Color channels r/g/b/a must be integers in 0..255.",
      value: null,
    });
  }
  const color = value as RgbaColor;
  return ok({ a: color.a, b: color.b, g: color.g, r: color.r });
}

/**
 * Normalize any finite numeric color to valid bytes (round + clamp).
 * Already-valid colors return an equal copy.
 */
export function normalizeColor(color: {
  readonly a: number;
  readonly b: number;
  readonly g: number;
  readonly r: number;
}): RgbaColor {
  const clampByte = (v: number): number => {
    if (!Number.isFinite(v)) {
      return 0;
    }
    return Math.min(255, Math.max(0, Math.round(v)));
  };
  return {
    a: clampByte(color.a),
    b: clampByte(color.b),
    g: clampByte(color.g),
    r: clampByte(color.r),
  };
}

/** Exact per-channel equality for two typed colors. */
export function colorsEqual(a: RgbaColor, b: RgbaColor): boolean {
  return a.r === b.r && a.g === b.g && a.b === b.b && a.a === b.a;
}

function byteToHex(v: number): string {
  return v.toString(16).padStart(2, "0");
}

/**
 * Format a typed color as hex. Opaque colors use `#rrggbb`,
 * transparent ones use `#rrggbbaa`. Lowercase, deterministic.
 */
export function colorToHex(color: RgbaColor): string {
  const base = `#${byteToHex(color.r)}${byteToHex(color.g)}${byteToHex(color.b)}`;
  return color.a === 255 ? base : `${base}${byteToHex(color.a)}`;
}

function parseHexByte(pair: string): number | null {
  if (!/^[0-9a-fA-F]{2}$/.test(pair)) {
    return null;
  }
  return Number.parseInt(pair, 16);
}

/**
 * Parse `#rgb`, `#rrggbb`, or `#rrggbbaa` (leading `#` optional,
 * surrounding whitespace trimmed) into a typed RGBA color.
 * Alpha defaults to 255 when omitted.
 */
export function hexToColor(
  input: unknown,
): Result<RgbaColor, ColorValidationError> {
  const invalid: Result<never, ColorValidationError> = err({
    code: "INVALID_COLOR",
    field: "color",
    message: "Hex color must look like #rgb, #rrggbb, or #rrggbbaa.",
    value: typeof input === "string" ? input : null,
  });
  if (typeof input !== "string") {
    return invalid;
  }
  let text = input.trim();
  if (text.startsWith("#")) {
    text = text.slice(1);
  }
  let expanded = text;
  if (/^[0-9a-fA-F]{3}$/.test(text)) {
    expanded = `${text[0]}${text[0]}${text[1]}${text[1]}${text[2]}${text[2]}`;
  }
  if (expanded.length !== 6 && expanded.length !== 8) {
    return invalid;
  }
  if (!/^[0-9a-fA-F]+$/.test(expanded)) {
    return invalid;
  }
  const r = parseHexByte(expanded.slice(0, 2));
  const g = parseHexByte(expanded.slice(2, 4));
  const b = parseHexByte(expanded.slice(4, 6));
  const a = expanded.length === 8 ? parseHexByte(expanded.slice(6, 8)) : 255;
  if (r === null || g === null || b === null || a === null) {
    return invalid;
  }
  return ok({ a, b, g, r });
}

/**
 * Display-only adapter: typed color -> CSS `rgba()` string.
 * Never used as a canonical domain representation.
 */
export function rgbaToCss(color: RgbaColor): string {
  const alpha = (Math.min(255, Math.max(0, color.a)) / 255).toFixed(3);
  return `rgba(${color.r}, ${color.g}, ${color.b}, ${alpha})`;
}

/** Validate an unknown value as a bounded non-empty palette. */
export function validatePalette(
  value: unknown,
): Result<Palette, ColorValidationError> {
  const invalid = (message: string): Result<never, ColorValidationError> =>
    err({ code: "INVALID_PALETTE", field: "palette", message, value: null });
  const colorsInput = (
    typeof value === "object" && value !== null && "colors" in value
      ? (value as { readonly colors: unknown }).colors
      : value
  ) as unknown;
  if (!Array.isArray(colorsInput)) {
    return invalid("Palette colors must be an array.");
  }
  if (colorsInput.length === 0) {
    return invalid("Palette must hold at least one color.");
  }
  if (colorsInput.length > MAX_PALETTE_COLORS) {
    return invalid(`Palette must hold at most ${MAX_PALETTE_COLORS} colors.`);
  }
  const colors: RgbaColor[] = [];
  for (const entry of colorsInput) {
    const parsed = validateRgbaColor(entry);
    if (!parsed.ok) {
      return err({ ...parsed.error, code: "INVALID_PALETTE" });
    }
    colors.push(parsed.value);
  }
  return ok({ colors });
}

function configError(
  field: GenerationConfigField,
  code: GenerationConfigCode,
  message: string,
  value: boolean | number | string | null,
): Result<never, GenerationConfigError> {
  return err({ code, field, message, value });
}

export interface GenerationOptionsInput {
  readonly colorOrder?: unknown;
  readonly lineThickness?: unknown;
  readonly opacityMax?: unknown;
  readonly opacityMin?: unknown;
}

/**
 * Validate Phase 8 advanced controls. Missing fields fall back to
 * Phase 4 behavior (thickness 1, fixed opacity 1, random order), so
 * default configs produce byte-identical output to Phase 4.
 */
export function validateGenerationOptions(
  input: GenerationOptionsInput,
): Result<GenerationOptions, GenerationConfigError> {
  const lineThickness = input.lineThickness ?? DEFAULT_LINE_THICKNESS;
  if (
    typeof lineThickness !== "number" ||
    !Number.isFinite(lineThickness) ||
    lineThickness < MIN_LINE_THICKNESS ||
    lineThickness > MAX_LINE_THICKNESS
  ) {
    return configError(
      "lineThickness",
      "INVALID_LINE_THICKNESS",
      `lineThickness must be finite in ${MIN_LINE_THICKNESS}..${MAX_LINE_THICKNESS}.`,
      typeof lineThickness === "number" ? lineThickness : null,
    );
  }
  const opacityMin = input.opacityMin ?? 1;
  const opacityMax = input.opacityMax ?? 1;
  if (
    typeof opacityMin !== "number" ||
    !Number.isFinite(opacityMin) ||
    opacityMin < 0 ||
    opacityMin > 1 ||
    typeof opacityMax !== "number" ||
    !Number.isFinite(opacityMax) ||
    opacityMax < 0 ||
    opacityMax > 1 ||
    opacityMin > opacityMax
  ) {
    return configError(
      "opacityMin",
      "INVALID_OPACITY_RANGE",
      "opacityMin/Max must be finite in [0, 1] with min <= max.",
      null,
    );
  }
  const colorOrder = input.colorOrder ?? "random";
  if (!isColorOrder(colorOrder)) {
    return configError(
      "colorOrder",
      "INVALID_COLOR_ORDER",
      `colorOrder must be one of: ${COLOR_ORDERS.join(", ")}.`,
      typeof colorOrder === "string" ? colorOrder : null,
    );
  }
  return ok({ colorOrder, lineThickness, opacityMax, opacityMin });
}

/**
 * Validate a full generation config. Rejects NaN, Infinity, negatives,
 * out-of-range values, unknown primitive types, empty/oversized palettes,
 * and invalid background colors before any allocation happens.
 */
export function validateGenerationConfig(
  input: GenerationConfigInput,
): Result<GenerationConfig, GenerationConfigError> {
  if (typeof input.seed !== "number" && typeof input.seed !== "string") {
    return configError(
      "seed",
      "INVALID_SEED",
      "Seed must be a number or a numeric string.",
      null,
    );
  }
  if (typeof input.seed === "string" && input.seed.trim().length === 0) {
    return configError(
      "seed",
      "INVALID_SEED",
      "Seed strings cannot be empty.",
      input.seed,
    );
  }
  if (
    !Number.isSafeInteger(input.width) ||
    input.width <= 0 ||
    input.width > MAX_CANVAS_DIMENSION
  ) {
    return configError(
      "width",
      "INVALID_WIDTH",
      `width must be an integer in the range 1-${MAX_CANVAS_DIMENSION}.`,
      input.width,
    );
  }
  if (
    !Number.isSafeInteger(input.height) ||
    input.height <= 0 ||
    input.height > MAX_CANVAS_DIMENSION
  ) {
    return configError(
      "height",
      "INVALID_HEIGHT",
      `height must be an integer in the range 1-${MAX_CANVAS_DIMENSION}.`,
      input.height,
    );
  }
  if (
    !Number.isFinite(input.density) ||
    input.density <= 0 ||
    input.density > MAX_DENSITY
  ) {
    return configError(
      "density",
      "INVALID_DENSITY",
      `density must be finite and in the range (0, ${MAX_DENSITY}].`,
      input.density,
    );
  }
  if (
    !Number.isFinite(input.scale) ||
    input.scale <= 0 ||
    input.scale > MAX_SCALE
  ) {
    return configError(
      "scale",
      "INVALID_SCALE",
      `scale must be finite and in the range (0, ${MAX_SCALE}].`,
      input.scale,
    );
  }
  if (
    !Number.isSafeInteger(input.complexity) ||
    input.complexity <= 0 ||
    input.complexity > MAX_COMPLEXITY
  ) {
    return configError(
      "complexity",
      "INVALID_COMPLEXITY",
      `complexity must be an integer in the range 1-${MAX_COMPLEXITY}.`,
      input.complexity,
    );
  }
  if (
    !Number.isFinite(input.rotationRange) ||
    input.rotationRange < 0 ||
    input.rotationRange > MAX_ROTATION_RANGE
  ) {
    return configError(
      "rotationRange",
      "INVALID_ROTATION",
      `rotationRange must be finite and in the range [0, ${MAX_ROTATION_RANGE}].`,
      input.rotationRange,
    );
  }
  if (
    !Number.isFinite(input.positionJitter) ||
    input.positionJitter < 0 ||
    input.positionJitter > MAX_POSITION_JITTER
  ) {
    return configError(
      "positionJitter",
      "INVALID_POSITION_JITTER",
      `positionJitter must be finite and in the range [0, ${MAX_POSITION_JITTER}].`,
      input.positionJitter,
    );
  }
  if (!isPrimitiveType(input.primitiveType)) {
    return configError(
      "primitiveType",
      "INVALID_PRIMITIVE_TYPE",
      `primitiveType must be one of: ${PRIMITIVE_TYPES.join(", ")}.`,
      input.primitiveType,
    );
  }
  const arrangement = input.arrangement ?? "scatter";
  if (!isArrangement(arrangement)) {
    return configError(
      "arrangement",
      "INVALID_ARRANGEMENT",
      `arrangement must be one of: ${ARRANGEMENTS.join(", ")}.`,
      typeof arrangement === "string" ? arrangement : null,
    );
  }
  const rotationBase = input.rotationBase ?? 0;
  if (
    typeof rotationBase !== "number" ||
    !Number.isFinite(rotationBase) ||
    rotationBase < 0 ||
    rotationBase > MAX_ROTATION_RANGE
  ) {
    return configError(
      "rotationBase",
      "INVALID_ROTATION_BASE",
      `rotationBase must be finite and in the range [0, ${MAX_ROTATION_RANGE}].`,
      typeof rotationBase === "number" ? rotationBase : null,
    );
  }
  const paletteResult = validatePalette(input.palette);
  if (!paletteResult.ok) {
    return err({
      code: "INVALID_PALETTE",
      field: "palette",
      message: paletteResult.error.message,
      value: null,
    });
  }
  const backgroundResult = validateRgbaColor(input.backgroundColor);
  if (!backgroundResult.ok) {
    return err({
      code: "INVALID_BACKGROUND",
      field: "backgroundColor",
      message: backgroundResult.error.message,
      value: null,
    });
  }
  const optionsResult = validateGenerationOptions({
    colorOrder: input.colorOrder,
    lineThickness: input.lineThickness,
    opacityMax: input.opacityMax,
    opacityMin: input.opacityMin,
  });
  if (!optionsResult.ok) {
    return optionsResult;
  }
  return ok({
    arrangement,
    backgroundColor: backgroundResult.value,
    colorOrder: optionsResult.value.colorOrder,
    complexity: input.complexity,
    density: input.density,
    height: input.height,
    lineThickness: optionsResult.value.lineThickness,
    opacityMax: optionsResult.value.opacityMax,
    opacityMin: optionsResult.value.opacityMin,
    palette: paletteResult.value,
    positionJitter: input.positionJitter,
    primitiveType: input.primitiveType,
    rotationBase,
    rotationRange: input.rotationRange,
    scale: input.scale,
    seed: input.seed,
    width: input.width,
  });
}

/** Convert UI-friendly degrees to core radians deterministically. */
export function degreesToRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

/** Convert core radians back to UI-friendly degrees. */
export function radiansToDegrees(radians: number): number {
  return (radians * 180) / Math.PI;
}
