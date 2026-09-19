import type { RasterImage } from "./types";

/**
 * Deterministic non-cryptographic checksum (FNV-1a, 32-bit) over the image
 * dimensions and pixel bytes. Intended ONLY for regression/golden tests to
 * detect future renderer changes. NOT a security feature.
 *
 * - Includes width and height (little-endian, 4 bytes each) followed by raw
 *   RGBA bytes.
 * - Returns 8 lowercase hex characters.
 * - Deterministic across runs for identical inputs; no randomness, no time.
 */
export function computeImageChecksum(image: RasterImage): string {
  let hash = 0x811c_9dc5;
  const mix = (byte: number): void => {
    hash ^= byte & 0xff;
    hash = Math.imul(hash, 0x0100_0193) >>> 0;
  };

  for (const byte of [image.width, image.height]) {
    mix(byte & 0xff);
    mix((byte >>> 8) & 0xff);
    mix((byte >>> 16) & 0xff);
    mix((byte >>> 24) & 0xff);
  }
  for (let i = 0; i < image.data.length; i += 1) {
    mix(image.data[i] ?? 0);
  }
  return hash.toString(16).padStart(8, "0");
}
