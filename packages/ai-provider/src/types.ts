/**
 * Structured pattern intent: the ONLY shape any AI provider may return.
 * Every field is optional; missing fields fall back to the current
 * configuration. The intent never touches files, shell, network targets,
 * or the renderer — it is validated into a GenerationConfig first.
 */
export interface PatternIntent {
  readonly backgroundHex?: string;
  readonly complexity?: number;
  readonly density?: number;
  readonly paletteHex?: readonly string[];
  readonly positionJitter?: number;
  readonly primitiveType?: string;
  readonly rotationDegrees?: number;
  readonly scale?: number;
}

export type AIErrorCode =
  | "AI_UNAVAILABLE"
  | "AI_TIMEOUT"
  | "AI_INVALID_RESPONSE"
  | "AI_NOT_CONFIGURED";

export interface AIError {
  readonly code: AIErrorCode;
  readonly message: string;
}

export interface AIProvider {
  readonly id: string;
  readonly label: string;
  /** Offline-capable without credentials. */
  readonly offlineCapable: boolean;
  analyze(prompt: string): Promise<PatternIntent>;
}
