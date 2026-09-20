import type { AIProvider, PatternIntent } from "./types";

/**
 * Deterministic offline mock provider. Maps prompt keywords to a
 * structured intent with fixed rules — same prompt always yields the
 * same intent, no network, no credentials, no randomness.
 */
export class MockAIProvider implements AIProvider {
  readonly id = "mock";
  readonly label = "Mock (offline)";
  readonly offlineCapable = true;

  analyze(prompt: string): Promise<PatternIntent> {
    return Promise.resolve(interpretPrompt(prompt));
  }
}

const COLOR_WORDS: ReadonlyArray<readonly [string, string]> = [
  ["navy", "#142850"],
  ["dark blue", "#142850"],
  ["blue", "#2566b2"],
  ["sky", "#87b4e6"],
  ["red", "#d32020"],
  ["crimson", "#c81e3c"],
  ["coral", "#f0826e"],
  ["sunset", "#e67850"],
  ["orange", "#e67850"],
  ["yellow", "#e8c73c"],
  ["green", "#3c8c3c"],
  ["forest", "#3c5a23"],
  ["teal", "#1e8282"],
  ["purple", "#782878"],
  ["plum", "#784678"],
  ["pink", "#dc5a82"],
  ["white", "#ffffff"],
  ["paper", "#f5f0eb"],
  ["black", "#000000"],
  ["ink", "#282828"],
  ["dark", "#1e1e28"],
  ["gray", "#808080"],
  ["grey", "#808080"],
  ["sand", "#f5e6c8"],
];

const BACKGROUND_WORDS: ReadonlyArray<readonly [string, string]> = [
  ["dark background", "#1e1e28"],
  ["black background", "#000000"],
  ["white background", "#ffffff"],
  ["paper background", "#f5f0eb"],
  ["navy background", "#142850"],
];

function escapeRegExp(word: string): string {
  return word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Whole-word (or whole-phrase) match, plural-tolerant, so "thin" never fires on "thing". */
function hasWord(text: string, word: string): boolean {
  return new RegExp(`\\b${escapeRegExp(word)}s?\\b`).test(text);
}

export function interpretPrompt(prompt: string): PatternIntent {
  const text = prompt.toLowerCase();
  const intent: Record<string, number | string | readonly string[]> = {};

  if (hasWord(text, "circle") || hasWord(text, "dot")) {
    intent.primitiveType = "circle";
  } else if (hasWord(text, "rectangle") || hasWord(text, "square")) {
    intent.primitiveType = "rectangle";
  } else if (hasWord(text, "ellipse") || hasWord(text, "oval")) {
    intent.primitiveType = "ellipse";
  } else if (hasWord(text, "line") || hasWord(text, "stripe")) {
    intent.primitiveType = "line";
  } else if (
    hasWord(text, "polygon") ||
    hasWord(text, "triangle") ||
    hasWord(text, "hexagon")
  ) {
    intent.primitiveType = "polygon";
  } else if (hasWord(text, "star")) {
    intent.primitiveType = "star";
  } else if (hasWord(text, "ring") || hasWord(text, "donut")) {
    intent.primitiveType = "ring";
  } else if (hasWord(text, "flower") || hasWord(text, "bloom")) {
    intent.primitiveType = "flower";
  } else if (hasWord(text, "wave") || hasWord(text, "zebra")) {
    intent.primitiveType = "wave";
  } else if (hasWord(text, "leaf") || hasWord(text, "leaves")) {
    intent.primitiveType = "leaf";
  } else if (
    hasWord(text, "sprig") ||
    hasWord(text, "botanical") ||
    hasWord(text, "floral")
  ) {
    intent.primitiveType = "sprig";
  }

  if (
    hasWord(text, "dense") ||
    hasWord(text, "busy") ||
    hasWord(text, "crowded")
  ) {
    intent.density = 14;
  } else if (
    hasWord(text, "sparse") ||
    hasWord(text, "minimal") ||
    hasWord(text, "airy")
  ) {
    intent.density = 3;
  }

  if (hasWord(text, "large") || hasWord(text, "big") || hasWord(text, "bold")) {
    intent.scale = 0.8;
  } else if (
    hasWord(text, "small") ||
    hasWord(text, "tiny") ||
    hasWord(text, "thin") ||
    hasWord(text, "fine")
  ) {
    intent.scale = 0.3;
  }

  if (hasWord(text, "no rotation") || hasWord(text, "aligned")) {
    intent.rotationDegrees = 0;
  } else if (hasWord(text, "full rotation") || hasWord(text, "chaotic")) {
    intent.rotationDegrees = 360;
  }

  if (hasWord(text, "simple")) {
    intent.complexity = 2;
  } else if (hasWord(text, "complex") || hasWord(text, "intricate")) {
    intent.complexity = 7;
  }

  const palette: string[] = [];
  for (const [word, hex] of COLOR_WORDS) {
    if (hasWord(text, word) && !palette.includes(hex)) {
      palette.push(hex);
    }
  }
  if (palette.length > 0) {
    intent.paletteHex = palette.slice(0, 8);
  }

  for (const [phrase, hex] of BACKGROUND_WORDS) {
    if (hasWord(text, phrase)) {
      intent.backgroundHex = hex;
      break;
    }
  }

  return intent as PatternIntent;
}
