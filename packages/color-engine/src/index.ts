import type { ColorPalette } from "@patternforge/core";

export interface ColorEngineFoundation {
  readonly implemented: false;
  readonly palette?: ColorPalette;
}

export const COLOR_ENGINE_PACKAGE_NAME = "@patternforge/color-engine" as const;
