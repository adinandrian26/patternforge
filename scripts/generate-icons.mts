/**
 * Deterministic Tauri icon generator — the ONLY sanctioned source of
 * `apps/desktop/src-tauri/icons/*`.
 *
 * Recipe (fixed, documented, reproducible — run `node scripts/generate-icons.mts`):
 * - 256x256 tile, seed "987654321", density 14, scale 0.75,
 *   rotationRange PI, complexity 3, jitter 0.15, primitive "circle",
 *   palette preset "primary", background navy #142850.
 * - Rendered with the project's own pattern-engine + renderer-engine
 *   (no external art, no randomness beyond the seeded PRNG).
 * - Downscaled by integer box averaging to 128 / 64 / 32 / 16.
 * - PNGs encoded with the project's own export-engine PNG encoder.
 * - icon.ico embeds PNG-compressed 16/32/64/256 entries.
 *
 * Outputs: 32x32.png, 128x128.png, 128x128@2x.png (256px), icon.ico.
 * (.icns is macOS-only and intentionally omitted: Windows-only release.)
 */
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  PATTERN_ALGORITHM_VERSION,
  SCHEMA_VERSION,
} from "@patternforge/shared";
import { generatePattern } from "@patternforge/pattern-engine";
import { renderTile, type RasterImage } from "@patternforge/renderer-engine";
import { encodePng } from "@patternforge/export-engine";
import { hexToColor } from "@patternforge/core";
import { PALETTE_PRESETS } from "../apps/desktop/src/config.ts";

// Must run from the repository root (`node scripts/generate-icons.mts`).
// Resolved from process.cwd() (NOT import.meta.url) so the script also
// works when bundled to a temp file by esbuild.
const REPO_ROOT = process.cwd();
const ICONS_DIR = join(REPO_ROOT, "apps", "desktop", "src-tauri", "icons");
if (
  !existsSync(
    join(REPO_ROOT, "apps", "desktop", "src-tauri", "tauri.conf.json"),
  )
) {
  fail("run from the repository root: node scripts/generate-icons.mts");
}

const SEED = "987654321";
const SIZE = 256;

function fail(message: string): never {
  console.error(`generate-icons: ${message}`);
  process.exit(1);
}

function unwrap<T, E>(
  result: { ok: true; value: T } | { ok: false; error: E },
  what: string,
): T {
  if (!result.ok) {
    fail(`${what}: ${JSON.stringify(result)}`);
  }
  return result.value;
}

function renderIconTile(): RasterImage {
  const preset = PALETTE_PRESETS.find((p) => p.id === "primary");
  if (preset === undefined) {
    fail('palette preset "primary" not found');
  }
  const background = unwrap(hexToColor("#142850"), "background");
  const pattern = unwrap(
    generatePattern({
      algorithmVersion: PATTERN_ALGORITHM_VERSION,
      dimensions: { height: SIZE, width: SIZE },
      options: {},
      palette: { colors: preset.colors },
      parameters: {
        canvasHeight: SIZE,
        canvasWidth: SIZE,
        complexity: 3,
        density: 14,
        positionJitter: 0.15,
        primitiveType: "circle",
        rotationRange: Math.PI,
        scale: 0.75,
      },
      schemaVersion: SCHEMA_VERSION,
      seed: SEED,
    }),
    "generate",
  );
  return unwrap(
    renderTile(pattern.primitives, SIZE, SIZE, {
      background,
      foreground: preset.colors[0] ?? { a: 255, b: 0, g: 0, r: 0 },
    }),
    "render",
  );
}

/** Integer box-average downscale (SIZE must be divisible by target). */
function downscale(src: RasterImage, target: number): RasterImage {
  if (SIZE % target !== 0) {
    fail(`target ${target} must divide ${SIZE}`);
  }
  const box = SIZE / target;
  const data = new Uint8Array(target * target * 4);
  for (let y = 0; y < target; y += 1) {
    for (let x = 0; x < target; x += 1) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      for (let dy = 0; dy < box; dy += 1) {
        for (let dx = 0; dx < box; dx += 1) {
          const o = ((y * box + dy) * SIZE + (x * box + dx)) * 4;
          r += src.data[o] ?? 0;
          g += src.data[o + 1] ?? 0;
          b += src.data[o + 2] ?? 0;
          a += src.data[o + 3] ?? 0;
        }
      }
      const n = box * box;
      const o = (y * target + x) * 4;
      data[o] = Math.round(r / n);
      data[o + 1] = Math.round(g / n);
      data[o + 2] = Math.round(b / n);
      data[o + 3] = Math.round(a / n);
    }
  }
  return { data, height: target, width: target };
}

function toPngBytes(image: RasterImage, what: string): Uint8Array {
  return unwrap(encodePng(image), `png ${what}`);
}

/** ICO with PNG-compressed entries (Vista+ compatible). */
function toIco(
  entries: ReadonlyArray<{ png: Uint8Array; size: number }>,
): Uint8Array {
  const headerSize = 6 + entries.length * 16;
  const total = headerSize + entries.reduce((n, e) => n + e.png.length, 0);
  const out = new Uint8Array(total);
  const view = new DataView(out.buffer);
  view.setUint16(0, 0, true);
  view.setUint16(2, 1, true);
  view.setUint16(4, entries.length, true);
  let offset = headerSize;
  entries.forEach((entry, i) => {
    const o = 6 + i * 16;
    out[o] = entry.size >= 256 ? 0 : entry.size;
    out[o + 1] = entry.size >= 256 ? 0 : entry.size;
    out[o + 2] = 0;
    out[o + 3] = 0;
    view.setUint16(o + 4, 1, true);
    view.setUint16(o + 6, 32, true);
    view.setUint32(o + 8, entry.png.length, true);
    view.setUint32(o + 12, offset, true);
    out.set(entry.png, offset);
    offset += entry.png.length;
  });
  return out;
}

const tile = renderIconTile();
mkdirSync(ICONS_DIR, { recursive: true });

const png256 = toPngBytes(tile, "256");
const png128 = toPngBytes(downscale(tile, 128), "128");
const png64 = toPngBytes(downscale(tile, 64), "64");
const png32 = toPngBytes(downscale(tile, 32), "32");
const png16 = toPngBytes(downscale(tile, 16), "16");

writeFileSync(join(ICONS_DIR, "32x32.png"), png32);
writeFileSync(join(ICONS_DIR, "128x128.png"), png128);
writeFileSync(join(ICONS_DIR, "128x128@2x.png"), png256);
writeFileSync(
  join(ICONS_DIR, "icon.ico"),
  toIco([
    { png: png16, size: 16 },
    { png: png32, size: 32 },
    { png: png64, size: 64 },
    { png: png256, size: 256 },
  ]),
);

for (const [name, bytes] of [
  ["32x32.png", png32],
  ["128x128.png", png128],
  ["128x128@2x.png", png256],
] as const) {
  console.log(`${name}: ${bytes.length} bytes`);
}
console.log("icon.ico: done");
