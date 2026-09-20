import type { AIError, AIProvider, PatternIntent } from "./types";

/**
 * Optional OpenAI-compatible chat provider. NEVER used unless the user
 * explicitly configures endpoint + model (+ optional key) and clicks
 * Analyze. No key is bundled, persisted, or logged — it lives only in
 * the call arguments for the duration of the request.
 *
 * The model is instructed to reply with a single JSON object matching
 * PatternIntent; anything else is rejected as AI_INVALID_RESPONSE and
 * must pass the same intent validator as the mock provider.
 */

export interface OpenAICompatibleOptions {
  readonly apiKey?: string;
  readonly endpoint: string;
  readonly model: string;
  readonly timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 30_000;
const SYSTEM_PROMPT =
  "You configure a procedural seamless pattern. Reply with ONLY a JSON " +
  "object using these optional keys: primitiveType (circle|rectangle|" +
  "ellipse|line|polygon|star|ring|flower|wave|leaf|sprig), density (1-100), scale (0.1-1), rotationDegrees " +
  "(0-360), complexity (1-8), positionJitter (0-1), paletteHex (array of " +
  "hex colors like #ff0000, max 8), backgroundHex (hex color). No prose.";

const ALLOWED_KEYS = new Set([
  "primitiveType",
  "density",
  "scale",
  "rotationDegrees",
  "complexity",
  "positionJitter",
  "paletteHex",
  "backgroundHex",
]);

function sanitizeIntent(raw: unknown): PatternIntent | null {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return null;
  }
  const intent: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (ALLOWED_KEYS.has(key)) {
      intent[key] = value;
    }
  }
  return intent as PatternIntent;
}

export class OpenAICompatibleProvider implements AIProvider {
  readonly id = "openai-compatible";
  readonly label = "OpenAI-compatible (online)";
  readonly offlineCapable = false;
  private readonly options: OpenAICompatibleOptions;

  constructor(options: OpenAICompatibleOptions) {
    this.options = options;
  }

  async analyze(prompt: string): Promise<PatternIntent> {
    const endpoint = this.options.endpoint.trim();
    if (endpoint.length === 0 || this.options.model.trim().length === 0) {
      const error: AIError = {
        code: "AI_NOT_CONFIGURED",
        message: "Endpoint and model are required.",
      };
      throw error;
    }
    if (!/^https?:\/\//.test(endpoint)) {
      const error: AIError = {
        code: "AI_NOT_CONFIGURED",
        message: "Endpoint must be an http(s) URL.",
      };
      throw error;
    }
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      this.options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    );
    try {
      const headers: Record<string, string> = {
        "content-type": "application/json",
      };
      if (this.options.apiKey !== undefined && this.options.apiKey.length > 0) {
        headers.authorization = `Bearer ${this.options.apiKey}`;
      }
      const response = await fetch(
        `${endpoint.replace(/\/$/, "")}/chat/completions`,
        {
          body: JSON.stringify({
            messages: [
              { content: SYSTEM_PROMPT, role: "system" },
              { content: prompt, role: "user" },
            ],
            model: this.options.model,
            temperature: 0,
          }),
          headers,
          method: "POST",
          signal: controller.signal,
        },
      );
      if (!response.ok) {
        const error: AIError = {
          code: "AI_UNAVAILABLE",
          message: `Provider returned HTTP ${response.status}.`,
        };
        throw error;
      }
      const body: unknown = await response.json();
      const text = extractContent(body);
      if (text === null) {
        const error: AIError = {
          code: "AI_INVALID_RESPONSE",
          message: "Provider response had no message content.",
        };
        throw error;
      }
      const intent = sanitizeIntent(parseJsonObject(text));
      if (intent === null) {
        const error: AIError = {
          code: "AI_INVALID_RESPONSE",
          message: "Provider did not return a JSON object.",
        };
        throw error;
      }
      return intent;
    } catch (error) {
      if (error !== null && typeof error === "object" && "code" in error) {
        throw error;
      }
      if (error instanceof DOMException && error.name === "AbortError") {
        const timeoutError: AIError = {
          code: "AI_TIMEOUT",
          message: "Provider request timed out.",
        };
        throw timeoutError;
      }
      const unavailable: AIError = {
        code: "AI_UNAVAILABLE",
        message: error instanceof Error ? error.message : "Network failed.",
      };
      throw unavailable;
    } finally {
      clearTimeout(timeout);
    }
  }
}

function extractContent(body: unknown): string | null {
  if (typeof body !== "object" || body === null) {
    return null;
  }
  const choices = (body as { choices?: unknown }).choices;
  if (!Array.isArray(choices) || choices.length === 0) {
    return null;
  }
  const message = (choices[0] as { message?: unknown }).message;
  if (typeof message !== "object" || message === null) {
    return null;
  }
  const content = (message as { content?: unknown }).content;
  return typeof content === "string" ? content : null;
}

function parseJsonObject(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  const candidate = (fenced?.[1] ?? text).trim();
  try {
    return JSON.parse(candidate) as unknown;
  } catch {
    return null;
  }
}
