import type { CancellationSignal, Result } from "@patternforge/shared";

/**
 * RGBA color with integer channels in the range 0..255.
 *
 * - `r`, `g`, `b`: color channels, 0..255.
 * - `a`: alpha channel, 0 (fully transparent) .. 255 (fully opaque).
 */
export interface RgbaColor {
  readonly a: number;
  readonly b: number;
  readonly g: number;
  readonly r: number;
}

/**
 * In-memory raster image.
 *
 * Representation contract (documented for Phase 3):
 * - `width`, `height`: positive integers (pixels).
 * - `data`: `Uint8Array` with `width * height * 4` bytes.
 * - Channel order: R, G, B, A (RGBA).
 * - Alpha range: 0..255 (0 transparent, 255 opaque).
 * - Coordinate system: 2D Cartesian with origin at top-left (0, 0),
 *   x increasing to the right, y increasing downward.
 * - Pixel origin: pixel (x, y) covers `[x, x+1) x [y, y+1)`.
 *   Coverage sampling uses the pixel center at `(x + 0.5, y + 0.5)`.
 * - Row stride: `width * 4` bytes, row-major, no padding.
 * - No floating-point pixel buffer is used.
 */
export interface RasterImage {
  readonly data: Uint8Array;
  readonly height: number;
  readonly width: number;
}

/**
 * Render settings for seamless tile rendering.
 *
 * - `background`: solid background color (deterministic).
 * - `foreground`: fallback fill color for primitives without their own
 *   `color`. Phase 4 generators assign deterministic per-primitive colors
 *   from the palette; colorless primitives keep Phase 3 behavior.
 */
export interface RenderSettings {
  readonly background: RgbaColor;
  readonly foreground: RgbaColor;
}

export type RenderErrorCode =
  | "INVALID_DIMENSIONS"
  | "INVALID_COLOR"
  | "INVALID_PRIMITIVE"
  | "RENDER_LIMIT_EXCEEDED"
  | "CANCELLED";

export interface RenderError {
  readonly code: RenderErrorCode;
  readonly message: string;
  readonly details?:
    | Readonly<Record<string, boolean | number | string | null>>
    | null
    | undefined;
}

export type RenderResult<T> = Result<T, RenderError>;

export type RenderCancellationSignal = CancellationSignal;

/** Memory and preview limits (documented, enforced before allocation). */
export const RENDER_MAX_DIMENSION = 2048;
export const RENDER_MAX_PIXELS = 4_194_304;
export const RENDER_MAX_BYTES = 16_777_216;
export const PREVIEW_TILE_SIZE = 256;
export const PREVIEW_GRID_COLUMNS = 3;
export const PREVIEW_GRID_ROWS = 3;
export const PREVIEW_MAX_DIMENSION = 768;
