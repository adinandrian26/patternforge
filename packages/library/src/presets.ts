import { err, ok, type Result } from "@patternforge/shared";
import {
  validateGenerationConfig,
  type GenerationConfig,
} from "@patternforge/core";

/**
 * Local preset system. A preset is a named, versioned generation config.
 * Storage is injected (`KeyValueStorage`) so core logic stays
 * browser-independent; the desktop wires localStorage, tests use memory.
 */

export const PRESET_SCHEMA_VERSION = "preset-v1" as const;
export type PresetSchemaVersion = typeof PRESET_SCHEMA_VERSION;
export const MAX_PRESETS = 100;
export const MAX_PRESET_NAME_LENGTH = 60;

export interface Preset {
  readonly config: GenerationConfig;
  readonly name: string;
  readonly schemaVersion: PresetSchemaVersion;
}

export interface PresetInput {
  readonly config?: unknown;
  readonly name?: unknown;
  readonly schemaVersion?: unknown;
}

export type PresetErrorCode =
  | "INVALID_NAME"
  | "INVALID_CONFIG"
  | "INVALID_SCHEMA"
  | "NOT_FOUND"
  | "STORAGE_FULL"
  | "STORAGE_ERROR";

export interface PresetError {
  readonly code: PresetErrorCode;
  readonly message: string;
}

function presetError(
  code: PresetErrorCode,
  message: string,
): Result<never, PresetError> {
  return err({ code, message });
}

export function validatePresetName(name: unknown): Result<string, PresetError> {
  if (typeof name !== "string") {
    return presetError("INVALID_NAME", "Preset name must be a string.");
  }
  const trimmed = name.trim();
  if (trimmed.length === 0 || trimmed.length > MAX_PRESET_NAME_LENGTH) {
    return presetError(
      "INVALID_NAME",
      `Preset name must be 1..${MAX_PRESET_NAME_LENGTH} characters.`,
    );
  }
  return ok(trimmed);
}

/**
 * Validate an untrusted preset object. Accepts current `preset-v1` and
 * legacy unversioned `{ name, config }` shapes (migrated forward).
 */
export function validatePreset(input: unknown): Result<Preset, PresetError> {
  if (typeof input !== "object" || input === null) {
    return presetError("INVALID_SCHEMA", "Preset must be an object.");
  }
  const candidate = input as PresetInput;
  if (
    candidate.schemaVersion !== undefined &&
    candidate.schemaVersion !== PRESET_SCHEMA_VERSION
  ) {
    return presetError(
      "INVALID_SCHEMA",
      `Unsupported preset schema: ${String(candidate.schemaVersion)}.`,
    );
  }
  const name = validatePresetName(candidate.name);
  if (!name.ok) {
    return name;
  }
  if (typeof candidate.config !== "object" || candidate.config === null) {
    return presetError("INVALID_CONFIG", "Preset config must be an object.");
  }
  const config = validateGenerationConfig(
    candidate.config as Parameters<typeof validateGenerationConfig>[0],
  );
  if (!config.ok) {
    return presetError(
      "INVALID_CONFIG",
      `Preset config invalid: ${config.error.message}`,
    );
  }
  return ok({
    config: config.value,
    name: name.value,
    schemaVersion: PRESET_SCHEMA_VERSION,
  });
}

export interface KeyValueStorage {
  getItem(key: string): string | null;
  removeItem(key: string): void;
  setItem(key: string, value: string): void;
}

export class MemoryStorage implements KeyValueStorage {
  private readonly map = new Map<string, string>();

  getItem(key: string): string | null {
    return this.map.get(key) ?? null;
  }

  removeItem(key: string): void {
    this.map.delete(key);
  }

  setItem(key: string, value: string): void {
    this.map.set(key, value);
  }
}

const PRESET_KEY_PREFIX = "patternforge.preset.";
const PRESET_INDEX_KEY = "patternforge.presets.index";

function presetKey(name: string): string {
  return `${PRESET_KEY_PREFIX}${name}`;
}

function readIndex(storage: KeyValueStorage): string[] {
  const raw = storage.getItem(PRESET_INDEX_KEY);
  if (raw === null) {
    return [];
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.filter((entry): entry is string => typeof entry === "string");
  } catch {
    return [];
  }
}

function writeIndex(storage: KeyValueStorage, names: readonly string[]): void {
  storage.setItem(PRESET_INDEX_KEY, JSON.stringify([...names]));
}

/** Bounded preset store with duplicate/rename/delete + validation. */
export class PresetStore {
  private readonly storage: KeyValueStorage;

  constructor(storage: KeyValueStorage) {
    this.storage = storage;
  }

  save(preset: Preset): Result<Preset, PresetError> {
    const validated = validatePreset(preset);
    if (!validated.ok) {
      return validated;
    }
    const names = readIndex(this.storage);
    if (!names.includes(validated.value.name) && names.length >= MAX_PRESETS) {
      return presetError(
        "STORAGE_FULL",
        `At most ${MAX_PRESETS} presets can be stored.`,
      );
    }
    try {
      this.storage.setItem(
        presetKey(validated.value.name),
        JSON.stringify(validated.value),
      );
      if (!names.includes(validated.value.name)) {
        writeIndex(this.storage, [...names, validated.value.name]);
      }
    } catch {
      return presetError("STORAGE_ERROR", "Preset storage write failed.");
    }
    return ok(validated.value);
  }

  load(name: string): Result<Preset, PresetError> {
    const raw = this.storage.getItem(presetKey(name));
    if (raw === null) {
      return presetError("NOT_FOUND", `Preset "${name}" not found.`);
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw) as unknown;
    } catch {
      return presetError("INVALID_SCHEMA", "Preset data is not valid JSON.");
    }
    return validatePreset(parsed);
  }

  delete(name: string): Result<void, PresetError> {
    if (this.storage.getItem(presetKey(name)) === null) {
      return presetError("NOT_FOUND", `Preset "${name}" not found.`);
    }
    this.storage.removeItem(presetKey(name));
    writeIndex(
      this.storage,
      readIndex(this.storage).filter((entry) => entry !== name),
    );
    return ok(undefined);
  }

  rename(oldName: string, newName: string): Result<Preset, PresetError> {
    const existing = this.load(oldName);
    if (!existing.ok) {
      return existing;
    }
    const name = validatePresetName(newName);
    if (!name.ok) {
      return name;
    }
    const renamed: Preset = { ...existing.value, name: name.value };
    const saved = this.save(renamed);
    if (!saved.ok) {
      return saved;
    }
    if (name.value !== oldName) {
      // `save` already indexed the new name; drop the old entry + key.
      this.storage.removeItem(presetKey(oldName));
      writeIndex(
        this.storage,
        readIndex(this.storage).filter((entry) => entry !== oldName),
      );
    }
    return ok(saved.value);
  }

  duplicate(name: string, copyName: string): Result<Preset, PresetError> {
    const existing = this.load(name);
    if (!existing.ok) {
      return existing;
    }
    return this.save({ ...existing.value, name: copyName });
  }

  /** Names in insertion order; corrupt entries are skipped. */
  listNames(): string[] {
    return readIndex(this.storage).filter(
      (name) => this.storage.getItem(presetKey(name)) !== null,
    );
  }

  list(): Preset[] {
    const presets: Preset[] = [];
    for (const name of this.listNames()) {
      const loaded = this.load(name);
      if (loaded.ok) {
        presets.push(loaded.value);
      }
    }
    return presets;
  }
}
