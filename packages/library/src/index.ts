export {
  MemoryStorage,
  PresetStore,
  MAX_PRESETS,
  MAX_PRESET_NAME_LENGTH,
  PRESET_SCHEMA_VERSION,
  validatePreset,
  validatePresetName,
  type KeyValueStorage,
  type Preset,
  type PresetError,
  type PresetErrorCode,
  type PresetInput,
  type PresetSchemaVersion,
} from "./presets";
export {
  HistoryStore,
  MAX_HISTORY_ENTRIES,
  validateHistoryEntry,
  type HistoryEntry,
  type HistoryError,
  type HistoryErrorCode,
} from "./history";
export {
  BUILTIN_TEMPLATES,
  getTemplate,
  type BuiltinTemplate,
} from "./templates";
export {
  PROJECT_APP_ID,
  PROJECT_FILE_EXTENSION,
  PROJECT_SCHEMA_VERSION,
  parseProjectFile,
  serializeProject,
  type ProjectError,
  type ProjectErrorCode,
  type ProjectFile,
  type ProjectSchemaVersion,
} from "./project";

export const LIBRARY_PACKAGE_NAME = "@patternforge/library" as const;
