import {
  DEFAULT_GENERATION_CONFIG,
  degreesToRadians,
  hexToColor,
  validateGenerationConfig,
  type GenerationConfig,
  type GenerationConfigError,
  type RgbaColor,
} from "@patternforge/core";
import { err, ok, type Result } from "@patternforge/shared";

/**
 * Testable UI -> domain adapter (Phase 4).
 * Pure module: no Preact, no DOM, no randomness. Converts raw form values
 * (degrees for rotation, hex strings for colors, preset ids for palettes)
 * into a validated `GenerationConfig`. All heavy work stays behind the
 * explicit Generate button in `App.tsx`; nothing here allocates pixels.
 */

export interface PalettePreset {
  readonly colors: readonly RgbaColor[];
  readonly id: string;
  readonly name: string;
}

const BLACK: RgbaColor = { a: 255, b: 0, g: 0, r: 0 };
const RED: RgbaColor = { a: 255, b: 32, g: 32, r: 211 };
const BLUE: RgbaColor = { a: 255, b: 178, g: 102, r: 37 };
const YELLOW: RgbaColor = { a: 255, b: 60, g: 199, r: 232 };
const SUNSET_ORANGE: RgbaColor = { a: 255, b: 80, g: 120, r: 230 };
const SUNSET_PINK: RgbaColor = { a: 255, b: 130, g: 90, r: 220 };
const SUNSET_PURPLE: RgbaColor = { a: 255, b: 140, g: 70, r: 120 };
const FOREST_DARK: RgbaColor = { a: 255, b: 60, g: 90, r: 35 };
const FOREST_MID: RgbaColor = { a: 255, b: 110, g: 140, r: 60 };
const FOREST_LIGHT: RgbaColor = { a: 255, b: 150, g: 190, r: 150 };
const LEAF_GREEN: RgbaColor = { a: 255, b: 110, g: 150, r: 70 };
const CREAM: RgbaColor = { a: 255, b: 235, g: 245, r: 255 };
const BERRY_RED: RgbaColor = { a: 255, b: 60, g: 50, r: 200 };
const GOLD: RgbaColor = { a: 255, b: 120, g: 190, r: 220 };

export const CUSTOM_PALETTE_ID = "custom";

export const PALETTE_PRESETS: readonly PalettePreset[] = [
  { colors: [BLACK], id: "mono", name: "Mono" },
  {
    colors: [RED, BLUE, YELLOW],
    id: "primary",
    name: "Primary",
  },
  {
    colors: [SUNSET_ORANGE, SUNSET_PINK, SUNSET_PURPLE],
    id: "sunset",
    name: "Sunset",
  },
  {
    colors: [FOREST_DARK, FOREST_MID, FOREST_LIGHT],
    id: "forest",
    name: "Forest",
  },
  {
    colors: [LEAF_GREEN, FOREST_MID, BERRY_RED],
    id: "botanical",
    name: "Botanical",
  },
  {
    colors: [GOLD, CREAM],
    id: "navy-gold",
    name: "Navy Gold",
  },
  {
    colors: [BERRY_RED, FOREST_MID, CREAM],
    id: "berry",
    name: "Berry",
  },
];

/** Raw form values as held by the UI controls. */
export interface UiFormState {
  readonly arrangement: string;
  readonly backgroundHex: string;
  readonly colorOrder: string;
  readonly complexity: number;
  readonly customPaletteHex: string;
  readonly density: number;
  readonly height: number;
  readonly lineThickness: number;
  readonly opacityMax: number;
  readonly opacityMin: number;
  readonly paletteId: string;
  readonly positionJitter: number;
  readonly primitiveType: string;
  readonly rotationBaseDegrees: number;
  readonly rotationDegrees: number;
  readonly scale: number;
  readonly seed: string;
  readonly width: number;
}

export const DEFAULT_UI_FORM: UiFormState = {
  arrangement: "scatter",
  backgroundHex: "#ffffff",
  colorOrder: "random",
  complexity: DEFAULT_GENERATION_CONFIG.complexity,
  customPaletteHex: "#000000",
  density: DEFAULT_GENERATION_CONFIG.density,
  height: DEFAULT_GENERATION_CONFIG.height,
  lineThickness: DEFAULT_GENERATION_CONFIG.lineThickness,
  opacityMax: DEFAULT_GENERATION_CONFIG.opacityMax,
  opacityMin: DEFAULT_GENERATION_CONFIG.opacityMin,
  paletteId: "mono",
  positionJitter: DEFAULT_GENERATION_CONFIG.positionJitter,
  primitiveType: DEFAULT_GENERATION_CONFIG.primitiveType,
  rotationBaseDegrees: 0,
  rotationDegrees: 180,
  scale: DEFAULT_GENERATION_CONFIG.scale,
  seed: "12345",
  width: DEFAULT_GENERATION_CONFIG.width,
};

function configError(message: string): Result<never, GenerationConfigError> {
  return err({
    code: "INVALID_PALETTE",
    field: "palette",
    message,
    value: null,
  });
}

/**
 * Resolve a palette preset id (or custom hex list) to validated colors.
 * Custom input accepts comma/space/newline separated hex colors.
 */
export function resolvePaletteColors(
  paletteId: string,
  customPaletteHex: string,
): Result<readonly RgbaColor[], GenerationConfigError> {
  if (paletteId === CUSTOM_PALETTE_ID) {
    const parts = customPaletteHex
      .split(/[\s,;]+/)
      .map((part) => part.trim())
      .filter((part) => part.length > 0);
    if (parts.length === 0) {
      return configError("Custom palette must hold at least one hex color.");
    }
    const colors: RgbaColor[] = [];
    for (const part of parts) {
      const parsed = hexToColor(part);
      if (!parsed.ok) {
        return err({
          code: "INVALID_PALETTE",
          field: "palette",
          message: `Invalid custom palette entry "${part}".`,
          value: part,
        });
      }
      colors.push(parsed.value);
    }
    return ok(colors);
  }
  const preset = PALETTE_PRESETS.find((entry) => entry.id === paletteId);
  if (preset === undefined) {
    return err({
      code: "INVALID_PALETTE",
      field: "palette",
      message: `Unknown palette "${paletteId}".`,
      value: paletteId,
    });
  }
  return ok(preset.colors);
}

/**
 * Normalize raw UI form state into a validated `GenerationConfig`.
 * Handles degrees -> radians conversion and hex -> RGBA parsing.
 * Returns the first typed error without rendering anything.
 */
export function normalizeUiForm(
  form: UiFormState,
): Result<GenerationConfig, GenerationConfigError> {
  if (
    !Number.isFinite(form.rotationDegrees) ||
    form.rotationDegrees < 0 ||
    form.rotationDegrees > 360
  ) {
    return err({
      code: "INVALID_ROTATION",
      field: "rotationRange",
      message: "Rotation must be finite and in the range [0, 360] degrees.",
      value: form.rotationDegrees,
    });
  }
  if (
    !Number.isFinite(form.rotationBaseDegrees) ||
    form.rotationBaseDegrees < 0 ||
    form.rotationBaseDegrees > 360
  ) {
    return err({
      code: "INVALID_ROTATION_BASE",
      field: "rotationBase",
      message:
        "Rotation base must be finite and in the range [0, 360] degrees.",
      value: form.rotationBaseDegrees,
    });
  }
  const background = hexToColor(form.backgroundHex);
  if (!background.ok) {
    return err({
      code: "INVALID_BACKGROUND",
      field: "backgroundColor",
      message: `Invalid background hex "${form.backgroundHex}".`,
      value: form.backgroundHex,
    });
  }
  const paletteColors = resolvePaletteColors(
    form.paletteId,
    form.customPaletteHex,
  );
  if (!paletteColors.ok) {
    return paletteColors;
  }
  return validateGenerationConfig({
    arrangement: form.arrangement,
    backgroundColor: background.value,
    colorOrder: form.colorOrder,
    complexity: form.complexity,
    density: form.density,
    height: form.height,
    lineThickness: form.lineThickness,
    opacityMax: form.opacityMax,
    opacityMin: form.opacityMin,
    palette: { colors: paletteColors.value },
    positionJitter: form.positionJitter,
    primitiveType: form.primitiveType,
    rotationBase: degreesToRadians(form.rotationBaseDegrees),
    rotationRange: degreesToRadians(form.rotationDegrees),
    scale: form.scale,
    seed: form.seed,
    width: form.width,
  });
}

/**
 * Split a validated config into generator input and render settings.
 * Keeps GenerationConfig (what), Pattern (data), and RenderSettings
 * (how to rasterize) as separate values through the pipeline.
 */
export function generationConfigToRenderBackground(
  config: GenerationConfig,
): RgbaColor {
  return config.backgroundColor;
}

/** User-friendly single-line message for a config error. */
export function formatConfigError(error: GenerationConfigError): string {
  return `${error.field}: ${error.message}`;
}
