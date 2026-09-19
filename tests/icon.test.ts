import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * Tauri icon validity gate (Phase J). The files in
 * apps/desktop/src-tauri/icons/ must be real, correctly-sized images —
 * never fake placeholders. Regenerate deterministically with:
 * `node scripts/generate-icons.mts` (see the script header for the recipe).
 */
const ICONS_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "apps",
  "desktop",
  "src-tauri",
  "icons",
);

function readIcon(name: string): Buffer {
  return readFileSync(join(ICONS_DIR, name));
}

function pngDimensions(bytes: Buffer): { height: number; width: number } {
  return { height: bytes.readUInt32BE(20), width: bytes.readUInt32BE(16) };
}

describe("tauri icons", () => {
  it("ships required PNGs with valid headers and dimensions", () => {
    const expectations = [
      ["32x32.png", 32],
      ["128x128.png", 128],
      ["128x128@2x.png", 256],
    ] as const;
    for (const [name, size] of expectations) {
      const bytes = readIcon(name);
      expect(bytes.length).toBeGreaterThan(100);
      expect([bytes[0], bytes[1], bytes[2], bytes[3]]).toEqual([
        0x89, 0x50, 0x4e, 0x47,
      ]);
      expect(pngDimensions(bytes)).toEqual({ height: size, width: size });
    }
  });

  it("ships a valid ICO with 16/32/64/256 entries", () => {
    const ico = readIcon("icon.ico");
    expect(ico.readUInt16LE(0)).toBe(0);
    expect(ico.readUInt16LE(2)).toBe(1);
    const count = ico.readUInt16LE(4);
    expect(count).toBe(4);
    const sizes = new Set<number>();
    for (let i = 0; i < count; i += 1) {
      const o = 6 + i * 16;
      const w = ico[o] === 0 ? 256 : (ico[o] ?? 0);
      const h = ico[o + 1] === 0 ? 256 : (ico[o + 1] ?? 0);
      expect(w).toBe(h);
      sizes.add(w);
      const size = ico.readUInt32LE(o + 8);
      const offset = ico.readUInt32LE(o + 12);
      expect(size).toBeGreaterThan(100);
      expect(offset + size).toBeLessThanOrEqual(ico.length);
      // PNG-compressed entry.
      expect([ico[offset], ico[offset + 1]]).toEqual([0x89, 0x50]);
    }
    expect(sizes).toEqual(new Set([16, 32, 64, 256]));
  });
});
