import { describe, expect, it } from "vitest";
import {
  DEFAULT_GENERATION_CONFIG,
  validateGenerationConfig,
} from "@patternforge/core";
import {
  BUILTIN_TEMPLATES,
  getTemplate,
  HistoryStore,
  MAX_HISTORY_ENTRIES,
  MemoryStorage,
  parseProjectFile,
  PresetStore,
  PROJECT_FILE_EXTENSION,
  serializeProject,
  validateHistoryEntry,
  validatePreset,
} from "@patternforge/library";
import { generatePattern } from "@patternforge/pattern-engine";
import {
  PATTERN_ALGORITHM_VERSION,
  SCHEMA_VERSION,
} from "@patternforge/shared";

function validConfig() {
  const config = validateGenerationConfig(DEFAULT_GENERATION_CONFIG);
  if (!config.ok) {
    throw new Error("default config invalid");
  }
  return config.value;
}

describe("presets", () => {
  it("saves, loads, lists, renames, duplicates, and deletes", () => {
    const store = new PresetStore(new MemoryStorage());
    const config = validConfig();
    expect(
      store.save({ config, name: "Evening", schemaVersion: "preset-v1" }).ok,
    ).toBe(true);
    expect(store.listNames()).toEqual(["Evening"]);
    expect(store.load("Evening").ok).toBe(true);
    expect(store.duplicate("Evening", "Evening copy").ok).toBe(true);
    expect(store.listNames()).toEqual(["Evening", "Evening copy"]);
    expect(store.rename("Evening copy", "Evening 2").ok).toBe(true);
    expect(store.listNames()).toEqual(["Evening", "Evening 2"]);
    expect(store.delete("Evening 2").ok).toBe(true);
    expect(store.listNames()).toEqual(["Evening"]);
    expect(store.load("Missing").ok).toBe(false);
    expect(store.delete("Missing").ok).toBe(false);
  });

  it("validates names, configs, and malformed data", () => {
    const store = new PresetStore(new MemoryStorage());
    expect(
      store.save({
        config: validConfig(),
        name: "  ",
        schemaVersion: "preset-v1",
      }).ok,
    ).toBe(false);
    expect(
      store.save({
        config: { ...validConfig(), density: -5 },
        name: "Bad",
        schemaVersion: "preset-v1",
      }).ok,
    ).toBe(false);
    expect(validatePreset(null).ok).toBe(false);
    expect(validatePreset({ name: "x" }).ok).toBe(false);
    expect(
      validatePreset({
        config: validConfig(),
        name: "x",
        schemaVersion: "preset-v9",
      }).ok,
    ).toBe(false);
    // Legacy unversioned shape migrates forward.
    const legacy = validatePreset({ config: validConfig(), name: "Legacy" });
    expect(legacy.ok).toBe(true);
  });
});

describe("history", () => {
  it("records newest-first, validates, and bounds to 50", () => {
    expect(MAX_HISTORY_ENTRIES).toBe(50);
    const store = new HistoryStore(new MemoryStorage());
    for (let i = 0; i < 55; i += 1) {
      const pushed = store.push({
        checksum: `chk${i}`,
        createdAt: `2026-01-0${(i % 9) + 1}T00:00:00Z`,
        seed: String(i),
        summary: `pattern ${i}`,
      });
      expect(pushed.ok).toBe(true);
    }
    const list = store.list();
    expect(list).toHaveLength(50);
    expect(list[0]?.checksum).toBe("chk54");
    expect(list[49]?.checksum).toBe("chk5");
    expect(
      store.push({ checksum: "", createdAt: "x", seed: "1", summary: "s" }).ok,
    ).toBe(false);
    expect(validateHistoryEntry(null).ok).toBe(false);
    store.clear();
    expect(store.list()).toEqual([]);
  });
});

describe("templates", () => {
  it("exposes seventeen validating deterministic templates", () => {
    expect(BUILTIN_TEMPLATES).toHaveLength(17);
    const ids = new Set<string>();
    for (const template of BUILTIN_TEMPLATES) {
      expect(template.id.length).toBeGreaterThan(0);
      expect(template.name.length).toBeGreaterThan(0);
      expect(template.description.length).toBeGreaterThan(0);
      expect(ids.has(template.id)).toBe(false);
      ids.add(template.id);
      expect(validateGenerationConfig(template.config).ok).toBe(true);
    }
    expect(getTemplate("geometric")?.name).toBe("Geometric");
    expect(getTemplate("nope")).toBeUndefined();
  });

  it("generates identical patterns per template on rerun", () => {
    for (const template of BUILTIN_TEMPLATES) {
      const input = {
        algorithmVersion: PATTERN_ALGORITHM_VERSION,
        dimensions: {
          height: template.config.height,
          width: template.config.width,
        },
        palette: template.config.palette,
        parameters: {
          arrangement: template.config.arrangement,
          canvasHeight: template.config.height,
          canvasWidth: template.config.width,
          complexity: template.config.complexity,
          density: template.config.density,
          positionJitter: template.config.positionJitter,
          primitiveType: template.config.primitiveType,
          rotationBase: template.config.rotationBase,
          rotationRange: template.config.rotationRange,
          scale: template.config.scale,
        },
        schemaVersion: SCHEMA_VERSION,
        seed: template.config.seed,
      };
      const first = generatePattern(input);
      const second = generatePattern(input);
      expect(first.ok && second.ok).toBe(true);
      if (first.ok && second.ok) {
        expect(first.value).toEqual(second.value);
      }
    }
  });
});

describe("project files", () => {
  it("round-trips and rejects malformed projects", () => {
    expect(PROJECT_FILE_EXTENSION).toBe(".patternforge");
    const text = serializeProject(validConfig());
    const parsed = parseProjectFile(text);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.value.config).toEqual(validConfig());
    }
    expect(parseProjectFile("not json").ok).toBe(false);
    expect(parseProjectFile("{}").ok).toBe(false);
    expect(
      parseProjectFile(
        JSON.stringify({
          app: "other",
          config: {},
          schemaVersion: "project-v1",
        }),
      ).ok,
    ).toBe(false);
    expect(
      parseProjectFile(
        JSON.stringify({
          app: "patternforge",
          config: {},
          schemaVersion: "project-v9",
        }),
      ).ok,
    ).toBe(false);
    expect(
      parseProjectFile(
        JSON.stringify({
          app: "patternforge",
          config: { ...validConfig(), width: -1 },
          schemaVersion: "project-v1",
        }),
      ).ok,
    ).toBe(false);
  });
});
