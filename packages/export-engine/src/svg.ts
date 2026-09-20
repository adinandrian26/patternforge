import { err, ok } from "@patternforge/shared";
import type { RenderCancellationSignal } from "@patternforge/renderer-engine";
import {
  colorToHex,
  starVertices,
  waveBandPoints,
  type GenerationResult,
  type PatternPrimitive,
  type RgbaColor,
} from "@patternforge/core";

import type { ExportResult } from "./types";

/**
 * Deterministic SVG serializer. Emits real vector shapes (no raster
 * embedding) for all five primitive types with transforms, colors,
 * opacity, background, and 9 seamless translated copies clipped to the
 * tile rect.
 *
 * Safety: output contains no <script>, no event handlers, no external
 * URLs or resources — only an internal `#pf-tile-clip` fragment for the
 * clip path, generated element ids, locale-free numbers, and hex colors
 * derived from validated RGBA. No user-controlled strings enter the XML.
 */

const CLIP_ID = "pf-tile-clip";

/** Locale-free number formatting: up to 3 decimals, no trailing zeros. */
export function formatSvgNumber(value: number): string {
  if (!Number.isFinite(value)) {
    return "0";
  }
  const rounded = Math.round(value * 1000) / 1000;
  if (rounded === 0) {
    return "0";
  }
  return String(rounded);
}

function escapeAttr(value: string): string {
  // CLIP_ID is an internal constant; this guard documents that no
  // user-controlled string may flow into attribute positions.
  if (!/^[A-Za-z0-9_-]+$/.test(value)) {
    return "pf-tile-clip";
  }
  return value;
}

/** Circle as an SVG path (for even-odd ring holes). */
function circleSubpath(radius: number): string {
  const kappa = 0.5522847498;
  const r = formatSvgNumber(radius);
  const k = formatSvgNumber(radius * kappa);
  const nk = formatSvgNumber(-radius * kappa);
  const nr = formatSvgNumber(-radius);
  return (
    `M${r},0 C${r},${k} ${k},${r} 0,${r} ` +
    `C${nk},${r} ${nr},${k} ${nr},0 ` +
    `C${nr},${nk} ${nk},${nr} 0,${nr} ` +
    `C${k},${nr} ${r},${nk} ${r},0 Z`
  );
}

function fillFor(
  primitive: PatternPrimitive,
  fallback: RgbaColor,
): { fill: string; fillOpacity: string } {
  const color = primitive.color ?? fallback;
  return {
    fill: colorToHex({ a: 255, b: color.b, g: color.g, r: color.r }),
    fillOpacity: formatSvgNumber((color.a / 255) * primitive.opacity),
  };
}

function shapeFor(primitive: PatternPrimitive, fallback: RgbaColor): string {
  const { fill, fillOpacity } = fillFor(primitive, fallback);
  const deg = formatSvgNumber((primitive.rotation * 180) / Math.PI);
  const scale = formatSvgNumber(primitive.scale);
  const gOpen =
    `<g transform="translate(${formatSvgNumber(primitive.x)} ` +
    `${formatSvgNumber(primitive.y)}) rotate(${deg}) scale(${scale})">`;
  const paint = ` fill="${fill}" fill-opacity="${fillOpacity}"`;
  switch (primitive.type) {
    case "circle":
      return (
        `${gOpen}<circle cx="0" cy="0" ` +
        `r="${formatSvgNumber(primitive.radius)}"${paint}/></g>`
      );
    case "rectangle": {
      const x = formatSvgNumber(-primitive.width / 2);
      const y = formatSvgNumber(-primitive.height / 2);
      return (
        `${gOpen}<rect x="${x}" y="${y}" ` +
        `width="${formatSvgNumber(primitive.width)}" ` +
        `height="${formatSvgNumber(primitive.height)}"${paint}/></g>`
      );
    }
    case "ellipse":
      return (
        `${gOpen}<ellipse cx="0" cy="0" ` +
        `rx="${formatSvgNumber(primitive.radiusX)}" ` +
        `ry="${formatSvgNumber(primitive.radiusY)}"${paint}/></g>`
      );
    case "line": {
      const half = formatSvgNumber(primitive.length / 2);
      const thickness =
        "thickness" in primitive &&
        typeof (primitive as { thickness?: unknown }).thickness === "number"
          ? formatSvgNumber(
              (primitive as { thickness?: number }).thickness ?? 1,
            )
          : "1";
      return (
        `${gOpen}<line x1="-${half}" y1="0" x2="${half}" y2="0" ` +
        `stroke="${fill}" stroke-opacity="${fillOpacity}" ` +
        `stroke-width="${thickness}" stroke-linecap="round"/></g>`
      );
    }
    case "polygon": {
      const points = primitive.points
        .map((p) => `${formatSvgNumber(p.x)},${formatSvgNumber(p.y)}`)
        .join(" ");
      return `${gOpen}<polygon points="${points}"${paint}/></g>`;
    }
    case "star": {
      const points = starVertices(
        primitive.spikes,
        primitive.radius,
        primitive.innerRadius,
      )
        .map((p) => `${formatSvgNumber(p.x)},${formatSvgNumber(p.y)}`)
        .join(" ");
      return `${gOpen}<polygon points="${points}"${paint}/></g>`;
    }
    case "ring": {
      const thickness =
        "thickness" in primitive &&
        typeof (primitive as { thickness?: unknown }).thickness === "number"
          ? ((primitive as { thickness?: number }).thickness ?? 1)
          : 1;
      const inner = primitive.radius - thickness;
      if (!(inner > 0)) {
        return (
          `${gOpen}<circle cx="0" cy="0" ` +
          `r="${formatSvgNumber(primitive.radius)}"${paint}/></g>`
        );
      }
      return (
        `${gOpen}<path d="${circleSubpath(primitive.radius)} ` +
        `${circleSubpath(inner)}" fill-rule="evenodd"${paint}/></g>`
      );
    }
    case "flower": {
      const dist = primitive.centerRadius * 0.5 + primitive.petalLength / 2;
      const rx = formatSvgNumber(primitive.petalLength / 2);
      const ry = formatSvgNumber(primitive.petalWidth / 2);
      const d = formatSvgNumber(dist);
      let inner = "";
      for (let k = 0; k < primitive.petals; k += 1) {
        const deg = formatSvgNumber((k * 360) / primitive.petals);
        inner +=
          `<g transform="rotate(${deg})">` +
          `<ellipse cx="${d}" cy="0" rx="${rx}" ry="${ry}"${paint}/></g>`;
      }
      inner +=
        `<circle cx="0" cy="0" ` +
        `r="${formatSvgNumber(primitive.centerRadius)}"${paint}/>`;
      return `${gOpen}${inner}</g>`;
    }
    case "wave": {
      const thickness =
        "thickness" in primitive &&
        typeof (primitive as { thickness?: unknown }).thickness === "number"
          ? ((primitive as { thickness?: number }).thickness ?? 1)
          : 1;
      const points = waveBandPoints(
        primitive.length,
        primitive.amplitude,
        primitive.wavelength,
        thickness,
      )
        .map((p) => `${formatSvgNumber(p.x)},${formatSvgNumber(p.y)}`)
        .join(" ");
      return `${gOpen}<polygon points="${points}"${paint}/></g>`;
    }
  }
}

export interface SvgSerializeOptions {
  readonly background: RgbaColor;
  readonly fallbackFill: RgbaColor;
}

export function serializeSvg(
  pattern: GenerationResult,
  options: SvgSerializeOptions,
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
      message: "Pattern dimensions are invalid for SVG export.",
    });
  }
  if (signal?.isCancelled() === true) {
    return err({ code: "CANCELLED", message: "SVG export cancelled." });
  }

  const bg = options.background;
  const parts: string[] = [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img">`,
    `<defs><clipPath id="${CLIP_ID}"><rect x="0" y="0" width="${width}" height="${height}"/></clipPath></defs>`,
    `<rect x="0" y="0" width="${width}" height="${height}" fill="${colorToHex({ a: 255, b: bg.b, g: bg.g, r: bg.r })}" fill-opacity="${formatSvgNumber(bg.a / 255)}"/>`,
    `<g clip-path="url(#${escapeAttr(CLIP_ID)})">`,
  ];

  const offsets = [-1, 0, 1];
  for (const dy of offsets) {
    for (const dx of offsets) {
      parts.push(`<g transform="translate(${dx * width} ${dy * height})">`);
      for (const primitive of primitives) {
        parts.push(shapeFor(primitive, options.fallbackFill));
      }
      parts.push(`</g>`);
    }
  }
  parts.push(`</g>`, `</svg>`);
  return ok(parts.join(""));
}
