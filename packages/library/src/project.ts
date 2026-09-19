import { err, ok, type Result } from "@patternforge/shared";
import {
  validateGenerationConfig,
  type GenerationConfig,
} from "@patternforge/core";

/**
 * Local project file format (`.patternforge`): versioned JSON holding a
 * generation config plus optional metadata. No executable content, no
 * scripts, no arbitrary paths, no remote loading. Files are validated
 * before entering core.
 */

export const PROJECT_SCHEMA_VERSION = "project-v1" as const;
export type ProjectSchemaVersion = typeof PROJECT_SCHEMA_VERSION;
export const PROJECT_FILE_EXTENSION = ".patternforge";
export const PROJECT_APP_ID = "patternforge";

export interface ProjectFile {
  readonly app: typeof PROJECT_APP_ID;
  readonly config: GenerationConfig;
  readonly schemaVersion: ProjectSchemaVersion;
}

export type ProjectErrorCode =
  | "INVALID_JSON"
  | "INVALID_SCHEMA"
  | "INVALID_APP"
  | "INVALID_CONFIG";

export interface ProjectError {
  readonly code: ProjectErrorCode;
  readonly message: string;
}

function projectError(
  code: ProjectErrorCode,
  message: string,
): Result<never, ProjectError> {
  return err({ code, message });
}

export function serializeProject(config: GenerationConfig): string {
  const file: ProjectFile = {
    app: PROJECT_APP_ID,
    config,
    schemaVersion: PROJECT_SCHEMA_VERSION,
  };
  return JSON.stringify(file, null, 2);
}

/** Parse + validate untrusted project text (file contents or pasted). */
export function parseProjectFile(
  text: unknown,
): Result<ProjectFile, ProjectError> {
  if (typeof text !== "string") {
    return projectError("INVALID_JSON", "Project data must be a string.");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text) as unknown;
  } catch {
    return projectError("INVALID_JSON", "Project data is not valid JSON.");
  }
  if (typeof parsed !== "object" || parsed === null) {
    return projectError("INVALID_SCHEMA", "Project must be an object.");
  }
  const candidate = parsed as Record<string, unknown>;
  if (candidate.app !== PROJECT_APP_ID) {
    return projectError(
      "INVALID_APP",
      `Project app must be "${PROJECT_APP_ID}".`,
    );
  }
  if (candidate.schemaVersion !== PROJECT_SCHEMA_VERSION) {
    return projectError(
      "INVALID_SCHEMA",
      `Unsupported project schema: ${String(candidate.schemaVersion)}.`,
    );
  }
  const config = validateGenerationConfig(
    candidate.config as Parameters<typeof validateGenerationConfig>[0],
  );
  if (!config.ok) {
    return projectError(
      "INVALID_CONFIG",
      `Project config invalid: ${config.error.message}`,
    );
  }
  return ok({
    app: PROJECT_APP_ID,
    config: config.value,
    schemaVersion: PROJECT_SCHEMA_VERSION,
  });
}
