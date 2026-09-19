# PatternForge Domain Model

## Status dan tujuan

Model di bawah adalah kontrak konseptual Phase 0. Ini bukan implementasi TypeScript. Nama field dapat disempurnakan pada fase implementasi, tetapi invariants dan arti datanya harus dipertahankan agar hasil reproducible.

Semua DTO yang melewati worker/Tauri boundary harus serializable, versioned, dan bebas dari object runtime seperti canvas context, file handle, stream, atau function.

## Entity dan value object

### `PatternDefinition`

Root input yang mendeskripsikan satu pattern yang dapat direproduksi.

```text
PatternDefinition {
  schemaVersion
  definitionId
  name?
  style: PatternStyle
  parameters: PatternParameters
  palette: ColorPalette
  tile: TileSettings
  seed: RandomSeed
}
```

Invariants:

- `schemaVersion` wajib diketahui oleh pipeline;
- `tile.width` dan `tile.height` integer positif dalam resource limit;
- `parameters` valid untuk `style` yang dipilih;
- palette memiliki warna yang valid;
- seed tidak boleh implicit/random kosong ketika generation diminta.

`definitionId` mengidentifikasi definisi, bukan output file. Name bersifat display-only dan tidak boleh mengubah hasil random.

### `PatternElement`

Satu primitive atau motif setelah placement procedural.

```text
PatternElement {
  elementId
  kind
  geometry
  transform
  appearance
  zIndex
  sourceRandomIndex?
}
```

- `kind` adalah union tertutup yang ditentukan engine, bukan kode yang dieksekusi dinamis.
- `geometry` hanya berisi data aman seperti radius, points, bounds, atau path schema tervalidasi.
- `transform` berisi posisi, scale, rotation, dan optional opacity.
- `appearance` merujuk pada warna/outline/width yang sudah tervalidasi.
- `zIndex` deterministic agar overlap konsisten.
- `sourceRandomIndex` opsional untuk diagnostik/replay, bukan sumber randomness baru.

### `PatternStyle`

Identifier style procedural yang didukung aplikasi, misalnya konsep `dots`, `geometric`, `organic`, atau style lain yang didaftarkan secara eksplisit. Style tidak boleh berupa string yang dipakai untuk lookup dan mengeksekusi kode arbitrer.

Setiap style memiliki schema parameter dan versi algoritme. Style baru harus memiliki seed behavior dan tileability contract yang terdokumentasi.

### `PatternParameters`

Parameter generator yang dikontrol user dan tervalidasi per style. Minimal mencakup konsep:

- jumlah/range elemen;
- ukuran atau scale;
- rotation/range transform;
- distribution atau density;
- variation yang diizinkan;
- style algorithm version.

Parameter harus berupa finite number/integer atau enum yang dikenal. NaN, infinity, nilai negatif yang tidak bermakna, dan objek tak dikenal ditolak. Parameter tidak menyimpan function atau expression string.

### `ColorPalette`

Kumpulan warna dan aturan pemilihannya.

```text
ColorPalette {
  paletteId?
  colors: ColorValue[]
  background?: ColorValue
  selectionMode
  colorSpace?
}
```

`ColorValue` harus canonical, misalnya RGBA integer/normalized values atau hex yang divalidasi. `selectionMode` adalah enum eksplisit seperti ordered, random, weighted, atau gradient bila didukung. Bobot harus finite dan deterministic.

Palette ID bersifat metadata. Mengubah nama/ID tanpa mengubah `colors` tidak boleh mengubah output.

### `RandomSeed`

Value object untuk reproducibility.

```text
RandomSeed {
  value: canonical string or unsigned integer
  algorithmVersion
}
```

Aturan:

- seed input harus dinormalisasi satu kali di boundary;
- representasi canonical tidak bergantung pada locale atau floating-point formatting;
- random generator domain tidak memakai `Math.random()`;
- derivasi batch memakai `(baseSeed, derivationNamespace/version, itemIndex)` dalam hash/derivation function yang terdokumentasi;
- perubahan algoritme PRNG/derivation menaikkan `algorithmVersion`;
- seed efektif dicatat pada setiap `GenerationResult`.

### `TileSettings`

Kontrak tileability dan output canvas.

```text
TileSettings {
  width
  height
  coordinateMode: "wrapped-modular"
  edgePolicy
  cornerPolicy
  pixelDensity?
}
```

`coordinateMode` Phase 0 default adalah wrapped/modular. `edgePolicy` dan `cornerPolicy` menyatakan bahwa elemen yang crossing boundary diduplikasi pada cell tetangga, bukan dihapus/di-clip sepihak. Pixel density hanya memengaruhi rasterization, bukan logical coordinates.

### `ExportSettings`

Konfigurasi satu output.

```text
ExportSettings {
  format
  quality?
  outputDirectory?
  filenameTemplate
  overwritePolicy
  colorProfile?
  includeMetadata?
}
```

- `format` adalah enum format yang benar-benar didukung;
- `filenameTemplate` adalah template terbatas dengan token yang dikenal, bukan expression/code;
- path akhir disusun oleh native adapter setelah validasi dan normalisasi;
- overwrite policy eksplisit (`fail`, `replace`, atau `unique` bila didukung);
- metadata tidak boleh menyertakan secret.

### `BatchJob`

Deskripsi pekerjaan batch yang dapat dipantau dan dibatalkan.

```text
BatchJob {
  jobId
  definition: PatternDefinition
  count
  baseSeed
  export: ExportSettings
  status
  createdAt?
  algorithmVersion
}
```

Status minimal: queued, running, cancelling, completed, cancelled, failed. `count` memiliki upper bound sebelum scheduler dibuat. Job tidak menyimpan pixel output; ia menyimpan definisi, policy, progress, dan summary.

`jobId` tidak boleh menjadi input random jika hasil harus reproducible lintas retry; gunakan `baseSeed`, `algorithmVersion`, dan index item sebagai derivation input. Job ID hanya untuk tracking, kecuali kontrak versi kelak menyatakan lain.

### `GenerationResult`

Hasil satu generation yang siap dipreview atau diteruskan ke export.

```text
GenerationResult {
  resultId
  definitionId
  effectiveSeed
  algorithmVersion
  width
  height
  tileable: true
  surfaceOrPrimitiveStream
  elementCount
  warnings[]
  stats
}
```

`surfaceOrPrimitiveStream` adalah representasi runtime yang tidak boleh dikirim sebagai JSON besar tanpa alasan. Pada worker boundary, gunakan transferable/stream contract yang ditentukan nanti. `tileable` hanya boleh `true` setelah pipeline tile-engine berhasil memenuhi invariants.

`stats` dapat memuat elapsed time, element count, dan byte estimate; jangan memasukkan data sensitif atau seluruh geometry jika tidak diperlukan.

## Relasi model

```text
PatternDefinition
  ├── PatternStyle
  ├── PatternParameters
  ├── ColorPalette
  ├── TileSettings
  └── RandomSeed

BatchJob
  ├── PatternDefinition
  ├── RandomSeed (base)
  └── ExportSettings

GenerationResult
  ├── effective RandomSeed
  ├── TileSettings-derived dimensions
  └── output surface/primitive stream
```

`ExportSettings` tidak berada di `PatternDefinition` karena definisi pattern seharusnya dapat dipreview dan diekspor berkali-kali dengan target berbeda.

## Invariants lintas domain

1. Input invalid ditolak sebelum worker mengalokasikan surface besar.
2. Satu tuple `(PatternDefinition, effectiveSeed, algorithmVersion)` harus menghasilkan output yang sama pada environment yang didukung, dengan toleransi rasterisasi yang terdokumentasi.
3. Urutan elemen, z-order, dan pemilihan palette deterministic.
4. `width`/`height` sama di seluruh pipeline; tidak ada silent resize.
5. Tile wrapping terjadi sebelum clipping viewport tile.
6. Batch item `i` tidak menggunakan random state item `i-1` secara mutable; seed item diturunkan secara eksplisit.
7. Export path dan filename tidak boleh datang dari kode yang dieksekusi atau template arbitrary.
8. Error/cancellation tidak menghasilkan `GenerationResult` sukses palsu.

## Serialization dan versioning

- DTO memiliki `schemaVersion` atau version pada root yang relevan.
- Tambah field harus backward-compatible bila memungkinkan; perubahan semantik menaikkan versi.
- Tidak menyimpan class instance, Date implicit, Map/Set, function, atau binary buffer besar dalam definisi yang dipersist.
- Seed, color, coordinate, dan angle memiliki format canonical yang ditentukan sebelum implementasi.

## Yang belum diputuskan pada Phase 0

- daftar final `PatternStyle`;
- daftar final export formats;
- representasi surface (Canvas/ImageData/typed buffer/primitive stream);
- angka resource limits default;
- format file project/preset persistence.

Keputusan tersebut tidak boleh mengubah prinsip invariants di atas.

## Phase 1 and Phase 2 Foundation

Phase 1 menyediakan public type foundation di `packages/core` dan primitive serializable di `packages/shared`. Phase 2 menambahkan behavior deterministic yang tetap bebas dari rendering:

- `PatternDefinition`, `PatternParameters`, `PatternElement`, `PatternStyle`, `ColorPalette`, `TileSettings`, `ExportSettings`, `BatchJob`, dan `GenerationResult` tersedia sebagai domain contracts;
- `Seed`, `AlgorithmVersion`, `SchemaVersion`, `PackageVersion`, ID brands, `Result`, `FoundationError`, dan `CancellationSignal` tersedia di shared;
- `Point`, `Size`, `Rect`, dan radian-based `Transform` tersedia sebagai geometry data;
- `Circle`, `Rectangle`, `Ellipse`, `Line`, dan `Polygon` tersedia sebagai discriminated data-only primitives;
- `validatePatternParameters` menolak nilai non-finite, out-of-range, dan primitive type yang tidak dikenal;
- `GenerationResult` menyimpan effective seed, algorithm/schema version, bounded primitive list, deterministic result ID, dan primitive count;
- canonical seed dan PRNG runtime berada di `pattern-engine`, bukan di UI atau Tauri;
- domain types tidak menyimpan canvas context, file handle, stream, function, pixel buffer, atau executable expression.

Seed numeric dan numeric string dinormalisasi ke decimal unsigned uint32. Generation algorithm saat ini `pattern-v1`, PRNG algorithm `prng-v1`, dan schema `schema-v1`. Structured output belum mengklaim pixel-level tileability.

## Phase 3 Renderer Model

Phase 3 menambahkan raster contracts di `packages/renderer-engine` tanpa mengubah domain types Phase 2:

- `RgbaColor { r, g, b, a }` dengan setiap channel integer 0..255; divalidasi via `validateColor`.
- `RasterImage { width, height, data: Uint8Array }` dengan `width * height * 4` bytes, channel order RGBA, alpha 0..255, origin top-left (0,0), x ke kanan, y ke bawah, pixel `(x,y)` mencakup `[x,x+1) x [y,y+1)` dengan sampling di pusat `(x+0.5,y+0.5)`, row stride `width * 4`, row-major tanpa padding. Tidak ada floating-point pixel buffer.
- `RenderSettings { background, foreground }` untuk solid background dan single foreground color. Phase 3 tidak membuat color palette generator.
- `RenderError` dengan codes `INVALID_DIMENSIONS`, `INVALID_COLOR`, `INVALID_PRIMITIVE`, `RENDER_LIMIT_EXCEEDED`, `CANCELLED`, dikembalikan sebagai `Result<T,E>`.
- `renderPattern`, `renderTile`, `renderPrimitive`, `createRasterImage`, `composePreviewGrid` sebagai public type-safe API.
- Opacity 0..1 dikonversi via `round(opacity * 255)` lalu compositing "over" integer yang terdokumentasi di `color.ts`. Untuk opaque destination: `outC = round((srcC*srcA + dstC*(255-srcA))/255)`, `outA = 255`.
- Transform dihormati: `x`, `y` sebagai pusat, `rotation` radians (cos/sin dengan y-down, positif tampak clockwise), `scale` (0..1] sebagai pengali geometry efektif (`radius*scale`, `width*scale`, dst.).
- `GenerationResult` tetap data-only; pixel-level tileability diklaim oleh `renderTile` + `validateTileSeamless`, bukan oleh generator.
- Tidak ada PNG/JPEG/SVG, filesystem, batch, AI, network, atau database types baru.

## Phase 4 Color Model and Generation Config

### Color model

- `RgbaColor { r, g, b, a }` typed numerik di `@patternforge/core`; setiap channel integer 0..255. Inilah representasi canonical; string CSS/hex tidak pernah canonical.
- Helpers: `isRgbaColor`, `validateRgbaColor`, `normalizeColor` (round+clamp), `colorsEqual`, `colorToHex` (`#rrggbb` opaque, `#rrggbbaa` transparan), `hexToColor` (`#rgb`/`#rrggbb`/`#rrggbbaa`, `#` opsional), `rgbaToCss` (display-only adapter).
- `renderer-engine` memakai ulang implementasi core (re-export) agar satu sumber kebenaran; `validateColor` renderer (bertipe `RenderError`) tetap untuk settings.

### Palette

- `Palette { colors: readonly RgbaColor[] }`, non-empty, bounded `MAX_PALETTE_COLORS = 32`, divalidasi via `validatePalette` (`INVALID_PALETTE`).
- Preset UI deterministik: Mono, Primary, Sunset, Forest + Custom (daftar hex). Preset id hanya metadata; output hanya bergantung pada `colors`.

### Background

- `backgroundColor: RgbaColor` bagian dari `GenerationConfig`; default putih opaque. Divalidasi, dirender sebagai full-raster background, termasuk dalam checksum FNV-1a.

### Primitive colors

- `PatternPrimitiveBase.color?: RgbaColor` (opsional → backward-compatible dengan Phase 2/3).
- Generator: bila palette diberikan, warna dipilih via `rng.pick(palette.colors)` sebagai konsumsi RNG TERAKHIR per primitive; tanpa palette tidak ada draw tambahan (stream prefix identik).
- Renderer: fill per primitive = `primitive.color ?? foreground`.

### GenerationConfig

- `GenerationConfig { seed, width, height, density, scale, complexity, rotationRange (radians), positionJitter, primitiveType, palette, backgroundColor }` + `validateGenerationConfig` (codes `INVALID_SEED/WIDTH/HEIGHT/DENSITY/SCALE/COMPLEXITY/ROTATION/POSITION_JITTER/PRIMITIVE_TYPE/PALETTE/BACKGROUND`).
- UI memakai derajat (0–360) dan mengkonversi via `degreesToRadians`; core selalu radians (`radiansToDegrees` untuk display).

### Scale semantics (single source of truth)

- Masalah Phase 3: generator memanggang `scale` ke geometry (`size = min * base.scale * 0.05`) DAN renderer mengalikan lagi (`effective = geometry * scale`) → scale ter-apply dua kali.
- Keputusan Phase 4: generator memancarkan base geometry scale-independent (`size = min * 0.05`); renderer satu-satunya penerap (`effective = geometry * primitive.scale`). Variasi per-primitive (`scale * (0.75+rng*0.5)`, urutan RNG tak berubah) di-clamp ke (0, 1] agar config scale=1 tetap renderable.
- Kompatibilitas: prefix stream RNG identik (posisi/rotasi sama); golden Phase 3 `a319b114` lestari karena fixture 1-pikselnya tidak berubah (radius 0.215px → 0.476px menutupi pusat piksel yang sama, fill tetap BLACK).

## Final release models (Phase 5–22)

### Export

- `ExportFormat = png | jpeg | svg`; `ExportConfig { format, quality (JPEG 1–100, default 90), filename, background }` + `validateExportConfig`.
- `EncodedFile { bytes, filename, mimeType, format, width, height }`; errors `INVALID_FORMAT/QUALITY/FILENAME/COLOR`, `RENDER_LIMIT_EXCEEDED`, `ENCODE_FAILED`, `FILESYSTEM_ERROR`, `CANCELLED`.
- Filenames: allowlist `[A-Za-z0-9._-]`, traversal/separator/leading-dot rejected, max 100 chars; deterministic `patternforge-{seed}-{w}x{h}[-{index}].{ext}`.
- `FileSink { writeFile(filename, bytes) }`; atomicity = temp + rename (native) dengan fallback download yang terdokumentasi.

### Batch

- `BatchRequest { baseConfig, count 1–100, startSeed, format, quality }`; seed derivation `(start+index) mod 2^32` sebagai canonical string.
- `BatchItemResult { index, seed, filename?, checksum?, byteCount?, error? }`; `BatchSummary { total, succeeded, failed, cancelled, results }`; concurrency tetap 1.

### Presets, history, templates, project

- `Preset { schemaVersion: preset-v1, name ≤60 chars, config }` + CRUD/duplicate/rename/delete + migrasi legacy tanpa versi.
- `HistoryEntry { checksum, seed, summary, createdAt }` (timestamp metadata UI saja), bounded 50, newest-first.
- `BuiltinTemplate { id, name, description, config }` × 10; template = config tetap, tanpa output.
- `ProjectFile { app: patternforge, schemaVersion: project-v1, config }` sebagai JSON `.patternforge`; selalu divalidasi saat open.

### AI intent

- `PatternIntent` (semua field opsional: primitiveType, density, scale, rotationDegrees, complexity, positionJitter, paletteHex, backgroundHex) → `intentToGenerationConfig` dengan validasi penuh; invalid = reject, tidak dinormalisasi diam-diam.
