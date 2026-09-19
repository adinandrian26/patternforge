export interface NeighborTranslation {
  readonly dx: -1 | 0 | 1;
  readonly dy: -1 | 0 | 1;
  readonly offsetX: number;
  readonly offsetY: number;
}

function assertValidCanvasSize(value: number, axis: "height" | "width"): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError(`${axis} must be a finite number greater than zero.`);
  }
}

export function wrapCoordinate(value: number, size: number): number {
  if (!Number.isFinite(value)) {
    throw new RangeError("value must be finite.");
  }

  assertValidCanvasSize(size, "width");

  const wrapped = ((value % size) + size) % size;
  return wrapped === 0 ? 0 : wrapped;
}

export function getNeighborTranslations(
  canvasWidth: number,
  canvasHeight: number,
): readonly NeighborTranslation[] {
  assertValidCanvasSize(canvasWidth, "width");
  assertValidCanvasSize(canvasHeight, "height");

  const translations: NeighborTranslation[] = [];

  for (const dy of [-1, 0, 1] as const) {
    for (const dx of [-1, 0, 1] as const) {
      translations.push({
        dx,
        dy,
        offsetX: dx * canvasWidth,
        offsetY: dy * canvasHeight,
      });
    }
  }

  return translations;
}

export const TILE_ENGINE_PACKAGE_NAME = "@patternforge/tile-engine" as const;
