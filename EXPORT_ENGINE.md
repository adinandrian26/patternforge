# PatternForge Export Engine

`@patternforge/export-engine` mengubah pattern/raster menjadi file
(PNG/JPEG/SVG) yang siap ditulis via `FileSink`. Core export
browser-independent; filesystem hanya lewat adapter.

## Pipeline

```text
Pattern (GenerationResult)
  |            \
  | SVG         \ Raster (renderTile)
  v              v
serializeSvg   exportRaster (PNG/JPEG)
  |              |
  v              v
EncodedFile { bytes, filename, mimeType, format, width, height }
  |
  v
FileSink.writeFile (atomic native / download fallback / memory in tests)
```

## PNG

Encoder deterministik tanpa dependensi: signature 8-byte, IHDR
(RGBA 8-bit non-interlaced), IDAT tunggal berisi stream zlib dengan
**stored (uncompressed) DEFLATE blocks**, IEND; CRC-32 per chunk,
Adler-32 untuk zlib. Output lebih besar dari PNG terkompresi tetapi
bounded (raw + ~5 B per blok 64 KiB + header) dan byte-identik untuk
input identik. Round-trip diuji dengan inflate manual di tests.

## JPEG

Via dependensi kecil `jpeg-js` (pure JS, deterministik untuk input +
quality sama). RGBA di-composite di atas background config menjadi
opaque dulu — tidak ada ambiguitas alpha. Quality integer 1–100,
default 90; format lain mengabaikannya. Output lossy: tes memakai
marker SOI/EOI + decode-dims + kemiripan piksel, bukan equality.

## SVG

Serializer vektor asli: `<circle>/<rect>/<ellipse>/<line>/<polygon>`
dengan `transform="translate rotate(deg) scale"`, fill hex, opacity,
background rect, dan 9 translated copies dalam `<g clip-path>`
terhadap rect tile. Angka locale-free (≤3 desimal). Keamanan: tanpa
`<script>`, tanpa event handlers, tanpa URL/`http`/eksternal
(kecuali deklarasi namespace `xmlns` yang wajib) — ditegakkan oleh
tes untuk semua template.

## Filenames

Allowlist `[A-Za-z0-9._-]`, traversal (`..`), separator, dan leading
dot ditolak; maks 100 chars; ekstensi dipetakan (`jpg` untuk JPEG);
default deterministik `patternforge-{seed}-{w}x{h}[-{index}].{ext}`.

## Limits & cancellation

Input raster divalidasi terhadap limit renderer sebelum encode;
`MAX_EXPORT_BYTES` menjaga payload. Checkpoint cancellation per 64
baris (PNG) dan pre/post encode (JPEG), per-item (batch).

## Errors

`INVALID_FORMAT/QUALITY/FILENAME/COLOR`, `RENDER_LIMIT_EXCEEDED`,
`ENCODE_FAILED`, `FILESYSTEM_ERROR`, `CANCELLED` — semua typed
`Result`, user-friendly di UI.
