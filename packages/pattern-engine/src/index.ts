export {
  MAX_SEED,
  MIN_SEED,
  createCanonicalSeed,
  type CanonicalSeed,
  type CanonicalSeedValue,
  type SeedErrorReason,
  type SeedInput,
  type SeedValidationError,
} from "./seed";
export {
  createRng,
  PRNG_ALGORITHM,
  UINT32_RANGE,
  type Rng,
} from "./rng";
export {
  DENSITY_AREA_UNIT,
  generatePattern,
  MAX_PRIMITIVES,
  type DimensionMismatchError,
  type GenerationError,
  type GenerationInput,
  type InvalidOptionsError,
  type InvalidPaletteError,
  type PatternParametersError,
  type PrimitiveLimitError,
  type UnsupportedAlgorithmVersionError,
  type UnsupportedSchemaVersionError,
} from "./generate";
export type {
  Circle,
  Ellipse,
  Line,
  PatternPrimitive,
  Point,
  Polygon,
  Rectangle,
  Transform,
} from "@patternforge/core";

export const PATTERN_ENGINE_PACKAGE_NAME =
  "@patternforge/pattern-engine" as const;
