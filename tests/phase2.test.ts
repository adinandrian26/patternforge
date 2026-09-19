import { describe, expect, it } from "vitest";
import {
  MAX_CANVAS_DIMENSION,
  type PatternParametersInput,
  type Point,
  type Rect,
  type Size,
  type Transform,
  validatePatternParameters,
} from "@patternforge/core";
import {
  MAX_PRIMITIVES,
  PRNG_ALGORITHM,
  createCanonicalSeed,
  createRng,
  generatePattern,
  type SeedInput,
} from "@patternforge/pattern-engine";
import {
  PATTERN_ALGORITHM_VERSION,
  SCHEMA_VERSION,
  type Result,
} from "@patternforge/shared";
import {
  getNeighborTranslations,
  wrapCoordinate,
} from "@patternforge/tile-engine";

function unwrap<T, E>(result: Result<T, E>): T {
  if (!result.ok) {
    throw new Error("Expected a successful Result.");
  }

  return result.value;
}

function baseParameters(
  overrides: Partial<PatternParametersInput> = {},
): PatternParametersInput {
  return {
    canvasHeight: 100,
    canvasWidth: 100,
    complexity: 3,
    density: 5,
    positionJitter: 0.1,
    primitiveType: "circle",
    rotationRange: Math.PI,
    scale: 0.5,
    ...overrides,
  };
}

function generationInput(
  seed: SeedInput,
  parameters: PatternParametersInput = baseParameters(),
) {
  return {
    algorithmVersion: PATTERN_ALGORITHM_VERSION,
    dimensions: {
      height: parameters.canvasHeight,
      width: parameters.canvasWidth,
    },
    parameters,
    schemaVersion: SCHEMA_VERSION,
    seed,
  };
}

describe("canonical seed", () => {
  it("normalizes numbers and numeric strings to the same value", () => {
    expect(unwrap(createCanonicalSeed(12345))).toEqual(
      unwrap(createCanonicalSeed("12345")),
    );
    expect(unwrap(createCanonicalSeed("00012345")).value).toBe("12345");
    expect(unwrap(createCanonicalSeed("+12345")).value).toBe("12345");
  });

  it("accepts the uint32 boundaries", () => {
    expect(createCanonicalSeed(0).ok).toBe(true);
    expect(createCanonicalSeed(0xffff_ffff).ok).toBe(true);
    expect(createCanonicalSeed(MAX_CANVAS_DIMENSION).ok).toBe(true);
  });

  it("rejects invalid and out-of-range seeds with typed errors", () => {
    const invalidSeeds: SeedInput[] = [
      -1,
      0x1_0000_0000,
      Number.NaN,
      Number.POSITIVE_INFINITY,
      "",
      "-1",
      "1.5",
      "seed",
    ];

    for (const seed of invalidSeeds) {
      const result = createCanonicalSeed(seed);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("INVALID_SEED");
      }
    }
  });
});

describe("deterministic PRNG", () => {
  it("uses Mulberry32 and produces the same sequence for the same seed", () => {
    const seed = unwrap(createCanonicalSeed("42"));
    const first = createRng(seed);
    const second = createRng(seed);

    expect(PRNG_ALGORITHM).toBe("mulberry32");
    expect([first.next(), first.next(), first.next()]).toEqual([
      second.next(),
      second.next(),
      second.next(),
    ]);
  });

  it("produces a different sequence for a different seed", () => {
    const first = createRng(unwrap(createCanonicalSeed(42)));
    const second = createRng(unwrap(createCanonicalSeed(43)));

    expect(first.next()).not.toBe(second.next());
  });

  it("keeps nextFloat in [0, 1) and nextInt in [min, max)", () => {
    const rng = createRng(unwrap(createCanonicalSeed(7)));

    for (let index = 0; index < 100; index += 1) {
      const value = rng.nextFloat();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);

      const integer = rng.nextInt(-3, 4);
      expect(integer).toBeGreaterThanOrEqual(-3);
      expect(integer).toBeLessThan(4);
    }
  });

  it("selects items deterministically", () => {
    const items = ["circle", "rectangle", "polygon"] as const;
    const first = createRng(unwrap(createCanonicalSeed(99)));
    const second = createRng(unwrap(createCanonicalSeed(99)));

    expect(Array.from({ length: 20 }, () => first.pick(items))).toEqual(
      Array.from({ length: 20 }, () => second.pick(items)),
    );
  });
});

describe("geometry and parameter validation", () => {
  it("represents top-left coordinates and radian transforms", () => {
    const point: Point = { x: 10, y: 20 };
    const size: Size = { height: 40, width: 30 };
    const rect: Rect = { ...point, ...size };
    const transform: Transform = {
      rotation: Math.PI / 2,
      scaleX: 1,
      scaleY: 0.5,
      x: point.x,
      y: point.y,
    };

    expect(rect).toEqual({ height: 40, width: 30, x: 10, y: 20 });
    expect(transform.rotation).toBe(Math.PI / 2);
  });

  it("accepts a valid parameter set", () => {
    const result = validatePatternParameters(baseParameters());

    expect(result.ok).toBe(true);
  });

  it("rejects invalid width, height, density, scale, non-finite values, and type", () => {
    const invalidCases: Array<{
      readonly code: string;
      readonly parameters: PatternParametersInput;
    }> = [
      {
        code: "INVALID_CANVAS_WIDTH",
        parameters: baseParameters({ canvasWidth: 0 }),
      },
      {
        code: "INVALID_CANVAS_HEIGHT",
        parameters: baseParameters({ canvasHeight: MAX_CANVAS_DIMENSION + 1 }),
      },
      {
        code: "INVALID_DENSITY",
        parameters: baseParameters({ density: -1 }),
      },
      {
        code: "INVALID_SCALE",
        parameters: baseParameters({ scale: Number.POSITIVE_INFINITY }),
      },
      {
        code: "INVALID_DENSITY",
        parameters: baseParameters({ density: Number.NaN }),
      },
      {
        code: "INVALID_PRIMITIVE_TYPE",
        parameters: baseParameters({ primitiveType: "triangle" }),
      },
    ];

    for (const invalidCase of invalidCases) {
      const result = validatePatternParameters(invalidCase.parameters);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe(invalidCase.code);
      }
    }
  });
});

describe("bounded deterministic generation", () => {
  it("generates identical structured output for identical input", () => {
    const input = generationInput("12345");
    const first = unwrap(generatePattern(input));
    const second = unwrap(generatePattern(input));

    expect(first).toEqual(second);
    expect(first.effectiveSeed.value).toBe("12345");
    expect(first.algorithmVersion).toBe(PATTERN_ALGORITHM_VERSION);
    expect(first.schemaVersion).toBe(SCHEMA_VERSION);
    expect(first.primitiveCount).toBe(first.primitives.length);
    expect(first.primitiveCount).toBeLessThanOrEqual(MAX_PRIMITIVES);
    expect(first.primitives[0]?.id).toBe("primitive-000001");
  });

  it("keeps count stable and changes valid placement for a different seed", () => {
    const first = unwrap(generatePattern(generationInput(1)));
    const second = unwrap(generatePattern(generationInput(2)));

    expect(first.primitiveCount).toBe(second.primitiveCount);
    expect(first.primitives).not.toEqual(second.primitives);
  });

  it("supports every data-only primitive type", () => {
    const primitiveTypes = [
      "circle",
      "rectangle",
      "ellipse",
      "line",
      "polygon",
    ] as const;

    for (const primitiveType of primitiveTypes) {
      const result = unwrap(
        generatePattern(generationInput(5, baseParameters({ primitiveType }))),
      );
      const primitive = result.primitives[0];

      expect(primitive?.type).toBe(primitiveType);
      if (primitiveType === "polygon" && primitive?.type === "polygon") {
        expect(primitive.points).toHaveLength(5);
      }
    }
  });

  it("returns a typed error when the primitive limit is exceeded", () => {
    const result = generatePattern(
      generationInput(
        1,
        baseParameters({
          canvasHeight: 1_000,
          canvasWidth: 1_001,
          density: 100,
        }),
      ),
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("PRIMITIVE_LIMIT_EXCEEDED");
      if (result.error.code === "PRIMITIVE_LIMIT_EXCEEDED") {
        expect(result.error.maxPrimitives).toBe(MAX_PRIMITIVES);
      }
    }
  });

  it("records a dimension mismatch instead of silently changing input", () => {
    const input = generationInput(1);
    const result = generatePattern({
      ...input,
      dimensions: { height: 101, width: 100 },
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("DIMENSION_MISMATCH");
    }
  });
});

describe("wrapped coordinates and neighbor translations", () => {
  it("wraps negative, exact-size, and overflowing coordinates", () => {
    expect(wrapCoordinate(-10, 100)).toBe(90);
    expect(wrapCoordinate(0, 100)).toBe(0);
    expect(wrapCoordinate(50, 100)).toBe(50);
    expect(wrapCoordinate(100, 100)).toBe(0);
    expect(wrapCoordinate(110, 100)).toBe(10);
    expect(wrapCoordinate(-110, 100)).toBe(90);

    for (const value of [-1_000, -1, 0, 1, 100, 1_000]) {
      const wrapped = wrapCoordinate(value, 100);
      expect(wrapped).toBeGreaterThanOrEqual(0);
      expect(wrapped).toBeLessThan(100);
    }
  });

  it("returns center, edge, and corner translations", () => {
    const translations = getNeighborTranslations(100, 50);

    expect(translations).toHaveLength(9);
    expect(translations).toContainEqual({
      dx: 0,
      dy: 0,
      offsetX: 0,
      offsetY: 0,
    });
    expect(translations).toContainEqual({
      dx: -1,
      dy: 0,
      offsetX: -100,
      offsetY: 0,
    });
    expect(translations).toContainEqual({
      dx: 1,
      dy: 0,
      offsetX: 100,
      offsetY: 0,
    });
    expect(translations).toContainEqual({
      dx: 0,
      dy: -1,
      offsetX: 0,
      offsetY: -50,
    });
    expect(translations).toContainEqual({
      dx: 0,
      dy: 1,
      offsetX: 0,
      offsetY: 50,
    });
    expect(translations).toContainEqual({
      dx: -1,
      dy: -1,
      offsetX: -100,
      offsetY: -50,
    });
    expect(translations).toContainEqual({
      dx: 1,
      dy: -1,
      offsetX: 100,
      offsetY: -50,
    });
    expect(translations).toContainEqual({
      dx: -1,
      dy: 1,
      offsetX: -100,
      offsetY: 50,
    });
    expect(translations).toContainEqual({
      dx: 1,
      dy: 1,
      offsetX: 100,
      offsetY: 50,
    });
  });
});
