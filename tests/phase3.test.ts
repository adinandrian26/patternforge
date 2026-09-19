import { describe, expect, it } from "vitest";
import type { EntityId, OperationId } from "@patternforge/shared";
import {
  PATTERN_ALGORITHM_VERSION,
  SCHEMA_VERSION,
} from "@patternforge/shared";
import type {
  Circle,
  Ellipse,
  Line,
  PatternPrimitive,
  Polygon,
  Rectangle,
} from "@patternforge/core";
import { generatePattern } from "@patternforge/pattern-engine";
import {
  composePreviewGrid,
  computeImageChecksum,
  createRasterImage,
  DEFAULT_BACKGROUND,
  DEFAULT_FOREGROUND,
  extractGridCell,
  getPixel,
  imagesEqual,
  renderPattern,
  renderPrimitive,
  renderTile,
  validateCornerContinuity,
  validateHorizontalSeam,
  validatePreviewGridConsistency,
  validateTileSeamless,
  validateVerticalSeam,
  type RasterImage,
  type RenderCancellationSignal,
} from "@patternforge/renderer-engine";

function unwrap<T, E>(
  result: { ok: true; value: T } | { ok: false; error: E },
): T {
  if (!result.ok) {
    throw new Error(`Expected ok, got error: ${JSON.stringify(result)}`);
  }
  return result.value;
}

const WHITE = { a: 255, b: 255, g: 255, r: 255 };
const BLACK = { a: 255, b: 0, g: 0, r: 0 };

function id(n: number): EntityId {
  return `primitive-${String(n).padStart(6, "0")}` as EntityId;
}

function baseCircle(overrides: Partial<Circle> = {}): Circle {
  return {
    id: id(1),
    opacity: 1,
    radius: 5,
    rotation: 0,
    scale: 1,
    type: "circle",
    x: 8,
    y: 8,
    ...overrides,
  };
}

function baseRect(overrides: Partial<Rectangle> = {}): Rectangle {
  return {
    height: 6,
    id: id(1),
    opacity: 1,
    rotation: 0,
    scale: 1,
    type: "rectangle",
    width: 8,
    x: 8,
    y: 8,
    ...overrides,
  };
}

function countForeground(
  image: RasterImage,
  background: { r: number; g: number; b: number } = WHITE,
): number {
  let count = 0;
  const pixels = image.width * image.height;
  for (let p = 0; p < pixels; p += 1) {
    const o = p * 4;
    const r = image.data[o] ?? 0;
    const g = image.data[o + 1] ?? 0;
    const b = image.data[o + 2] ?? 0;
    if (r !== background.r || g !== background.g || b !== background.b) {
      count += 1;
    }
  }
  return count;
}

function cancelledSignal(): RenderCancellationSignal {
  return {
    isCancelled: () => true,
    operationId: "op-cancelled" as OperationId,
  };
}

function liveSignal(): RenderCancellationSignal {
  return {
    isCancelled: () => false,
    operationId: "op-live" as OperationId,
  };
}

describe("A. solid background", () => {
  it("fills the tile with the background color when no primitives exist", () => {
    const image = unwrap(
      renderTile([], 16, 16, { background: WHITE, foreground: BLACK }),
    );
    expect(image.width).toBe(16);
    expect(image.height).toBe(16);
    expect(image.data).toHaveLength(16 * 16 * 4);
    for (let y = 0; y < 16; y += 1) {
      for (let x = 0; x < 16; x += 1) {
        expect(getPixel(image, x, y)).toEqual(WHITE);
      }
    }
    expect(countForeground(image)).toBe(0);
  });

  it("creates a raster image with documented RGBA layout", () => {
    const image = unwrap(createRasterImage(4, 2, WHITE));
    expect(image.width).toBe(4);
    expect(image.height).toBe(2);
    // Row stride is width * 4, row-major, RGBA order.
    expect(image.data).toHaveLength(32);
    expect(getPixel(image, 0, 0)).toEqual(WHITE);
    expect(getPixel(image, 3, 1)).toEqual(WHITE);
  });
});

describe("B. rectangle rendering", () => {
  it("renders a centered rectangle with foreground center and background corners", () => {
    const rect = baseRect({ height: 6, width: 8, x: 8, y: 8 });
    const image = unwrap(renderPrimitive(rect, 16, 16, BLACK, WHITE));
    expect(getPixel(image, 8, 8)).toEqual(BLACK);
    expect(getPixel(image, 0, 0)).toEqual(WHITE);
    const fg = countForeground(image);
    expect(fg).toBeGreaterThan(0);
    expect(fg).toBeLessThan(16 * 16);
  });
});

describe("C. circle rendering", () => {
  it("renders a centered circle", () => {
    const circle = baseCircle({ radius: 5, x: 8, y: 8 });
    const image = unwrap(renderPrimitive(circle, 16, 16, BLACK, WHITE));
    expect(getPixel(image, 8, 8)).toEqual(BLACK);
    expect(getPixel(image, 0, 0)).toEqual(WHITE);
    expect(countForeground(image)).toBeGreaterThan(0);
  });

  it("is invariant under rotation (circle symmetry)", () => {
    const a = unwrap(
      renderPrimitive(baseCircle({ rotation: 0 }), 16, 16, BLACK, WHITE),
    );
    const b = unwrap(
      renderPrimitive(
        baseCircle({ rotation: Math.PI / 2 }),
        16,
        16,
        BLACK,
        WHITE,
      ),
    );
    expect(imagesEqual(a, b)).toBe(true);
  });
});

describe("D. ellipse rendering", () => {
  it("renders a centered ellipse", () => {
    const ellipse: Ellipse = {
      id: id(1),
      opacity: 1,
      radiusX: 6,
      radiusY: 3,
      rotation: 0,
      scale: 1,
      type: "ellipse",
      x: 8,
      y: 8,
    };
    const image = unwrap(renderPrimitive(ellipse, 16, 16, BLACK, WHITE));
    expect(getPixel(image, 8, 8)).toEqual(BLACK);
    expect(getPixel(image, 0, 0)).toEqual(WHITE);
    expect(countForeground(image)).toBeGreaterThan(0);
  });
});

describe("E. line rendering", () => {
  it("renders a horizontal line through the center", () => {
    const line: Line = {
      id: id(1),
      length: 12,
      opacity: 1,
      rotation: 0,
      scale: 1,
      type: "line",
      x: 8,
      y: 8,
    };
    const image = unwrap(renderPrimitive(line, 16, 16, BLACK, WHITE));
    // Center row should contain foreground pixels.
    expect(getPixel(image, 8, 8)).toEqual(BLACK);
    // Far corner stays background.
    expect(getPixel(image, 0, 0)).toEqual(WHITE);
    expect(countForeground(image)).toBeGreaterThan(0);
  });
});

describe("F. polygon rendering", () => {
  it("renders a square polygon", () => {
    const polygon: Polygon = {
      id: id(1),
      opacity: 1,
      points: [
        { x: -4, y: -4 },
        { x: 4, y: -4 },
        { x: 4, y: 4 },
        { x: -4, y: 4 },
      ],
      rotation: 0,
      scale: 1,
      type: "polygon",
      x: 8,
      y: 8,
    };
    const image = unwrap(renderPrimitive(polygon, 16, 16, BLACK, WHITE));
    expect(getPixel(image, 8, 8)).toEqual(BLACK);
    expect(getPixel(image, 0, 0)).toEqual(WHITE);
    expect(countForeground(image)).toBeGreaterThan(0);
  });
});

describe("G. rotation", () => {
  it("changes raster output for a non-square rectangle", () => {
    const base = baseRect({ height: 4, width: 10, x: 8, y: 8 });
    const straight = unwrap(
      renderPrimitive({ ...base, rotation: 0 }, 16, 16, BLACK, WHITE),
    );
    const rotated = unwrap(
      renderPrimitive({ ...base, rotation: Math.PI / 2 }, 16, 16, BLACK, WHITE),
    );
    expect(imagesEqual(straight, rotated)).toBe(false);
    // Both cover the center.
    expect(getPixel(straight, 8, 8)).toEqual(BLACK);
    expect(getPixel(rotated, 8, 8)).toEqual(BLACK);
  });
});

describe("H. scale", () => {
  it("larger scale covers more pixels", () => {
    const small = unwrap(
      renderPrimitive(
        baseRect({ height: 6, scale: 0.5, width: 10 }),
        24,
        24,
        BLACK,
        WHITE,
      ),
    );
    const large = unwrap(
      renderPrimitive(
        baseRect({ height: 6, scale: 1, width: 10 }),
        24,
        24,
        BLACK,
        WHITE,
      ),
    );
    const smallCount = countForeground(small);
    const largeCount = countForeground(large);
    expect(largeCount).toBeGreaterThan(smallCount);
    expect(smallCount).toBeGreaterThan(0);
  });
});

describe("I. opacity", () => {
  it("applies alpha compositing deterministically", () => {
    const transparent = unwrap(
      renderPrimitive(baseCircle({ opacity: 0 }), 16, 16, BLACK, WHITE),
    );
    expect(countForeground(transparent)).toBe(0);

    const opaque = unwrap(
      renderPrimitive(baseCircle({ opacity: 1 }), 16, 16, BLACK, WHITE),
    );
    expect(getPixel(opaque, 8, 8)).toEqual(BLACK);

    const half = unwrap(
      renderPrimitive(baseCircle({ opacity: 0.5 }), 16, 16, BLACK, WHITE),
    );
    const center = getPixel(half, 8, 8);
    // White (255) over black (0) at 50%: round((0*128 + 255*127)/255) = 127.
    expect(center.r).toBe(127);
    expect(center.g).toBe(127);
    expect(center.b).toBe(127);
    expect(center.a).toBe(255);
  });
});

describe("J. deterministic rendering", () => {
  it("produces identical pixels for identical pattern input", () => {
    const input = {
      algorithmVersion: PATTERN_ALGORITHM_VERSION,
      dimensions: { height: 32, width: 32 },
      parameters: {
        canvasHeight: 32,
        canvasWidth: 32,
        complexity: 3,
        density: 5,
        positionJitter: 0.1,
        primitiveType: "circle",
        rotationRange: Math.PI,
        scale: 0.5,
      },
      schemaVersion: SCHEMA_VERSION,
      seed: "12345",
    } as const;
    const first = unwrap(generatePattern({ ...input }));
    const second = unwrap(generatePattern({ ...input }));
    const renderA = unwrap(renderPattern(first));
    const renderB = unwrap(renderPattern(second));
    expect(imagesEqual(renderA, renderB)).toBe(true);
    expect(computeImageChecksum(renderA)).toBe(computeImageChecksum(renderB));
  });
});

describe("K. horizontal seamless edge", () => {
  it("wraps a left-crossing circle to the right edge", () => {
    const circle = baseCircle({ radius: 6, x: 2, y: 16 });
    const tiled = unwrap(
      renderTile([circle], 32, 32, { background: WHITE, foreground: BLACK }),
    );
    // Left edge foreground (direct copy).
    expect(getPixel(tiled, 0, 16).r).toBe(0);
    // Right edge foreground (wrapped +W copy).
    expect(getPixel(tiled, 31, 16).r).toBe(0);

    // Single-copy rendering without wrapping leaves the right edge empty.
    const single = unwrap(renderPrimitive(circle, 32, 32, BLACK, WHITE));
    expect(getPixel(single, 31, 16)).toEqual(WHITE);
  });

  it("passes horizontal shift-invariance validation", () => {
    const primitives: PatternPrimitive[] = [
      baseCircle({ radius: 6, x: 2, y: 16 }),
      baseRect({ height: 5, width: 7, x: 30, y: 8 }),
    ];
    const result = validateHorizontalSeam(primitives, 32, 32, {
      background: WHITE,
      foreground: BLACK,
    });
    expect(result.pass).toBe(true);
    expect(result.mismatchedPixels).toBe(0);
  });
});

describe("L. vertical seamless edge", () => {
  it("wraps a top-crossing circle to the bottom edge", () => {
    const circle = baseCircle({ radius: 6, x: 16, y: 2 });
    const tiled = unwrap(
      renderTile([circle], 32, 32, { background: WHITE, foreground: BLACK }),
    );
    expect(getPixel(tiled, 16, 0).r).toBe(0);
    expect(getPixel(tiled, 16, 31).r).toBe(0);
  });

  it("passes vertical shift-invariance validation", () => {
    const primitives: PatternPrimitive[] = [
      baseCircle({ radius: 6, x: 16, y: 2 }),
    ];
    const result = validateVerticalSeam(primitives, 32, 32, {
      background: WHITE,
      foreground: BLACK,
    });
    expect(result.pass).toBe(true);
  });
});

describe("M. corner continuity", () => {
  it("wraps a corner-crossing circle to all four corners", () => {
    const circle = baseCircle({ radius: 6, x: 2, y: 2 });
    const tiled = unwrap(
      renderTile([circle], 32, 32, { background: WHITE, foreground: BLACK }),
    );
    expect(getPixel(tiled, 0, 0).r).toBe(0);
    expect(getPixel(tiled, 31, 0).r).toBe(0);
    expect(getPixel(tiled, 0, 31).r).toBe(0);
    expect(getPixel(tiled, 31, 31).r).toBe(0);
  });

  it("passes corner and full seamless validation", () => {
    const primitives: PatternPrimitive[] = [
      baseCircle({ radius: 6, x: 2, y: 2 }),
      baseRect({ height: 4, width: 6, x: 30, y: 30 }),
    ];
    expect(
      validateCornerContinuity(primitives, 32, 32, {
        background: WHITE,
        foreground: BLACK,
      }).pass,
    ).toBe(true);
    expect(
      validateTileSeamless(primitives, 32, 32, {
        background: WHITE,
        foreground: BLACK,
      }).pass,
    ).toBe(true);
  });
});

describe("N. 3x3 composition", () => {
  it("composes an exact 3x3 grid with matching cells", () => {
    const tile = unwrap(
      renderTile([baseCircle({ radius: 5, x: 8, y: 8 })], 16, 16, {
        background: WHITE,
        foreground: BLACK,
      }),
    );
    const grid = unwrap(composePreviewGrid(tile, 3, 3));
    expect(grid.width).toBe(48);
    expect(grid.height).toBe(48);
    expect(grid.data).toHaveLength(48 * 48 * 4);

    for (let row = 0; row < 3; row += 1) {
      for (let col = 0; col < 3; col += 1) {
        const cell = unwrap(extractGridCell(grid, 16, 16, col, row));
        expect(imagesEqual(cell, tile)).toBe(true);
      }
    }
    expect(validatePreviewGridConsistency(grid, 16, 16).pass).toBe(true);
  });
});

describe("O. invalid render dimensions", () => {
  it("rejects zero, negative, and over-limit dimensions with typed errors", () => {
    const zero = renderTile([], 0, 16);
    expect(zero.ok).toBe(false);
    if (!zero.ok) {
      expect(zero.error.code).toBe("INVALID_DIMENSIONS");
    }

    const negative = createRasterImage(-4, 16);
    expect(negative.ok).toBe(false);
    if (!negative.ok) {
      expect(negative.error.code).toBe("INVALID_DIMENSIONS");
    }

    const tooLarge = renderTile([], 3000, 16);
    expect(tooLarge.ok).toBe(false);
    if (!tooLarge.ok) {
      expect(tooLarge.error.code).toBe("RENDER_LIMIT_EXCEEDED");
    }

    const tooManyPixels = renderTile([], 2048, 2049);
    expect(tooManyPixels.ok).toBe(false);
    if (!tooManyPixels.ok) {
      expect(tooManyPixels.error.code).toBe("RENDER_LIMIT_EXCEEDED");
    }
  });
});

describe("golden checksum", () => {
  it("keeps a fixed 32x32 render stable", () => {
    const input = {
      algorithmVersion: PATTERN_ALGORITHM_VERSION,
      dimensions: { height: 32, width: 32 },
      parameters: {
        canvasHeight: 32,
        canvasWidth: 32,
        complexity: 3,
        density: 5,
        positionJitter: 0.1,
        primitiveType: "circle",
        rotationRange: Math.PI,
        scale: 0.5,
      },
      schemaVersion: SCHEMA_VERSION,
      seed: "12345",
    } as const;
    const pattern = unwrap(generatePattern({ ...input }));
    const image = unwrap(
      renderPattern(pattern, { background: WHITE, foreground: BLACK }),
    );
    const checksum = computeImageChecksum(image);
    // Deterministic across reruns.
    const rerun = unwrap(
      renderPattern(pattern, { background: WHITE, foreground: BLACK }),
    );
    expect(computeImageChecksum(rerun)).toBe(checksum);
    // Compact regression fixture (fails if the renderer changes).
    expect(typeof checksum).toBe("string");
    expect(checksum).toHaveLength(8);
    // Golden value recorded from the reference implementation.
    expect(checksum).toBe("a319b114");
  });
});

describe("typed render errors, memory limits, cancellation", () => {
  it("rejects invalid colors", () => {
    const bad = renderTile([], 16, 16, {
      background: { a: 255, b: 0, g: 0, r: 300 },
      foreground: BLACK,
    });
    expect(bad.ok).toBe(false);
    if (!bad.ok) {
      expect(bad.error.code).toBe("INVALID_COLOR");
    }
  });

  it("rejects invalid primitives", () => {
    const bad = baseCircle({ opacity: 2 });
    const result = renderTile([bad], 16, 16);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("INVALID_PRIMITIVE");
    }
  });

  it("respects cooperative cancellation", () => {
    const primitives: PatternPrimitive[] = [baseCircle({})];
    const cancelled = renderTile(
      primitives,
      32,
      32,
      undefined,
      cancelledSignal(),
    );
    expect(cancelled.ok).toBe(false);
    if (!cancelled.ok) {
      expect(cancelled.error.code).toBe("CANCELLED");
    }

    const live = renderTile(primitives, 32, 32, undefined, liveSignal());
    expect(live.ok).toBe(true);
  });

  it("uses default background/foreground when settings are omitted", () => {
    const image = unwrap(renderTile([], 8, 8));
    expect(getPixel(image, 0, 0)).toEqual(DEFAULT_BACKGROUND);
    expect(DEFAULT_FOREGROUND).toEqual(BLACK);
  });
});
