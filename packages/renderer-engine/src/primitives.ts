import { err, ok } from "@patternforge/shared";
import {
  isRgbaColor,
  MAX_LINE_THICKNESS,
  MIN_LINE_THICKNESS,
  sprigStemPoint,
  sprigStemTangent,
  starVertices,
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
    case "star": {
      if (
        !Number.isSafeInteger(primitive.spikes) ||
        primitive.spikes < 3 ||
        primitive.spikes > 12
      ) {
        return err(
          invalidPrimitive("Star spikes must be an integer in 3..12."),
        );
      }
      if (
        !isPositiveFinite(primitive.radius) ||
        primitive.radius > MAX_GEOMETRY_EXTENT ||
        !isPositiveFinite(primitive.innerRadius) ||
        primitive.innerRadius > MAX_GEOMETRY_EXTENT
      ) {
        return err(
          invalidPrimitive("Star radii must be finite, positive, and bounded."),
        );
      }
      return ok(primitive);
    }
    case "ring": {
      if (
        !isPositiveFinite(primitive.radius) ||
        primitive.radius > MAX_GEOMETRY_EXTENT
      ) {
        return err(
          invalidPrimitive(
            "Ring radius must be finite, positive, and bounded.",
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
            `Ring thickness must be finite in ${MIN_LINE_THICKNESS}..${MAX_LINE_THICKNESS}.`,
          ),
        );
      }
      return ok(primitive);
    }
    case "flower": {
      if (
        !Number.isSafeInteger(primitive.petals) ||
        primitive.petals < 3 ||
        primitive.petals > 12
      ) {
        return err(
          invalidPrimitive("Flower petals must be an integer in 3..12."),
        );
      }
      if (
        !isPositiveFinite(primitive.petalLength) ||
        primitive.petalLength > MAX_GEOMETRY_EXTENT ||
        !isPositiveFinite(primitive.petalWidth) ||
        primitive.petalWidth > MAX_GEOMETRY_EXTENT ||
        !isPositiveFinite(primitive.centerRadius) ||
        primitive.centerRadius > MAX_GEOMETRY_EXTENT
      ) {
        return err(
          invalidPrimitive(
            "Flower sizes must be finite, positive, and bounded.",
          ),
        );
      }
      if (
        !isFiniteNumber(primitive.innerScale) ||
        primitive.innerScale <= 0 ||
        primitive.innerScale > 1
      ) {
        return err(
          invalidPrimitive("Flower innerScale must be finite in (0, 1]."),
        );
      }
      if (primitive.accent !== undefined && !isRgbaColor(primitive.accent)) {
        return err(
          invalidPrimitive("Flower accent must be a valid RGBA color."),
        );
      }
      return ok(primitive);
    }
    case "wave": {
      if (
        !isPositiveFinite(primitive.length) ||
        primitive.length > MAX_GEOMETRY_EXTENT * 2 ||
        !isPositiveFinite(primitive.amplitude) ||
        primitive.amplitude > MAX_GEOMETRY_EXTENT ||
        !isPositiveFinite(primitive.wavelength) ||
        primitive.wavelength > MAX_GEOMETRY_EXTENT * 2
      ) {
        return err(
          invalidPrimitive(
            "Wave length/amplitude/wavelength must be finite, positive, and bounded.",
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
            `Wave thickness must be finite in ${MIN_LINE_THICKNESS}..${MAX_LINE_THICKNESS}.`,
          ),
        );
      }
      return ok(primitive);
    }
    case "leaf": {
      if (
        !isPositiveFinite(primitive.length) ||
        primitive.length > MAX_GEOMETRY_EXTENT * 2 ||
        !isPositiveFinite(primitive.width) ||
        primitive.width > MAX_GEOMETRY_EXTENT
      ) {
        return err(
          invalidPrimitive(
            "Leaf length/width must be finite, positive, and bounded.",
          ),
        );
      }
      return ok(primitive);
    }
    case "sprig": {
      if (
        !isPositiveFinite(primitive.stemLength) ||
        primitive.stemLength > MAX_GEOMETRY_EXTENT * 2 ||
        !isPositiveFinite(primitive.stemThickness) ||
        primitive.stemThickness < MIN_LINE_THICKNESS ||
        primitive.stemThickness > MAX_LINE_THICKNESS ||
        !isFiniteNumber(primitive.stemBend) ||
        Math.abs(primitive.stemBend) > MAX_GEOMETRY_EXTENT
      ) {
        return err(
          invalidPrimitive("Sprig stem must be finite, positive, and bounded."),
        );
      }
      if (!Array.isArray(primitive.leaves) || primitive.leaves.length > 6) {
        return err(invalidPrimitive("Sprig must hold at most 6 leaves."));
      }
      for (const leaf of primitive.leaves) {
        if (
          !isFiniteNumber(leaf.along) ||
          leaf.along < 0 ||
          leaf.along > 1 ||
          !isFiniteNumber(leaf.angle) ||
          !isPositiveFinite(leaf.length) ||
          leaf.length > MAX_GEOMETRY_EXTENT ||
          !isPositiveFinite(leaf.width) ||
          leaf.width > MAX_GEOMETRY_EXTENT
        ) {
          return err(
            invalidPrimitive("Sprig leaves must be finite and bounded."),
          );
        }
      }
      if (!Array.isArray(primitive.berries) || primitive.berries.length > 6) {
        return err(invalidPrimitive("Sprig must hold at most 6 berries."));
      }
      for (const berry of primitive.berries) {
        if (
          !isFiniteNumber(berry.x) ||
          !isFiniteNumber(berry.y) ||
          Math.abs(berry.x) > MAX_GEOMETRY_EXTENT ||
          Math.abs(berry.y) > MAX_GEOMETRY_EXTENT ||
          !isPositiveFinite(berry.radius) ||
          berry.radius > MAX_GEOMETRY_EXTENT
        ) {
          return err(
            invalidPrimitive("Sprig berries must be finite and bounded."),
          );
        }
      }
      const flower = primitive.flower;
      if (flower !== null) {
        if (
          !Number.isSafeInteger(flower.petals) ||
          flower.petals < 3 ||
          flower.petals > 12 ||
          !isPositiveFinite(flower.petalLength) ||
          flower.petalLength > MAX_GEOMETRY_EXTENT ||
          !isPositiveFinite(flower.petalWidth) ||
          flower.petalWidth > MAX_GEOMETRY_EXTENT ||
          !isPositiveFinite(flower.centerRadius) ||
          flower.centerRadius > MAX_GEOMETRY_EXTENT ||
          !isFiniteNumber(flower.innerScale) ||
          flower.innerScale <= 0 ||
          flower.innerScale > 1 ||
          !isFiniteNumber(flower.x) ||
          !isFiniteNumber(flower.y)
        ) {
          return err(
            invalidPrimitive("Sprig flower must be finite and bounded."),
          );
        }
      }
      if (primitive.accent !== undefined && !isRgbaColor(primitive.accent)) {
        return err(
          invalidPrimitive("Sprig accent must be a valid RGBA color."),
        );
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

/** Lens test in leaf-local units (leaf points along +x, centered). */
function testLeafAt(
  lx: number,
  ly: number,
  length: number,
  width: number,
): boolean {
  const half = length / 2;
  if (Math.abs(lx) > half) {
    return false;
  }
  const t = (2 * lx) / length;
  const edge = (width / 2) * (1 - t * t);
  return Math.abs(ly) <= edge;
}

/** Flower test in flower-local units (centered at origin). */
function testFlowerAt(
  lx: number,
  ly: number,
  petals: number,
  petalLength: number,
  petalWidth: number,
  centerRadius: number,
): boolean {
  if (lx * lx + ly * ly <= centerRadius * centerRadius) {
    return true;
  }
  const dist = centerRadius * 0.5 + petalLength / 2;
  const halfL = petalLength / 2;
  const halfW = petalWidth / 2;
  for (let k = 0; k < petals; k += 1) {
    const angle = (k * Math.PI * 2) / petals;
    const dirX = Math.cos(angle);
    const dirY = Math.sin(angle);
    const relX = lx - dirX * dist;
    const relY = ly - dirY * dist;
    const along = relX * dirX + relY * dirY;
    const across = relX * dirY - relY * dirX;
    if (
      (along * along) / (halfL * halfL) + (across * across) / (halfW * halfW) <=
      1
    ) {
      return true;
    }
  }
  return false;
}

/** Inner-petal overlay test (accent color); same centers, scaled petals. */
function testFlowerInnerAt(
  lx: number,
  ly: number,
  petals: number,
  petalLength: number,
  petalWidth: number,
  centerRadius: number,
  innerScale: number,
): boolean {
  if (!(innerScale > 0) || innerScale >= 1) {
    return false;
  }
  const dist = centerRadius * 0.5 + petalLength / 2;
  const halfL = (petalLength * innerScale) / 2;
  const halfW = (petalWidth * innerScale) / 2;
  for (let k = 0; k < petals; k += 1) {
    const angle = (k * Math.PI * 2) / petals;
    const dirX = Math.cos(angle);
    const dirY = Math.sin(angle);
    const relX = lx - dirX * dist;
    const relY = ly - dirY * dist;
    const along = relX * dirX + relY * dirY;
    const across = relX * dirY - relY * dirX;
    if (
      (along * along) / (halfL * halfL) + (across * across) / (halfW * halfW) <=
      1
    ) {
      return true;
    }
  }
  return false;
}

function rasterizeLocalPolygon(
  image: RasterImage,
  primitive: PatternPrimitive,
  foreground: RgbaColor,
  centerX: number,
  centerY: number,
  localPoints: readonly { x: number; y: number }[],
  signal?: RenderCancellationSignal,
): RasterizeOutcome {
  const cos = Math.cos(primitive.rotation);
  const sin = Math.sin(primitive.rotation);
  const scale = primitive.scale;
  const opacity = primitive.opacity;
  const vertices = localPoints.map((p) => {
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
      return rasterizeLocalPolygon(
        image,
        primitive,
        foreground,
        centerX,
        centerY,
        primitive.points,
        signal,
      );
    }
    case "star": {
      return rasterizeLocalPolygon(
        image,
        primitive,
        foreground,
        centerX,
        centerY,
        starVertices(primitive.spikes, primitive.radius, primitive.innerRadius),
        signal,
      );
    }
    case "ring": {
      const outer = primitive.radius * scale;
      const thickness = primitive.thickness ?? DEFAULT_LINE_THICKNESS;
      const inner = outer - thickness;
      const box = clampAabb(
        centerX - outer,
        centerX + outer,
        centerY - outer,
        centerY + outer,
        image.width,
        image.height,
      );
      if (box === null) {
        return { cancelled: false };
      }
      const outerSq = outer * outer;
      const innerSq = inner > 0 ? inner * inner : 0;
      for (let y = box.y0; y <= box.y1; y += 1) {
        if (signal?.isCancelled() === true) {
          return { cancelled: true };
        }
        const py = y + 0.5;
        for (let x = box.x0; x <= box.x1; x += 1) {
          const px = x + 0.5;
          const dx = px - centerX;
          const dy = py - centerY;
          const distSq = dx * dx + dy * dy;
          if (distSq <= outerSq && distSq > innerSq) {
            blendPixelAt(image, x, y, foreground, opacity);
          }
        }
      }
      return { cancelled: false };
    }
    case "flower": {
      const petals = primitive.petals;
      const petalLength = primitive.petalLength * scale;
      const petalWidth = primitive.petalWidth * scale;
      const centerRadius = primitive.centerRadius * scale;
      const dist = centerRadius * 0.5 + petalLength / 2;
      const bound = dist + petalLength / 2 + 1;
      const box = clampAabb(
        centerX - bound,
        centerX + bound,
        centerY - bound,
        centerY + bound,
        image.width,
        image.height,
      );
      if (box === null) {
        return { cancelled: false };
      }
      const accent = primitive.accent ?? foreground;
      for (let y = box.y0; y <= box.y1; y += 1) {
        if (signal?.isCancelled() === true) {
          return { cancelled: true };
        }
        const py = y + 0.5;
        for (let x = box.x0; x <= box.x1; x += 1) {
          const px = x + 0.5;
          const local = toLocal(px - centerX, py - centerY, frame);
          if (
            testFlowerInnerAt(
              local.x,
              local.y,
              petals,
              petalLength,
              petalWidth,
              centerRadius,
              primitive.innerScale,
            )
          ) {
            blendPixelAt(image, x, y, accent, opacity);
          } else if (
            testFlowerAt(
              local.x,
              local.y,
              petals,
              petalLength,
              petalWidth,
              centerRadius,
            )
          ) {
            blendPixelAt(image, x, y, foreground, opacity);
          }
        }
      }
      return { cancelled: false };
    }
    case "wave": {
      const length = primitive.length * scale;
      const amplitude = primitive.amplitude * scale;
      const wavelength = primitive.wavelength * scale;
      const thickness = primitive.thickness ?? DEFAULT_LINE_THICKNESS;
      const half = length / 2;
      const segments = 32;
      const ext = half + amplitude + thickness;
      const box = clampAabb(
        centerX - ext,
        centerX + ext,
        centerY - ext,
        centerY + ext,
        image.width,
        image.height,
      );
      if (box === null) {
        return { cancelled: false };
      }
      const xs: number[] = [];
      const ys: number[] = [];
      for (let i = 0; i <= segments; i += 1) {
        const lx = -half + (length * i) / segments;
        xs.push(
          lx * cos +
            centerX -
            amplitude * Math.sin((Math.PI * 2 * lx) / wavelength) * sin,
        );
        ys.push(
          lx * sin +
            centerY +
            amplitude * Math.sin((Math.PI * 2 * lx) / wavelength) * cos,
        );
      }
      const radiusSq = (thickness / 2) * (thickness / 2);
      for (let y = box.y0; y <= box.y1; y += 1) {
        if (signal?.isCancelled() === true) {
          return { cancelled: true };
        }
        const py = y + 0.5;
        for (let x = box.x0; x <= box.x1; x += 1) {
          const px = x + 0.5;
          for (let i = 0; i < segments; i += 1) {
            if (
              distanceToSegmentSquared(
                px,
                py,
                xs[i] ?? 0,
                ys[i] ?? 0,
                xs[i + 1] ?? 0,
                ys[i + 1] ?? 0,
              ) <= radiusSq
            ) {
              blendPixelAt(image, x, y, foreground, opacity);
              break;
            }
          }
        }
      }
      return { cancelled: false };
    }
    case "leaf": {
      const length = primitive.length * scale;
      const width = primitive.width * scale;
      const half = length / 2;
      const ext = Math.max(half, width / 2) + 1;
      const box = clampAabb(
        centerX - ext,
        centerX + ext,
        centerY - ext,
        centerY + ext,
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
          if (testLeafAt(local.x, local.y, length, width)) {
            blendPixelAt(image, x, y, foreground, opacity);
          }
        }
      }
      return { cancelled: false };
    }
    case "sprig": {
      const stemLength = primitive.stemLength * scale;
      const stemThickness = primitive.stemThickness;
      let reach = stemLength + stemThickness;
      for (const leaf of primitive.leaves) {
        reach = Math.max(reach, leaf.length * scale);
      }
      if (primitive.flower !== null) {
        reach = Math.max(
          reach,
          primitive.flower.petalLength * scale +
            primitive.flower.centerRadius * scale,
        );
      }
      reach += 2;
      const box = clampAabb(
        centerX - reach,
        centerX + reach,
        centerY - reach,
        centerY + reach,
        image.width,
        image.height,
      );
      if (box === null) {
        return { cancelled: false };
      }
      // Curved stem in world space (thickness unscaled, like lines).
      const stemSegs = 16;
      const stemXs: number[] = [];
      const stemYs: number[] = [];
      for (let i = 0; i <= stemSegs; i += 1) {
        const t = i / stemSegs;
        const p = sprigStemPoint(primitive.stemBend, primitive.stemLength, t);
        const sx = p.x * scale;
        const sy = p.y * scale;
        stemXs.push(sx * cos - sy * sin + centerX);
        stemYs.push(sx * sin + sy * cos + centerY);
      }
      const radiusSq = (stemThickness / 2) * (stemThickness / 2);
      const accent = primitive.accent ?? foreground;
      for (let y = box.y0; y <= box.y1; y += 1) {
        if (signal?.isCancelled() === true) {
          return { cancelled: true };
        }
        const py = y + 0.5;
        for (let x = box.x0; x <= box.x1; x += 1) {
          const px = x + 0.5;
          let onStem = false;
          for (let i = 0; i < stemSegs; i += 1) {
            if (
              distanceToSegmentSquared(
                px,
                py,
                stemXs[i] ?? 0,
                stemYs[i] ?? 0,
                stemXs[i + 1] ?? 0,
                stemYs[i + 1] ?? 0,
              ) <= radiusSq
            ) {
              blendPixelAt(image, x, y, foreground, opacity);
              onStem = true;
              break;
            }
          }
          if (onStem) {
            continue;
          }
          const local = toLocal(px - centerX, py - centerY, frame);
          const slx = local.x / scale;
          const sly = local.y / scale;
          let painted = false;
          for (const leaf of primitive.leaves) {
            const bp = sprigStemPoint(
              primitive.stemBend,
              primitive.stemLength,
              leaf.along,
            );
            const bt = sprigStemTangent(
              primitive.stemBend,
              primitive.stemLength,
              leaf.along,
            );
            const ca = Math.cos(leaf.angle);
            const sa = Math.sin(leaf.angle);
            const dirX = bt.x * ca - bt.y * sa;
            const dirY = bt.x * sa + bt.y * ca;
            const cx = bp.x + dirX * (leaf.length / 2);
            const cy = bp.y + dirY * (leaf.length / 2);
            const relX = slx - cx;
            const relY = sly - cy;
            const along = relX * dirX + relY * dirY;
            const across = relX * dirY - relY * dirX;
            if (testLeafAt(along, across, leaf.length, leaf.width)) {
              blendPixelAt(image, x, y, foreground, opacity);
              painted = true;
              break;
            }
          }
          if (painted) {
            continue;
          }
          for (const berry of primitive.berries) {
            const dx = slx - berry.x;
            const dy = sly - berry.y;
            if (dx * dx + dy * dy <= berry.radius * berry.radius) {
              blendPixelAt(image, x, y, foreground, opacity);
              painted = true;
              break;
            }
          }
          if (painted) {
            continue;
          }
          const flower = primitive.flower;
          if (flower !== null) {
            const fx = slx - flower.x;
            const fy = sly - flower.y;
            if (
              testFlowerInnerAt(
                fx,
                fy,
                flower.petals,
                flower.petalLength,
                flower.petalWidth,
                flower.centerRadius,
                flower.innerScale,
              )
            ) {
              blendPixelAt(image, x, y, accent, opacity);
            } else if (
              testFlowerAt(
                fx,
                fy,
                flower.petals,
                flower.petalLength,
                flower.petalWidth,
                flower.centerRadius,
              )
            ) {
              blendPixelAt(image, x, y, foreground, opacity);
            }
          }
        }
      }
      return { cancelled: false };
    }
  }
}
