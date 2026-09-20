import {
  colorToHex,
  validateGenerationOptions,
  type GenerationOptions,
  type GenerationResult,
  type Palette,
  type PatternParameters,
  type PatternParametersInput,
  type PatternPrimitive,
  type Point,
  type RgbaColor,
  type Size,
  validatePalette,
  validatePatternParameters,
} from "@patternforge/core";
import {
  PATTERN_ALGORITHM_VERSION,
  SCHEMA_VERSION,
  err,
  ok,
  type AlgorithmVersion,
  type EntityId,
  type Result,
  type SchemaVersion,
} from "@patternforge/shared";

import {
  createCanonicalSeed,
  type SeedInput,
  type SeedValidationError,
} from "./seed";
import { createRng, type Rng } from "./rng";

export const MAX_PRIMITIVES = 10_000;
export const DENSITY_AREA_UNIT = 10_000;

export interface GenerationInput {
  readonly algorithmVersion: AlgorithmVersion;
  readonly dimensions: Size;
  readonly options?: unknown;
  readonly palette?: Palette;
  readonly parameters: PatternParametersInput;
  readonly schemaVersion: SchemaVersion;
  readonly seed: SeedInput;
}

export interface InvalidPaletteError {
  readonly code: "INVALID_PALETTE";
  readonly message: string;
}

export interface InvalidOptionsError {
  readonly code: "INVALID_OPTIONS";
  readonly field: string;
  readonly message: string;
}

export interface UnsupportedAlgorithmVersionError {
  readonly code: "UNSUPPORTED_ALGORITHM_VERSION";
  readonly expected: typeof PATTERN_ALGORITHM_VERSION;
  readonly message: string;
  readonly received: AlgorithmVersion;
}

export interface UnsupportedSchemaVersionError {
  readonly code: "UNSUPPORTED_SCHEMA_VERSION";
  readonly expected: typeof SCHEMA_VERSION;
  readonly message: string;
  readonly received: SchemaVersion;
}

export interface DimensionMismatchError {
  readonly code: "DIMENSION_MISMATCH";
  readonly message: string;
  readonly parametersHeight: number;
  readonly parametersWidth: number;
  readonly requestedHeight: number;
  readonly requestedWidth: number;
}

export interface PrimitiveLimitError {
  readonly code: "PRIMITIVE_LIMIT_EXCEEDED";
  readonly maxPrimitives: number;
  readonly message: string;
  readonly requestedPrimitives: number;
}

export type GenerationError =
  | DimensionMismatchError
  | InvalidOptionsError
  | InvalidPaletteError
  | PatternParametersError
  | PrimitiveLimitError
  | SeedValidationError
  | UnsupportedAlgorithmVersionError
  | UnsupportedSchemaVersionError;

export type PatternParametersError = Extract<
  ReturnType<typeof validatePatternParameters>,
  { readonly ok: false }
>["error"];

function signedRandom(rng: Rng, magnitude: number): number {
  return (rng.nextFloat() * 2 - 1) * magnitude;
}

function createPrimitiveId(index: number): EntityId {
  return `primitive-${String(index + 1).padStart(6, "0")}` as EntityId;
}

function createBase(
  id: EntityId,
  index: number,
  primitiveCount: number,
  parameters: PatternParameters,
  rng: Rng,
  dimensions: Size,
  opacityMin: number,
  opacityMax: number,
): {
  readonly id: EntityId;
  readonly opacity: number;
  readonly rotation: number;
  readonly scale: number;
  readonly x: number;
  readonly y: number;
} {
  const jitterRadius =
    Math.min(dimensions.width, dimensions.height) * parameters.positionJitter;

  // Degenerate range consumes no draw, preserving the Phase 4 stream.
  const opacity =
    opacityMin >= opacityMax
      ? opacityMin
      : opacityMin + rng.nextFloat() * (opacityMax - opacityMin);

  // rotationBase shifts the whole design (0 keeps legacy output identical).
  const rotation =
    parameters.rotationBase + signedRandom(rng, parameters.rotationRange);
  // Per-primitive variation around the configured scale, clamped to
  // (0, 1] so that scale: 1 configs stay renderable (the renderer
  // validates scale in that range). No extra rng draws.
  const scale = Math.min(1, parameters.scale * (0.75 + rng.nextFloat() * 0.5));

  if (parameters.arrangement === "grid") {
    const cols = Math.max(
      1,
      Math.round(
        Math.sqrt((primitiveCount * dimensions.width) / dimensions.height),
      ),
    );
    const rows = Math.max(1, Math.ceil(primitiveCount / cols));
    const col = index % cols;
    const row = Math.floor(index / cols);
    return {
      id,
      opacity,
      rotation,
      scale,
      x:
        ((col + 0.5) * dimensions.width) / cols +
        signedRandom(rng, jitterRadius),
      y:
        ((row + 0.5) * dimensions.height) / rows +
        signedRandom(rng, jitterRadius),
    };
  }

  if (parameters.arrangement === "rows") {
    const rows = Math.max(1, Math.round(Math.sqrt(primitiveCount) / 2));
    const row = index % rows;
    return {
      id,
      opacity,
      rotation,
      scale,
      x: rng.nextFloat() * dimensions.width + signedRandom(rng, jitterRadius),
      y:
        ((row + 0.5) * dimensions.height) / rows +
        signedRandom(rng, jitterRadius),
    };
  }

  return {
    id,
    opacity,
    rotation,
    scale,
    x: rng.nextFloat() * dimensions.width + signedRandom(rng, jitterRadius),
    y: rng.nextFloat() * dimensions.height + signedRandom(rng, jitterRadius),
  };
}

function createPolygonPoints(
  complexity: number,
  radius: number,
  rng: Rng,
): readonly Point[] {
  const pointCount = complexity + 2;
  const points: Point[] = [];

  for (let index = 0; index < pointCount; index += 1) {
    const angle = (index / pointCount) * Math.PI * 2;
    const pointRadius = radius * (0.75 + rng.nextFloat() * 0.5);
    points.push({
      x: Math.cos(angle) * pointRadius,
      y: Math.sin(angle) * pointRadius,
    });
  }

  return points;
}

function createPrimitive(
  index: number,
  primitiveCount: number,
  parameters: PatternParameters,
  dimensions: Size,
  rng: Rng,
  palette: Palette | undefined,
  options: GenerationOptions,
): PatternPrimitive {
  const base = createBase(
    createPrimitiveId(index),
    index,
    primitiveCount,
    parameters,
    rng,
    dimensions,
    options.opacityMin,
    options.opacityMax,
  );
  // SCALE SEMANTICS (Phase 4 fix): the base size intentionally excludes
  // `base.scale`. The renderer is the single source of truth for scale and
  // computes `effective = geometry * primitive.scale`. Previously the
  // generator baked scale into the geometry AND the renderer multiplied
  // again (scale applied twice). The RNG call order is unchanged, so
  // positions, rotations, and per-primitive scale values are identical;
  // only base geometry extents differ. This intentionally changes the
  // Phase 3 golden checksum (see tests/phase4.test.ts).
  const minimumDimension = Math.min(dimensions.width, dimensions.height);
  const size = minimumDimension * 0.05;

  let primitive: PatternPrimitive;
  switch (parameters.primitiveType) {
    case "circle":
      primitive = {
        ...base,
        radius: size * (0.6 + rng.nextFloat() * 0.8),
        type: "circle",
      };
      break;
    case "rectangle":
      primitive = {
        ...base,
        height: size * (0.6 + rng.nextFloat() * 0.8),
        type: "rectangle",
        width: size * (0.6 + rng.nextFloat() * 0.8),
      };
      break;
    case "ellipse":
      primitive = {
        ...base,
        radiusX: size * (0.6 + rng.nextFloat() * 0.8),
        radiusY: size * (0.6 + rng.nextFloat() * 0.8),
        type: "ellipse",
      };
      break;
    case "line":
      primitive = {
        ...base,
        length: size * (1 + rng.nextFloat() * 2),
        thickness: options.lineThickness,
        type: "line",
      };
      break;
    case "polygon":
      primitive = {
        ...base,
        points: createPolygonPoints(parameters.complexity, size, rng),
        type: "polygon",
      };
      break;
    case "star": {
      const spikes = Math.min(10, Math.max(5, parameters.complexity + 2));
      const radius = size * (0.6 + rng.nextFloat() * 0.8);
      primitive = {
        ...base,
        innerRadius: radius * (0.4 + rng.nextFloat() * 0.25),
        radius,
        spikes,
        type: "star",
      };
      break;
    }
    case "ring": {
      const radius = size * (0.6 + rng.nextFloat() * 0.8);
      primitive = {
        ...base,
        radius,
        thickness: Math.min(options.lineThickness, radius * 0.8),
        type: "ring",
      };
      break;
    }
    case "flower": {
      const petals =
        3 +
        Math.floor(rng.nextFloat() * Math.min(parameters.complexity + 1, 8));
      const petalLength = size * (0.8 + rng.nextFloat() * 0.5);
      primitive = {
        ...base,
        centerRadius: petalLength * (0.2 + rng.nextFloat() * 0.1),
        petalLength,
        petals,
        petalWidth: petalLength * (0.35 + rng.nextFloat() * 0.25),
        type: "flower",
      };
      break;
    }
    case "wave": {
      const length = size * (1 + rng.nextFloat() * 2);
      const waves = 1 + Math.floor(rng.nextFloat() * 3);
      primitive = {
        ...base,
        amplitude: size * (0.15 + rng.nextFloat() * 0.25),
        length,
        thickness: options.lineThickness,
        type: "wave",
        wavelength: length / waves,
      };
      break;
    }
    case "leaf":
      primitive = {
        ...base,
        length: size * (0.8 + rng.nextFloat() * 0.8),
        type: "leaf",
        width: size * (0.3 + rng.nextFloat() * 0.3),
      };
      break;
    case "sprig": {
      const stemLength = size * (1.2 + rng.nextFloat() * 0.8);
      const leafCount = 2 + Math.floor(rng.nextFloat() * 4);
      const leaves: {
        along: number;
        angle: number;
        length: number;
        width: number;
      }[] = [];
      for (let k = 0; k < leafCount; k += 1) {
        const side = k % 2 === 0 ? 1 : -1;
        const leafLength = size * (0.4 + rng.nextFloat() * 0.4);
        leaves.push({
          along: 0.25 + rng.nextFloat() * 0.65,
          angle: side * (0.5 + rng.nextFloat() * 0.5),
          length: leafLength,
          width: leafLength * (0.35 + rng.nextFloat() * 0.2),
        });
      }
      const berryCount = Math.floor(rng.nextFloat() * 4);
      const berries: { radius: number; x: number; y: number }[] = [];
      for (let k = 0; k < berryCount; k += 1) {
        berries.push({
          radius: size * (0.06 + rng.nextFloat() * 0.06),
          x: (rng.nextFloat() * 2 - 1) * size * 0.3,
          y: stemLength * (0.55 + rng.nextFloat() * 0.35),
        });
      }
      const hasFlower = rng.nextFloat() < 0.7;
      const petalLength = size * (0.35 + rng.nextFloat() * 0.25);
      primitive = {
        ...base,
        berries,
        flower: hasFlower
          ? {
              centerRadius: petalLength * 0.25,
              petalLength,
              petals: 4 + Math.floor(rng.nextFloat() * 5),
              petalWidth: petalLength * (0.4 + rng.nextFloat() * 0.2),
              x: 0,
              y: stemLength,
            }
          : null,
        leaves,
        stemLength,
        stemThickness: options.lineThickness,
        type: "sprig",
      };
      break;
    }
  }

  // Deterministic color selection is the LAST rng consumption per
  // primitive, so colorless generation uses a strict prefix of the same
  // stream (no extra draws when no palette is provided). Sequential
  // order cycles by index and consumes no draw at all.
  if (palette !== undefined && palette.colors.length > 0) {
    const color: RgbaColor =
      options.colorOrder === "sequential"
        ? (palette.colors[index % palette.colors.length] as RgbaColor)
        : rng.pick(palette.colors);
    if (primitive.type === "sprig" && primitive.flower !== null) {
      return { ...primitive, accent: rng.pick(palette.colors), color };
    }
    return { ...primitive, color };
  }
  return primitive;
}

function createResultId(
  input: GenerationInput,
  parameters: PatternParameters,
  primitiveCount: number,
  seedValue: string,
  options: GenerationOptions,
): EntityId {
  const segments = [
    "generation",
    seedValue,
    `${input.dimensions.width}x${input.dimensions.height}`,
    parameters.density,
    parameters.scale,
    parameters.complexity,
    parameters.rotationRange,
    parameters.positionJitter,
    parameters.primitiveType,
    primitiveCount,
  ];
  // Palette affects primitive colors, so it participates in the result id.
  // Appended only when provided, keeping colorless result ids identical
  // to Phase 2/3.
  if (input.palette !== undefined) {
    segments.push(
      `palette-${input.palette.colors.map((c) => colorToHex(c)).join(".")}`,
    );
  }
  // Advanced controls participate only when non-default, keeping default
  // result ids (and goldens) identical to Phase 4.
  if (options.lineThickness !== 1) {
    segments.push(`lt-${options.lineThickness}`);
  }
  if (options.opacityMin !== 1 || options.opacityMax !== 1) {
    segments.push(`op-${options.opacityMin}-${options.opacityMax}`);
  }
  if (options.colorOrder !== "random") {
    segments.push(`co-${options.colorOrder}`);
  }
  if (parameters.arrangement !== "scatter") {
    segments.push(`ar-${parameters.arrangement}`);
  }
  if (parameters.rotationBase !== 0) {
    segments.push(`rb-${parameters.rotationBase}`);
  }
  return segments.join("-") as EntityId;
}

function calculatePrimitiveCount(dimensions: Size, density: number): number {
  return Math.ceil(
    (dimensions.width * dimensions.height * density) / DENSITY_AREA_UNIT,
  );
}

export function generatePattern(
  input: GenerationInput,
): Result<GenerationResult, GenerationError> {
  if (input.algorithmVersion !== PATTERN_ALGORITHM_VERSION) {
    return err({
      code: "UNSUPPORTED_ALGORITHM_VERSION",
      expected: PATTERN_ALGORITHM_VERSION,
      message: `Only ${PATTERN_ALGORITHM_VERSION} is supported.`,
      received: input.algorithmVersion,
    });
  }

  if (input.schemaVersion !== SCHEMA_VERSION) {
    return err({
      code: "UNSUPPORTED_SCHEMA_VERSION",
      expected: SCHEMA_VERSION,
      message: `Only ${SCHEMA_VERSION} is supported.`,
      received: input.schemaVersion,
    });
  }

  const parametersResult = validatePatternParameters(input.parameters);

  if (!parametersResult.ok) {
    return err(parametersResult.error);
  }

  const parameters = parametersResult.value;

  if (
    input.dimensions.width !== parameters.canvasWidth ||
    input.dimensions.height !== parameters.canvasHeight
  ) {
    return err({
      code: "DIMENSION_MISMATCH",
      message: "dimensions must match parameters canvas dimensions.",
      parametersHeight: parameters.canvasHeight,
      parametersWidth: parameters.canvasWidth,
      requestedHeight: input.dimensions.height,
      requestedWidth: input.dimensions.width,
    });
  }

  const seedResult = createCanonicalSeed(input.seed);

  if (!seedResult.ok) {
    return err(seedResult.error);
  }

  let palette: Palette | undefined;
  if (input.palette !== undefined) {
    const paletteResult = validatePalette(input.palette);
    if (!paletteResult.ok) {
      return err({
        code: "INVALID_PALETTE",
        message: paletteResult.error.message,
      });
    }
    palette = paletteResult.value;
  }

  const optionsResult = validateGenerationOptions(input.options ?? {});
  if (!optionsResult.ok) {
    return err({
      code: "INVALID_OPTIONS",
      field: optionsResult.error.field,
      message: optionsResult.error.message,
    });
  }
  const options = optionsResult.value;

  const primitiveCount = calculatePrimitiveCount(
    input.dimensions,
    parameters.density,
  );

  if (primitiveCount > MAX_PRIMITIVES) {
    return err({
      code: "PRIMITIVE_LIMIT_EXCEEDED",
      maxPrimitives: MAX_PRIMITIVES,
      message: `Generation requested ${primitiveCount} primitives; maximum is ${MAX_PRIMITIVES}.`,
      requestedPrimitives: primitiveCount,
    });
  }

  const rng = createRng(seedResult.value);
  const primitives: PatternPrimitive[] = [];

  for (let index = 0; index < primitiveCount; index += 1) {
    primitives.push(
      createPrimitive(
        index,
        primitiveCount,
        parameters,
        input.dimensions,
        rng,
        palette,
        options,
      ),
    );
  }

  return ok({
    algorithmVersion: input.algorithmVersion,
    effectiveSeed: seedResult.value,
    height: input.dimensions.height,
    primitiveCount,
    primitives,
    resultId: createResultId(
      input,
      parameters,
      primitiveCount,
      seedResult.value.value,
      options,
    ),
    schemaVersion: input.schemaVersion,
    tileable: false,
    width: input.dimensions.width,
  });
}
