export type { AIError, AIErrorCode, AIProvider, PatternIntent } from "./types";
export { intentToGenerationConfig } from "./intent";
export { interpretPrompt, MockAIProvider } from "./mock";
export {
  OpenAICompatibleProvider,
  type OpenAICompatibleOptions,
} from "./openai";

export const AI_PROVIDER_PACKAGE_NAME = "@patternforge/ai-provider" as const;
