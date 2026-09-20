import { err, ok } from "@patternforge/shared";
import type { RenderCancellationSignal } from "@patternforge/renderer-engine";
import type {
  GenerationResult,
  PatternPrimitive,
  RgbaColor,
} from "@patternforge/core";

import type { ExportResult } from "./types";
import { formatSvgNumber } from "./svg";

/**
 * Deterministic Shutterstock-ready EPS serializer.
 *
 * Emits a single-tile Encapsulated PostScript file using ONLY PostScript
 * Level 1 operators (`moveto`/`lineto`/`curveto`/`closepath`/`fill`,
 * `setrgbcolor`, `gsave`/`grestore`, `translate`/`rotate`/`scale`, `clip`),
 * which keeps the file compatible with Adobe Illustrator 8/10 as required
 * for Shutterstock vector submissions. No AI involved: the artwork is the
 * deterministic procedural pattern, serialized shape by shape.
 *
 * Shutterstock compliance is enforced BY CONSTRUCTION, not by convention:
 * - single tile (no 9-copy seamless duplication, no bloat, no overlaps);
 * - strokes are expanded to filled paths (no `stroke` operator at all);
 * - transparency is flattened to solid sRGB (no opacity operators exist);
 * - no text, no fonts, no raster images, no effects, no gradients;
 * - background rect covers the full tile, so the artwork bounding box
 *   always equals the declared `%%BoundingBox`.
 *
 * Coordinates use a top-left origin in 72dpi units (1 unit = 1px at 72dpi),
 * so W x H units read as W x H pixels for the 4-25MP artwork rule.
 * No timestamps are emitted (clock-free, byte-deterministic).
 */

/** Long-side presets (square tile): 4MP / 9MP / 16MP of artwork. */
export const STOCK_EPS_SIZES = [2000, 3000, 4000] as const;

export type StockEpsSize = (typeof STOCK_EPS_SIZES)[number];

export const DEFAULT_STOCK_EPS_SIZE: StockEpsSize = 3000;

/** Shutterstock artwork bounds: 4MP minimum, 25MP maximum. */
export const MIN_STOCK_MEGAPIXELS = 4;
export const MAX_STOCK_MEGAPIXELS = 25;

/** Shutterstock web upload ceiling for EPS files. */
export const MAX_STOCK_EPS_BYTES = 100_000_000;

export function isStockEpsSize(value: unknown): value is StockEpsSize {
  return value === 2000 || value === 3000 || value === 4000;
}

/** Circle/ellipse bezier handle ratio. */
const KAPPA = 0.5522847498;

function checkCancelled(signal: RenderCancellationSignal | undefined): boolean {
  return signal?.isCancelled() === true;
}

function sanitizeTitle(value: string): string {
  const cleaned = value.replace(/[^A-Za-z0-9._-]/g, "_").slice(0, 80);
  return cleaned.length > 0 ? cleaned : "patternforge-stock";
}

/** Flatten an RGBA color over an opaque RGB backdrop. */
function flattenOver(
  color: RgbaColor,
  backdrop: { b: number; g: number; r: number },
): { b: number; g: number; r: number } {
  const a = color.a / 255;
  return {
    b: Math.round(color.b * a + backdrop.b * (1 - a)),
    g: Math.round(color.g * a + backdrop.g * (1 - a)),
    r: Math.round(color.r * a + backdrop.r * (1 - a)),
  };
}

function rgbCommand(color: { b: number; g: number; r: number }): string {
  return (
    `${formatSvgNumber(color.r / 255)} ` +
    `${formatSvgNumber(color.g / 255)} ` +
    `${formatSvgNumber(color.b / 255)} setrgbcolor`
  );
}

function tileRectPath(width: number, height: number): string {
  const w = formatSvgNumber(width);
  const h = formatSvgNumber(height);
  return `newpath 0 0 moveto ${w} 0 lineto ${w} ${h} lineto 0 ${h} lineto closepath`;
}

function circlePath(radius: number): string {
  const r = formatSvgNumber(radius);
  const k = formatSvgNumber(radius * KAPPA);
  const nk = formatSvgNumber(-radius * KAPPA);
  const nr = formatSvgNumber(-radius);
  return (
    `newpath ${r} 0 moveto ` +
    `${r} ${k} ${k} ${r} 0 ${r} curveto ` +
    `${nk} ${r} ${nr} ${k} ${nr} 0 curveto ` +
    `${nr} ${nk} ${nk} ${nr} 0 ${nr} curveto ` +
    `${k} ${nr} ${r} ${nk} ${r} 0 curveto closepath`
  );
}

function ellipsePath(radiusX: number, radiusY: number): string {
  const rx = formatSvgNumber(radiusX);
  const ry = formatSvgNumber(radiusY);
  const kx = formatSvgNumber(radiusX * KAPPA);
  const ky = formatSvgNumber(radiusY * KAPPA);
  const nkx = formatSvgNumber(-radiusX * KAPPA);
  const nky = formatSvgNumber(-radiusY * KAPPA);
  const nrx = formatSvgNumber(-radiusX);
  const nry = formatSvgNumber(-radiusY);
  return (
    `newpath ${rx} 0 moveto ` +
    `${rx} ${ky} ${kx} ${ry} 0 ${ry} curveto ` +
    `${nkx} ${ry} ${nrx} ${ky} ${nrx} 0 curveto ` +
    `${nrx} ${nky} ${nkx} ${nry} 0 ${nry} curveto ` +
    `${kx} ${nry} ${rx} ${nky} ${rx} 0 curveto closepath`
  );
}

function rectPath(width: number, height: number): string {
  const x = formatSvgNumber(-width / 2);
  const y = formatSvgNumber(-height / 2);
  const w = formatSvgNumber(width);
  const h = formatSvgNumber(height);
  return `newpath ${x} ${y} moveto ${w} 0 rlineto 0 ${h} rlineto ${formatSvgNumber(-width)} 0 rlineto closepath`;
}

function polygonPath(points: readonly { x: number; y: number }[]): string {
  const [first, ...rest] = points;
  if (first === undefined) {
    return "";
  }
  let path = `newpath ${formatSvgNumber(first.x)} ${formatSvgNumber(first.y)} moveto`;
  for (const point of rest) {
    path += ` ${formatSvgNumber(point.x)} ${formatSvgNumber(point.y)} lineto`;
  }
  return `${path} closepath`;
}

/**
 * Expand a round-capped line (centered on the x-axis) to a filled path:
 * body rectangle plus two semicircular caps approximated with beziers.
 */
function linePath(length: number, thickness: number): string {
  const half = length / 2;
  const ht = thickness / 2;
  const k = ht * KAPPA;
  const x1 = formatSvgNumber(-half);
  const x2 = formatSvgNumber(half);
  const y1 = formatSvgNumber(-ht);
  const y2 = formatSvgNumber(ht);
  const x2k = formatSvgNumber(half + k);
  const x1k = formatSvgNumber(-half - k);
  return (
    `newpath ${x1} ${y1} moveto ${x2} ${y1} lineto ` +
    `${x2k} ${y1} ${x2k} ${y2} ${x2} ${y2} curveto ` +
    `${x1} ${y2} lineto ` +
    `${x1k} ${y2} ${x1k} ${y1} ${x1} ${y1} curveto closepath`
  );
}

function isPositive(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}

function shapePath(primitive: PatternPrimitive): string {
  switch (primitive.type) {
    case "circle":
      return isPositive(primitive.radius) ? circlePath(primitive.radius) : "";
    case "rectangle":
      return isPositive(primitive.width) && isPositive(primitive.height)
        ? rectPath(primitive.width, primitive.height)
        : "";
    case "ellipse":
      return isPositive(primitive.radiusX) && isPositive(primitive.radiusY)
        ? ellipsePath(primitive.radiusX, primitive.radiusY)
        : "";
    case "line": {
      const thickness =
        "thickness" in primitive &&
        typeof (primitive as { thickness?: unknown }).thickness === "number"
          ? ((primitive as { thickness?: number }).thickness ?? 1)
          : 1;
      return isPositive(primitive.length) && isPositive(thickness)
        ? linePath(primitive.length, thickness)
        : "";
    }
    case "polygon":
      return primitive.points.length >= 3 ? polygonPath(primitive.points) : "";
  }
}

export interface EpsSerializeOptions {
  readonly background: RgbaColor;
  readonly fallbackFill: RgbaColor;
  readonly targetHeight: number;
  readonly targetWidth: number;
}

export function serializeEps(
  pattern: GenerationResult,
  options: EpsSerializeOptions,
  signal?: RenderCancellationSignal,
): ExportResult<string> {
  const { width, height, primitives } = pattern;
  if (
    !Number.isSafeInteger(width) ||
    !Number.isSafeInteger(height) ||
    width <= 0 ||
    height <= 0
  ) {
    return err({
      code: "ENCODE_FAILED",
      message: "Pattern dimensions are invalid for EPS export.",
    });
  }
  const { targetWidth, targetHeight } = options;
  if (
    !Number.isSafeInteger(targetWidth) ||
    !Number.isSafeInteger(targetHeight) ||
    targetWidth <= 0 ||
    targetHeight <= 0
  ) {
    return err({
      code: "STOCK_SIZE_INVALID",
      message: "EPS target size must be positive integers.",
    });
  }
  const megapixels = (targetWidth * targetHeight) / 1_000_000;
  if (megapixels < MIN_STOCK_MEGAPIXELS || megapixels > MAX_STOCK_MEGAPIXELS) {
    return err({
      code: "STOCK_SIZE_INVALID",
      details: {
        megapixels: Math.round(megapixels * 100) / 100,
        max: MAX_STOCK_MEGAPIXELS,
        min: MIN_STOCK_MEGAPIXELS,
      },
      message:
        `Shutterstock artwork must be ${MIN_STOCK_MEGAPIXELS}..${MAX_STOCK_MEGAPIXELS}MP; ` +
        `requested ${formatSvgNumber(Math.round(megapixels * 100) / 100)}MP.`,
    });
  }
  if (signal?.isCancelled() === true) {
    return err({ code: "CANCELLED", message: "EPS export cancelled." });
  }

  const sx = targetWidth / width;
  const sy = targetHeight / height;

  // Opaque sRGB backdrop: background flattened over white, then every
  // shape flattened over it. No transparency operator is ever emitted.
  const backdrop = flattenOver(options.background, { b: 255, g: 255, r: 255 });

  const title = sanitizeTitle(
    `patternforge-${String(pattern.effectiveSeed)}-${targetWidth}x${targetHeight}`,
  );
  const lines: string[] = [
    "%!PS-Adobe-3.0 EPSF-3.0",
    "%%Creator: PatternForge deterministic vector exporter (procedural, no AI)",
    `%%Title: ${title}`,
    `%%BoundingBox: 0 0 ${targetWidth} ${targetHeight}`,
    `%%HiResBoundingBox: 0 0 ${targetWidth}.000 ${targetHeight}.000`,
    "%%Pages: 1",
    "%%EndComments",
    `${rgbCommand(backdrop)}`,
    `${tileRectPath(targetWidth, targetHeight)} fill`,
    "gsave",
    `${tileRectPath(targetWidth, targetHeight)} clip`,
  ];

  let index = 0;
  for (const primitive of primitives) {
    if (index % 64 === 0 && checkCancelled(signal)) {
      return err({ code: "CANCELLED", message: "EPS export cancelled." });
    }
    index += 1;
    const path = shapePath(primitive);
    if (path === "") {
      continue;
    }
    const color = primitive.color ?? options.fallbackFill;
    const alpha = (color.a / 255) * primitive.opacity;
    const flat = flattenOver({ ...color, a: 255 }, backdrop);
    const mixed = {
      b: Math.round(flat.b * alpha + backdrop.b * (1 - alpha)),
      g: Math.round(flat.g * alpha + backdrop.g * (1 - alpha)),
      r: Math.round(flat.r * alpha + backdrop.r * (1 - alpha)),
    };
    lines.push("gsave");
    lines.push(
      `${formatSvgNumber(primitive.x * sx)} ${formatSvgNumber(primitive.y * sy)} translate`,
    );
    lines.push(
      `${formatSvgNumber((primitive.rotation * 180) / Math.PI)} rotate`,
    );
    lines.push(
      `${formatSvgNumber(primitive.scale * sx)} ${formatSvgNumber(primitive.scale * sy)} scale`,
    );
    lines.push(rgbCommand(mixed));
    lines.push(path);
    lines.push("fill");
    lines.push("grestore");
  }
  lines.push("grestore");
  lines.push("showpage");
  lines.push("%%EOF");
  return ok(`${lines.join("\n")}\n`);
}
