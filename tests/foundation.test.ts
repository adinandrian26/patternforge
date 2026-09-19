import { describe, expect, it } from "vitest";
import { CORE_PACKAGE_NAME, type PatternDefinition } from "@patternforge/core";
import { PATTERN_ENGINE_PACKAGE_NAME } from "@patternforge/pattern-engine";
import {
  ALGORITHM_VERSION,
  PRNG_ALGORITHM_VERSION,
  SCHEMA_VERSION,
  SHARED_PACKAGE_NAME,
} from "@patternforge/shared";
import { TILE_ENGINE_PACKAGE_NAME } from "@patternforge/tile-engine";

const definitionId =
  "definition-foundation" as PatternDefinition["definitionId"];

const foundationDefinition: PatternDefinition = {
  algorithmVersion: ALGORITHM_VERSION,
  definitionId,
  parameters: {
    canvasHeight: 1,
    canvasWidth: 1,
    complexity: 1,
    density: 1,
    positionJitter: 0,
    primitiveType: "circle",
    rotationRange: 0,
    scale: 1,
  },
  palette: {
    colors: [],
    selectionMode: "foundation-only",
  },
  schemaVersion: SCHEMA_VERSION,
  style: "foundation-only" as PatternDefinition["style"],
  tile: {
    coordinateMode: "wrapped-modular",
    cornerPolicy: "translated-copies",
    edgePolicy: "translated-copies",
    height: 1,
    width: 1,
  },
  seed: {
    algorithmVersion: PRNG_ALGORITHM_VERSION,
    value: "foundation-seed",
  },
};

describe("workspace foundation", () => {
  it("imports shared and core foundations", () => {
    expect(SHARED_PACKAGE_NAME).toBe("@patternforge/shared");
    expect(CORE_PACKAGE_NAME).toBe("@patternforge/core");
    expect(foundationDefinition.schemaVersion).toBe(SCHEMA_VERSION);
  });

  it("represents deterministic seed metadata", () => {
    expect(foundationDefinition.seed).toEqual({
      algorithmVersion: PRNG_ALGORITHM_VERSION,
      value: "foundation-seed",
    });
  });

  it("loads engine package boundaries", () => {
    expect(PATTERN_ENGINE_PACKAGE_NAME).toBe("@patternforge/pattern-engine");
    expect(TILE_ENGINE_PACKAGE_NAME).toBe("@patternforge/tile-engine");
  });
});
