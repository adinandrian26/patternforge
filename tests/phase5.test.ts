import { describe, expect, it } from "vitest";
import { decode } from "jpeg-js";
import {
  PATTERN_ALGORITHM_VERSION,
  SCHEMA_VERSION,
} from "@patternforge/shared";
import { generatePattern } from "@patternforge/pattern-engine";
import { renderTile, type RasterImage } from "@patternforge/renderer-engine";
import {
  buildFilename,
  crc32,
  encodeJpeg,
  encodePng,
  exportPatternSvg,
  exportRaster,
  MemoryFileSink,
  sanitizeFilename,
  serializeSvg,
  validateExportConfig,
  type ExportConfig,
} from "@patternforge/export-engine";

function unwrap<T, E>(
  result: { ok: true; value: T } | { ok: false; error: E },
): T {
  if (!result.ok) {
    throw new Error(`Expected ok: ${JSON.stringify(result.error)}`);
  }
  return result.value;
}

const WHITE = { a: 255, b: 255, g: 255, r: 255 };
const BLACK = { a: 255, b: 0, g: 0, r: 0 };

function testTile(): RasterImage {
  return unwrap(
    renderTile([], 16, 16, { background: WHITE, foreground: BLACK }),
  );
}

function testConfig(format: ExportConfig["format"]): ExportConfig {
  return unwrap(validateExportConfig({ filename: "test-pattern", format }));
}

/** Minimal PNG chunk walk: returns chunks with verified CRCs. */
function parsePng(
  bytes: Uint8Array,
): Array<{ data: Uint8Array; type: string }> {
  const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  for (let i = 0; i < 8; i += 1) {
    expect(bytes[i]).toBe(signature[i]);
  }
  const chunks: Array<{ data: Uint8Array; type: string }> = [];
  let offset = 8;
  while (offset < bytes.length) {
    const length =
      ((bytes[offset] ?? 0) << 24) |
      ((bytes[offset + 1] ?? 0) << 16) |
      ((bytes[offset + 2] ?? 0) << 8) |
      (bytes[offset + 3] ?? 0);
    const type = String.fromCharCode(
      bytes[offset + 4] ?? 0,
      bytes[offset + 5] ?? 0,
      bytes[offset + 6] ?? 0,
      bytes[offset + 7] ?? 0,
    );
    const data = bytes.subarray(offset + 8, offset + 8 + length);
    const storedCrc =
      ((bytes[offset + 8 + length] ?? 0) << 24) |
      ((bytes[offset + 9 + length] ?? 0) << 16) |
      ((bytes[offset + 10 + length] ?? 0) << 8) |
      (bytes[offset + 11 + length] ?? 0);
    const typeBytes = new Uint8Array([
      bytes[offset + 4] ?? 0,
      bytes[offset + 5] ?? 0,
      bytes[offset + 6] ?? 0,
      bytes[offset + 7] ?? 0,
    ]);
    const joined = new Uint8Array(4 + data.length);
    joined.set(typeBytes, 0);
    joined.set(data, 4);
    expect(storedCrc >>> 0).toBe(crc32(joined));
    chunks.push({ data: new Uint8Array(data), type });
    offset += 12 + length;
    if (type === "IEND") {
      break;
    }
  }
  return chunks;
}

/** Inflate stored-block-only zlib (what our encoder emits). */
function inflateStored(idat: Uint8Array): Uint8Array {
  expect(idat[0]).toBe(0x78);
  expect(idat[1]).toBe(0x01);
  const out: number[] = [];
  let offset = 2;
  for (;;) {
    const header = idat[offset] ?? 0;
    expect(header & 0x06).toBe(0);
    const final = header & 0x01;
    const len = (idat[offset + 1] ?? 0) | ((idat[offset + 2] ?? 0) << 8);
    const nlen = (idat[offset + 3] ?? 0) | ((idat[offset + 4] ?? 0) << 8);
    expect(len ^ nlen).toBe(0xffff);
    for (let i = 0; i < len; i += 1) {
      out.push(idat[offset + 5 + i] ?? 0);
    }
    offset += 5 + len;
    if (final === 1) {
      break;
    }
  }
  return new Uint8Array(out);
}

function testPattern() {
  return unwrap(
    generatePattern({
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
    }),
  );
}

describe("export config + filenames", () => {
  it("validates format, quality, and defaults", () => {
    expect(validateExportConfig({ format: "png" }).ok).toBe(true);
    const jpeg = unwrap(validateExportConfig({ format: "jpeg", quality: 75 }));
    expect(jpeg.quality).toBe(75);
    const svg = unwrap(validateExportConfig({ format: "svg", quality: 5 }));
    expect(svg.quality).toBe(90);
    expect(validateExportConfig({ format: "bmp" }).ok).toBe(false);
    expect(validateExportConfig({ format: "jpeg", quality: 0 }).ok).toBe(false);
    expect(validateExportConfig({ format: "jpeg", quality: 101 }).ok).toBe(
      false,
    );
    expect(validateExportConfig({ format: "jpeg", quality: 50.5 }).ok).toBe(
      false,
    );
  });

  it("sanitizes filenames and blocks traversal", () => {
    expect(unwrap(sanitizeFilename("my pattern!"))).toBe("my_pattern_");
    expect(sanitizeFilename("../secret").ok).toBe(false);
    expect(sanitizeFilename("a/b").ok).toBe(false);
    expect(sanitizeFilename(".hidden").ok).toBe(false);
    expect(sanitizeFilename("").ok).toBe(false);
    expect(unwrap(buildFilename("12345", 128, 128, "png"))).toBe(
      "patternforge-12345-128x128.png",
    );
    expect(unwrap(buildFilename("12 34", 64, 64, "jpeg", 2))).toBe(
      "patternforge-12_34-64x64-2.jpg",
    );
    expect(unwrap(buildFilename("1", 8, 8, "svg"))).toBe(
      "patternforge-1-8x8.svg",
    );
  });
});

describe("PNG encoder", () => {
  it("emits valid signature, IHDR, and CRCs", () => {
    const bytes = unwrap(encodePng(testTile()));
    const chunks = parsePng(bytes);
    expect(chunks[0]?.type).toBe("IHDR");
    expect(chunks[chunks.length - 1]?.type).toBe("IEND");
    const ihdr = chunks[0]?.data ?? new Uint8Array();
    const width =
      (ihdr[0] ?? 0) * 2 ** 24 +
      (ihdr[1] ?? 0) * 2 ** 16 +
      (ihdr[2] ?? 0) * 256 +
      (ihdr[3] ?? 0);
    const height =
      (ihdr[4] ?? 0) * 2 ** 24 +
      (ihdr[5] ?? 0) * 2 ** 16 +
      (ihdr[6] ?? 0) * 256 +
      (ihdr[7] ?? 0);
    expect(width).toBe(16);
    expect(height).toBe(16);
    expect(ihdr[8]).toBe(8);
    expect(ihdr[9]).toBe(6);
  });

  it("round-trips pixels exactly and deterministically", () => {
    const tile = testTile();
    const first = unwrap(encodePng(tile));
    const second = unwrap(encodePng(tile));
    expect(first).toEqual(second);
    const chunks = parsePng(first);
    const idat = chunks.filter((c) => c.type === "IDAT").map((c) => c.data);
    const joined = new Uint8Array(idat.reduce((n, d) => n + d.length, 0));
    let at = 0;
    for (const d of idat) {
      joined.set(d, at);
      at += d.length;
    }
    const raw = inflateStored(joined);
    expect(raw.length).toBe(16 * (16 * 4 + 1));
    for (let y = 0; y < 16; y += 1) {
      expect(raw[y * 65]).toBe(0);
      const row = raw.subarray(y * 65 + 1, (y + 1) * 65);
      expect(row).toEqual(tile.data.subarray(y * 64, (y + 1) * 64));
    }
  });

  it("rejects oversized images and honors cancellation", () => {
    const bad = encodePng({
      data: new Uint8Array(3000 * 16 * 4),
      height: 16,
      width: 3000,
    });
    expect(bad.ok).toBe(false);
    const cancelled = encodePng(testTile(), {
      isCancelled: () => true,
      operationId: "op" as never,
    });
    expect(cancelled.ok).toBe(false);
  });
});

describe("JPEG encoder", () => {
  it("emits valid markers, dimensions, and near-exact solids", () => {
    const tile = testTile();
    const bytes = unwrap(
      encodeJpeg(tile, 90, { a: 255, b: 255, g: 255, r: 255 }),
    );
    expect(bytes[0]).toBe(0xff);
    expect(bytes[1]).toBe(0xd8);
    expect(bytes[bytes.length - 2]).toBe(0xff);
    expect(bytes[bytes.length - 1]).toBe(0xd9);
    const decoded = decode(bytes, { useTArray: true });
    expect(decoded.width).toBe(16);
    expect(decoded.height).toBe(16);
    let total = 0;
    for (let i = 0; i < decoded.data.length; i += 1) {
      total += Math.abs((decoded.data[i] ?? 0) - 255);
    }
    expect(total / decoded.data.length).toBeLessThan(15);
  });

  it("is deterministic and validates quality", () => {
    const tile = testTile();
    const bg = { a: 255, b: 0, g: 0, r: 0 };
    expect(unwrap(encodeJpeg(tile, 90, bg))).toEqual(
      unwrap(encodeJpeg(tile, 90, bg)),
    );
    expect(encodeJpeg(tile, 0, bg).ok).toBe(false);
    expect(encodeJpeg(tile, 101, bg).ok).toBe(false);
  });
});

describe("SVG serializer", () => {
  it("emits vector shapes with transforms, colors, and 9 seamless copies", () => {
    const pattern = testPattern();
    const svg = unwrap(
      serializeSvg(pattern, { background: WHITE, fallbackFill: BLACK }),
    );
    expect(svg).toContain("<svg");
    expect(svg).toContain("<circle");
    expect(svg).toContain('clip-path="url(#pf-tile-clip)"');
    expect(
      svg.match(/<g transform="translate\(/g)?.length,
    ).toBeGreaterThanOrEqual(9);
    expect(svg).toContain('fill="#000000"');
  });

  it("contains no script, handlers, or external references", () => {
    const pattern = testPattern();
    const svg = unwrap(
      serializeSvg(pattern, { background: WHITE, fallbackFill: BLACK }),
    ).toLowerCase();
    expect(svg).not.toContain("<script");
    expect(svg).not.toContain("onload");
    expect(svg).not.toContain("onclick");
    // The mandatory SVG namespace declaration is the only allowed URL.
    const withoutNamespace = svg.replace(
      'xmlns="http://www.w3.org/2000/svg"',
      "",
    );
    expect(withoutNamespace).not.toContain("http");
    expect(withoutNamespace).not.toContain("data:");
    expect(svg).not.toContain("javascript");
  });
});

describe("export dispatch + filesink", () => {
  it("routes raster formats and rejects svg-without-pattern", () => {
    const tile = testTile();
    const png = unwrap(exportRaster(tile, testConfig("png")));
    expect(png.mimeType).toBe("image/png");
    expect(png.filename.endsWith(".png")).toBe(true);
    const jpg = unwrap(
      exportRaster(
        tile,
        unwrap(validateExportConfig({ filename: "x", format: "jpeg" })),
      ),
    );
    expect(jpg.mimeType).toBe("image/jpeg");
    expect(exportRaster(tile, testConfig("svg")).ok).toBe(false);
    const svg = unwrap(exportPatternSvg(testPattern(), testConfig("svg")));
    expect(svg.mimeType).toBe("image/svg+xml");
    expect(new TextDecoder().decode(svg.bytes)).toContain("<svg");
  });

  it("writes through MemoryFileSink", async () => {
    const sink = new MemoryFileSink();
    const tile = testTile();
    const file = unwrap(exportRaster(tile, testConfig("png")));
    const written = await sink.writeFile(file.filename, file.bytes);
    expect(unwrap(written).byteCount).toBe(file.bytes.length);
    expect(sink.readFile(file.filename)).toEqual(file.bytes);
    expect(sink.listFiles()).toEqual([file.filename]);
  });
});
