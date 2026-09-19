import { err, ok } from "@patternforge/shared";
import {
  RENDER_MAX_BYTES,
  RENDER_MAX_DIMENSION,
  RENDER_MAX_PIXELS,
  type RasterImage,
  type RenderCancellationSignal,
} from "@patternforge/renderer-engine";

import { adler32, crc32 } from "./crc";
import type { ExportResult } from "./types";

/**
 * Minimal deterministic PNG encoder (RGBA, 8-bit, non-interlaced).
 *
 * No compression library: the IDAT zlib stream uses stored (uncompressed)
 * DEFLATE blocks, which are fully valid and byte-deterministic. Output is
 * larger than Huffman-coded PNGs but bounded: raw + ~5 bytes per 64 KiB
 * block + fixed headers (~57 bytes + 12 per chunk).
 */

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const MAX_STORED_BLOCK = 65_535;
const CANCEL_CHECK_ROWS = 64;

function writeU32BE(target: number[], value: number): void {
  target.push(
    (value >>> 24) & 0xff,
    (value >>> 16) & 0xff,
    (value >>> 8) & 0xff,
    value & 0xff,
  );
}

function writeChunk(
  out: number[],
  type: string,
  data: Uint8Array | number[],
): void {
  // NB: never spread-push large arrays (call-stack overflow past ~100 KiB);
  // push in bounded chunks and build the CRC input with .set instead.
  const bytes = data instanceof Uint8Array ? data : Uint8Array.from(data);
  const typeBytes = [
    type.charCodeAt(0) ?? 0,
    type.charCodeAt(1) ?? 0,
    type.charCodeAt(2) ?? 0,
    type.charCodeAt(3) ?? 0,
  ];
  writeU32BE(out, bytes.length);
  for (const b of typeBytes) {
    out.push(b);
  }
  const PUSH_CHUNK = 8192;
  for (let i = 0; i < bytes.length; i += PUSH_CHUNK) {
    out.push(...bytes.subarray(i, i + PUSH_CHUNK));
  }
  const crcInput = new Uint8Array(4 + bytes.length);
  crcInput.set(typeBytes, 0);
  crcInput.set(bytes, 4);
  writeU32BE(out, crc32(crcInput));
}

function checkCancelled(signal: RenderCancellationSignal | undefined): boolean {
  return signal?.isCancelled() === true;
}

/** Encode raw filtered scanlines (filter 0) through stored DEFLATE blocks. */
function zlibStored(raw: Uint8Array): number[] {
  const out: number[] = [0x78, 0x01];
  let offset = 0;
  while (offset < raw.length) {
    const remaining = raw.length - offset;
    const size = Math.min(remaining, MAX_STORED_BLOCK);
    const final = offset + size >= raw.length ? 1 : 0;
    out.push(final & 0x01);
    out.push(size & 0xff, (size >>> 8) & 0xff);
    const nlen = 65_535 - size;
    out.push(nlen & 0xff, (nlen >>> 8) & 0xff);
    for (let i = 0; i < size; i += 1) {
      out.push(raw[offset + i] ?? 0);
    }
    offset += size;
  }
  const adler = adler32(raw);
  out.push(
    (adler >>> 24) & 0xff,
    (adler >>> 16) & 0xff,
    (adler >>> 8) & 0xff,
    adler & 0xff,
  );
  return out;
}

export function encodePng(
  image: RasterImage,
  signal?: RenderCancellationSignal,
): ExportResult<Uint8Array> {
  const { width, height, data } = image;
  if (
    !Number.isSafeInteger(width) ||
    !Number.isSafeInteger(height) ||
    width <= 0 ||
    height <= 0 ||
    width > RENDER_MAX_DIMENSION ||
    height > RENDER_MAX_DIMENSION ||
    data.length !== width * height * 4
  ) {
    return err({
      code: "RENDER_LIMIT_EXCEEDED",
      message: "Image dimensions are invalid or exceed renderer limits.",
    });
  }
  const pixels = width * height;
  if (
    !Number.isSafeInteger(pixels) ||
    pixels > RENDER_MAX_PIXELS ||
    pixels * 4 > RENDER_MAX_BYTES
  ) {
    return err({
      code: "RENDER_LIMIT_EXCEEDED",
      message: "Image exceeds renderer memory limits.",
    });
  }

  const stride = width * 4;
  const raw = new Uint8Array(height * (stride + 1));
  for (let y = 0; y < height; y += 1) {
    if (y % CANCEL_CHECK_ROWS === 0 && checkCancelled(signal)) {
      return err({ code: "CANCELLED", message: "PNG encoding cancelled." });
    }
    raw[y * (stride + 1)] = 0;
    raw.set(data.subarray(y * stride, (y + 1) * stride), y * (stride + 1) + 1);
  }
  if (checkCancelled(signal)) {
    return err({ code: "CANCELLED", message: "PNG encoding cancelled." });
  }

  const out: number[] = [...PNG_SIGNATURE];
  const ihdr = [
    (width >>> 24) & 0xff,
    (width >>> 16) & 0xff,
    (width >>> 8) & 0xff,
    width & 0xff,
    (height >>> 24) & 0xff,
    (height >>> 16) & 0xff,
    (height >>> 8) & 0xff,
    height & 0xff,
    8,
    6,
    0,
    0,
    0,
  ];
  writeChunk(out, "IHDR", ihdr);
  writeChunk(out, "IDAT", zlibStored(raw));
  writeChunk(out, "IEND", []);
  return ok(new Uint8Array(out));
}
