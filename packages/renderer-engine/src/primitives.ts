import { err, ok } from "@patternforge/shared";
import {
  isRgbaColor,
  MAX_LINE_THICKNESS,
  MIN_LINE_THICKNESS,
  type PatternPrimitive,
} from "@patternforge/core";

import { blendOver, isValidOpacity } from "./color";
import { pixelOffset } from "./raster";
import {
  RENDER_MAX_DIMENSION,
  type RasterImage,
  type RenderCancellationSignal,
  type RenderError,
  type RenderResult,
  type RgbaColor,
} from "./types";

const MAX_GEOMETRY_EXTENT = RENDER_MAX_DIMENSION * 2;
const MAX_POLYGON_POINTS = 64;
const DEFAULT_LINE_THICKNESS = 1;

function invalidPrimitive(
  message: string,
  details?: Readonly<Record<string, boolean | number | string | null>>,
): RenderError {
  return {
    code: "INVALID_PRIMITIVE",
    details: details ?? null,
    message,
  };
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isPositiveFinite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

/** Validate a primitive's transform and geometry (bounded, finite). */
export function validatePrimitive(
  primitive: PatternPrimitive,
): RenderResult<PatternPrimitive> {
  if (!isFiniteNumber(primitive.x) || !isFiniteNumber(primitive.y)) {
    return err(invalidPrimitive("Primitive x/y must be finite numbers."));
  }
  if (!isFiniteNumber(primitive.rotation)) {
    return err(invalidPrimitive("Primitive rotation must be finite."));
  }
  if (
    !isFiniteNumber(primitive.scale) ||
    primitive.scale <= 0 ||
    primitive.scale > 1
  ) {
    return err(
      invalidPrimitive(
        "Primitive scale must be finite and in the range (0, 1].",
      ),
    );
  }
  if (!isValidOpacity(primitive.opacity)) {
    return err(invalidPrimitive("Primitive opacity must be finite in [0, 1]."));
  }
  if (primitive.color !== undefined && !isRgbaColor(primitive.color)) {
    return err(
      invalidPrimitive("Primitive color must have r/g/b/a integers in 0..255."),
    );
  }

  switch (primitive.type) {
    case "circle": {
      if (
        !isPositiveFinite(primitive.radius) ||
        primitive.radius > MAX_GEOMETRY_EXTENT
      ) {
        return err(
          invalidPrimitive(
            "Circle radius must be finite, positive, and bounded.",
          ),
        );
      }
      return ok(primitive);
    }
    case "rectangle": {
      if (
        !isPositiveFinite(primitive.width) ||
        !isPositiveFinite(primitive.height) ||
        primitive.width > MAX_GEOMETRY_EXTENT ||
        primitive.height > MAX_GEOMETRY_EXTENT
      ) {
        return err(
          invalidPrimitive(
            "Rectangle width/height must be finite, positive, and bounded.",
          ),
        );
      }
      return ok(primitive);
    }
    case "ellipse": {
      if (
        !isPositiveFinite(primitive.radiusX) ||
        !isPositiveFinite(primitive.radiusY) ||
        primitive.radiusX > MAX_GEOMETRY_EXTENT ||
        primitive.radiusY > MAX_GEOMETRY_EXTENT
      ) {
        return err(
          invalidPrimitive(
            "Ellipse radii must be finite, positive, and bounded.",
          ),
        );
      }
      return ok(primitive);
    }
    case "line": {
      if (
        !isPositiveFinite(primitive.length) ||
        primitive.length > MAX_GEOMETRY_EXTENT * 2
      ) {
        return err(
          invalidPrimitive(
            "Line length must be finite, positive, and bounded.",
          ),
        );
      }
      if (
        primitive.thickness !== undefined &&
        (!isFiniteNumber(primitive.thickness) ||
          primitive.thickness < MIN_LINE_THICKNESS ||
          primitive.thickness > MAX_LINE_THICKNESS)
      ) {
        return err(
          invalidPrimitive(
            `Line thickness must be finite in ${MIN_LINE_THICKNESS}..${MAX_LINE_THICKNESS}.`,
          ),
        );
      }
      return ok(primitive);
    }
    case "polygon": {
      const points = primitive.points;
      if (
        !Array.isArray(points) ||
        points.length < 3 ||
        points.length > MAX_POLYGON_POINTS
      ) {
        return err(
          invalidPrimitive(
            `Polygon must have 3..${MAX_POLYGON_POINTS} points.`,
          ),
        );
      }
      for (const point of points) {
        if (
          !isFiniteNumber(point.x) ||
          !isFiniteNumber(point.y) ||
          Math.abs(point.x) > MAX_GEOMETRY_EXTENT ||
          Math.abs(point.y) > MAX_GEOMETRY_EXTENT
        ) {
          return err(
            invalidPrimitive("Polygon points must be finite and bounded."),
          );
        }
      }
      return ok(primitive);
    }
    default: {
      return err(invalidPrimitive("Unknown primitive type."));
    }
  }
}

interface LocalFrame {
  readonly cos: number;
  readonly sin: number;
}

/** Convert world delta to local (unrotated) coordinates. */
function toLocal(
  dx: number,
  dy: number,
  frame: LocalFrame,
): { x: number; y: number } {
  return {
    x: dx * frame.cos + dy * frame.sin,
    y: -dx * frame.sin + dy * frame.cos,
  };
}

function pointInPolygon(
  px: number,
  py: number,
  vertices: readonly { x: number; y: number }[],
): boolean {
  let inside = false;
  for (let i = 0, j = vertices.length - 1; i < vertices.length; j = i, i += 1) {
    const xi = vertices[i]?.x ?? 0;
    const yi = vertices[i]?.y ?? 0;
    const xj = vertices[j]?.x ?? 0;
    const yj = vertices[j]?.y ?? 0;
    const crosses = yi > py !== yj > py;
    if (crosses) {
      const intersectX = ((xj - xi) * (py - yi)) / (yj - yi) + xi;
      if (px < intersectX) {
        inside = !inside;
      }
    }
  }
  return inside;
}

function distanceToSegmentSquared(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): number {
  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) {
    const ex = px - ax;
    const ey = py - ay;
    return ex * ex + ey * ey;
  }
  let t = ((px - ax) * dx + (py - ay) * dy) / lenSq;
  if (t < 0) {
    t = 0;
  } else if (t > 1) {
    t = 1;
  }
  const cx = ax + t * dx;
  const cy = ay + t * dy;
  const ex = px - cx;
  const ey = py - cy;
  return ex * ex + ey * ey;
}

interface Aabb {
  readonly x0: number;
  readonly x1: number;
  readonly y0: number;
  readonly y1: number;
}

function clampAabb(
  minX: number,
  maxX: number,
  minY: number,
  maxY: number,
  imageWidth: number,
  imageHeight: number,
): Aabb | null {
  const x0 = Math.max(0, Math.floor(minX));
  const x1 = Math.min(imageWidth - 1, Math.ceil(maxX));
  const y0 = Math.max(0, Math.floor(minY));
  const y1 = Math.min(imageHeight - 1, Math.ceil(maxY));
  if (x1 < x0 || y1 < y0) {
    return null;
  }
  return { x0, x1, y0, y1 };
}

function blendPixelAt(
  image: RasterImage,
  x: number,
  y: number,
  foreground: RgbaColor,
  opacity: number,
): void {
  const offset = pixelOffset(image, x, y);
  const dst: RgbaColor = {
    a: image.data[offset + 3] ?? 255,
    b: image.data[offset + 2] ?? 0,
    g: image.data[offset + 1] ?? 0,
    r: image.data[offset] ?? 0,
  };
  const out = blendOver(dst, foreground, opacity);
  image.data[offset] = out.r;
  image.data[offset + 1] = out.g;
  image.data[offset + 2] = out.b;
  image.data[offset + 3] = out.a;
}

export interface RasterizeOutcome {
  readonly cancelled: boolean;
}

/**
 * Rasterize a single copy of a primitive centered at (centerX, centerY).
 * The caller is responsible for wrapping/translated copies and clipping.
 * Coverage uses pixel centers, binary (no anti-aliasing), deterministic.
 * Checks `signal` cooperatively once per row.
 */
export function rasterizeSingleCopy(
  image: RasterImage,
  primitive: PatternPrimitive,
  foreground: RgbaColor,
  centerX: number,
  centerY: number,
  signal?: RenderCancellationSignal,
): RasterizeOutcome {
  const cos = Math.cos(primitive.rotation);
  const sin = Math.sin(primitive.rotation);
  const frame: LocalFrame = { cos, sin };
  const scale = primitive.scale;
  const opacity = primitive.opacity;

  if (opacity === 0) {
    return { cancelled: false };
  }

  switch (primitive.type) {
    case "circle": {
      const radius = primitive.radius * scale;
      const box = clampAabb(
        centerX - radius,
        centerX + radius,
        centerY - radius,
        centerY + radius,
        image.width,
        image.height,
      );
      if (box === null) {
        return { cancelled: false };
      }
      const rSq = radius * radius;
      for (let y = box.y0; y <= box.y1; y += 1) {
        if (signal?.isCancelled() === true) {
          return { cancelled: true };
        }
        const py = y + 0.5;
        for (let x = box.x0; x <= box.x1; x += 1) {
          const px = x + 0.5;
          const dx = px - centerX;
          const dy = py - centerY;
          if (dx * dx + dy * dy <= rSq) {
            blendPixelAt(image, x, y, foreground, opacity);
          }
        }
      }
      return { cancelled: false };
    }
    case "rectangle": {
      const w = primitive.width * scale;
      const h = primitive.height * scale;
      const hw = w / 2;
      const hh = h / 2;
      const corners = [
        { x: -hw, y: -hh },
        { x: hw, y: -hh },
        { x: hw, y: hh },
        { x: -hw, y: hh },
      ].map((p) => ({
        x: p.x * cos - p.y * sin + centerX,
        y: p.x * sin + p.y * cos + centerY,
      }));
      let minX = Number.POSITIVE_INFINITY;
      let maxX = Number.NEGATIVE_INFINITY;
      let minY = Number.POSITIVE_INFINITY;
      let maxY = Number.NEGATIVE_INFINITY;
      for (const c of corners) {
        minX = Math.min(minX, c.x);
        maxX = Math.max(maxX, c.x);
        minY = Math.min(minY, c.y);
        maxY = Math.max(maxY, c.y);
      }
      const box = clampAabb(minX, maxX, minY, maxY, image.width, image.height);
      if (box === null) {
        return { cancelled: false };
      }
      for (let y = box.y0; y <= box.y1; y += 1) {
        if (signal?.isCancelled() === true) {
          return { cancelled: true };
        }
        const py = y + 0.5;
        for (let x = box.x0; x <= box.x1; x += 1) {
          const px = x + 0.5;
          const local = toLocal(px - centerX, py - centerY, frame);
          if (Math.abs(local.x) <= hw && Math.abs(local.y) <= hh) {
            blendPixelAt(image, x, y, foreground, opacity);
          }
        }
      }
      return { cancelled: false };
    }
    case "ellipse": {
      const rx = primitive.radiusX * scale;
      const ry = primitive.radiusY * scale;
      const halfW = Math.sqrt(rx * cos * (rx * cos) + ry * sin * (ry * sin));
      const halfH = Math.sqrt(rx * sin * (rx * sin) + ry * cos * (ry * cos));
      const box = clampAabb(
        centerX - halfW,
        centerX + halfW,
        centerY - halfH,
        centerY + halfH,
        image.width,
        image.height,
      );
      if (box === null) {
        return { cancelled: false };
      }
      for (let y = box.y0; y <= box.y1; y += 1) {
        if (signal?.isCancelled() === true) {
          return { cancelled: true };
        }
        const py = y + 0.5;
        for (let x = box.x0; x <= box.x1; x += 1) {
          const px = x + 0.5;
          const local = toLocal(px - centerX, py - centerY, frame);
          const nx = local.x / rx;
          const ny = local.y / ry;
          if (nx * nx + ny * ny <= 1) {
            blendPixelAt(image, x, y, foreground, opacity);
          }
        }
      }
      return { cancelled: false };
    }
    case "line": {
      const length = primitive.length * scale;
      const half = length / 2;
      const dirX = cos;
      const dirY = sin;
      const ax = centerX - dirX * half;
      const ay = centerY - dirY * half;
      const bx = centerX + dirX * half;
      const by = centerY + dirY * half;
      const thickness = primitive.thickness ?? DEFAULT_LINE_THICKNESS;
      const halfThickness = thickness / 2;
      const box = clampAabb(
        Math.min(ax, bx) - halfThickness,
        Math.max(ax, bx) + halfThickness,
        Math.min(ay, by) - halfThickness,
        Math.max(ay, by) + halfThickness,
        image.width,
        image.height,
      );
      if (box === null) {
        return { cancelled: false };
      }
      const radiusSq = halfThickness * halfThickness;
      for (let y = box.y0; y <= box.y1; y += 1) {
        if (signal?.isCancelled() === true) {
          return { cancelled: true };
        }
        const py = y + 0.5;
        for (let x = box.x0; x <= box.x1; x += 1) {
          const px = x + 0.5;
          if (distanceToSegmentSquared(px, py, ax, ay, bx, by) <= radiusSq) {
            blendPixelAt(image, x, y, foreground, opacity);
          }
        }
      }
      return { cancelled: false };
    }
    case "polygon": {
      const vertices = primitive.points.map((p) => {
        const sx = p.x * scale;
        const sy = p.y * scale;
        return {
          x: sx * cos - sy * sin + centerX,
          y: sx * sin + sy * cos + centerY,
        };
      });
      let minX = Number.POSITIVE_INFINITY;
      let maxX = Number.NEGATIVE_INFINITY;
      let minY = Number.POSITIVE_INFINITY;
      let maxY = Number.NEGATIVE_INFINITY;
      for (const v of vertices) {
        minX = Math.min(minX, v.x);
        maxX = Math.max(maxX, v.x);
        minY = Math.min(minY, v.y);
        maxY = Math.max(maxY, v.y);
      }
      const box = clampAabb(
        minX - 1,
        maxX + 1,
        minY - 1,
        maxY + 1,
        image.width,
        image.height,
      );
      if (box === null) {
        return { cancelled: false };
      }
      for (let y = box.y0; y <= box.y1; y += 1) {
        if (signal?.isCancelled() === true) {
          return { cancelled: true };
        }
        const py = y + 0.5;
        for (let x = box.x0; x <= box.x1; x += 1) {
          const px = x + 0.5;
          if (pointInPolygon(px, py, vertices)) {
            blendPixelAt(image, x, y, foreground, opacity);
          }
        }
      }
      return { cancelled: false };
    }
  }
}
