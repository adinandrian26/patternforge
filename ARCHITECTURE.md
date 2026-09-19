# PatternForge Architecture

## Status dokumen

Dokumen ini mendeskripsikan arsitektur Phase 0 dan foundation Phase 1 untuk **PatternForge**, aplikasi desktop local-first untuk membuat seamless pattern procedural/non-AI. Phase 1 hanya menambahkan workspace, toolchain, desktop shell, type foundation, dan placeholder UI; generator, renderer, export, serta batch runtime tetap belum diimplementasikan.

## Tujuan dan prinsip

PatternForge harus:

- berjalan lokal tanpa backend, akun, API key, atau layanan cloud;
- menghasilkan pattern procedural yang ringan, cepat, dan reproducible;
- menggunakan random seed sebagai bagian dari input yang dapat disimpan dan dibagikan;
- menghasilkan tile yang kontinuitas tepi dan sudutnya terjamin secara algoritmik;
- mendukung batch generation dengan penggunaan RAM yang bounded;
- menjaga UI tetap responsif melalui worker/asynchronous pipeline;
- memungkinkan pembatalan pada operasi generation, export, dan batch jika checkpoint tersedia;
- tidak menggunakan `eval()`, `Function()`, browser automation, atau eksekusi kode dinamis;
- menyisakan extension point untuk provider AI opsional tanpa menjadikan AI dependency core.

## 1. Desktop architecture

PatternForge menggunakan Tauri v2 sebagai desktop shell:

```text
+---------------------------------------------------------------+
| Tauri v2 desktop shell                                        |
|                                                               |
|  Native adapter (Rust/Tauri commands)                         |
|  - file dialogs                                                |
|  - bounded filesystem write                                    |
|  - capability/permission boundary                              |
|  - window lifecycle                                             |
|                                                               |
|  +---------------------------------------------------------+  |
|  | Preact + Vite frontend                                  |  |
|  | - presentation/state                                    |  |
|  | - command dispatch                                      |  |
|  | - preview surface                                       |  |
|  +-------------------------+-------------------------------+  |
|                            | worker/message boundary          |
|  +-------------------------v-------------------------------+  |
|  | TypeScript domain and engine packages                   |  |
|  | core, pattern, color, tile, export, batch, shared, ui  |  |
|  +---------------------------------------------------------+  |
+---------------------------------------------------------------+
```

Tauri hanya menjadi shell dan native capability boundary. Domain generation tetap berada pada package TypeScript agar dapat diuji secara deterministik dan tidak tercampur dengan detail platform. Tidak ada server lokal yang wajib dijalankan.

### Runtime placement

- **UI thread:** render Preact, input pengguna, progress, status, dan preview presentation.
- **Generation worker:** menjalankan pipeline CPU-bound untuk preview/batch sehingga tidak memblokir UI.
- **Tauri native adapter:** membuka dialog, memvalidasi target path, dan melakukan write file secara aman/atomik. Adapter ini tidak membuat keputusan pattern.
- **Core/engine packages:** pure atau hampir pure TypeScript dengan kontrak serializable.

Untuk pekerjaan kecil, preview boleh menggunakan jalur synchronous yang sangat singkat hanya setelah ukuran input dibatasi. Jalur default untuk generate/export/batch tetap asynchronous.

## 2. Frontend/core separation

### Frontend bertanggung jawab atas

- form editor untuk `PatternDefinition`;
- pemilihan seed, style, ukuran tile, palette, dan export settings;
- render preview dan progress;
- pengiriman command dan penerimaan event hasil/progress/error;
- lifecycle worker dan cancellation intent;
- pemilihan lokasi output melalui capability Tauri.

### Core dan engine bertanggung jawab atas

- validasi invariants domain;
- normalisasi seed dan deterministic random stream;
- perhitungan elemen pattern;
- transformasi wrapped/modular coordinates;
- konstruksi tileable output;
- kontrak export dan batch;
- error terstruktur dan checkpoint cancellation.

Frontend tidak boleh mengulang logika random, tile wrapping, atau perhitungan export. Dengan demikian preview, export tunggal, dan setiap item batch menggunakan jalur domain yang sama.

## 3. Package responsibilities

```text
apps/
  desktop/                 # Tauri v2 + Vite + Preact composition root
packages/
  shared/                  # primitive types, Result, errors, serialization rules
  core/                    # domain model, use-case ports, policies, seed contract
  pattern-engine/          # procedural placement and element generation
  color-engine/            # palette validation, color selection/transforms
  tile-engine/             # wrapped coordinates and edge/corner continuity
  export-engine/           # format-independent export orchestration and codecs ports
  batch-engine/            # bounded sequential job scheduling and progress
  ui/                      # reusable Preact presentation components/contracts
```

### Dependency direction

```text
shared  <- core
shared  <- pattern-engine, color-engine, tile-engine, export-engine
core    <- pattern-engine, color-engine, tile-engine, export-engine
core + pattern/color/tile/export <- batch-engine
core + ui + batch/use-case adapters <- apps/desktop
```

- `shared` tidak boleh mengimpor package bisnis.
- `core` tidak mengimpor Preact, Tauri, DOM, atau filesystem.
- `pattern-engine`, `color-engine`, dan `tile-engine` tidak boleh mengakses UI atau filesystem.
- `export-engine` menerima data/render surface melalui port; detail write path berada di adapter desktop.
- `batch-engine` mengorkestrasi, bukan menggandakan algoritme generator.
- `ui` berisi presentational components dan state contracts, bukan aturan domain.
- `apps/desktop` adalah composition root dan satu-satunya tempat yang menggabungkan platform adapter.

Import cycle antar package tidak diperbolehkan. Kontrak lintas boundary harus berupa data serializable atau port eksplisit.

## 4. Data flow

```text
User input
   |
   v
Preact form/state
   |
   v
PatternDefinition + command
   |
   v
core validation and normalized seed
   |
   v
worker message boundary
   |
   +--> pattern-engine: element placement
   +--> color-engine: color resolution
   +--> tile-engine: wrapped tile construction
   |
   v
GenerationResult / preview surface
   |
   +--> UI preview
   +--> export-engine --> native write adapter
   +--> batch-engine --> sequential export loop
```

Semua command yang menghasilkan output harus membawa versi schema dan seed yang sudah dinormalisasi. Hasil harus memuat seed efektif, ukuran tile, dan metadata yang cukup untuk reproduksi.

## 5. Pattern generation pipeline

Pipeline konseptual untuk satu generation:

1. Terima `PatternDefinition` dan `RandomSeed`.
2. Validasi ukuran, parameter, palette, style, jumlah elemen, dan batas resource.
3. Normalisasi seed dengan format integer/string canonical yang konsisten lintas platform.
4. Inisialisasi deterministic random stream; jangan gunakan `Math.random()` sebagai sumber domain.
5. Bangun daftar `PatternElement` pada coordinate space tile atau extended render area.
6. Ambil warna melalui `color-engine` berdasarkan palette dan random stream turunan.
7. Kirim elemen ke `tile-engine` untuk wrapping/duplication di batas tile.
8. Render ke surface internal atau stream primitive terurut.
9. Kembalikan `GenerationResult` dan metadata diagnostik yang aman.
10. Beri checkpoint cancellation di antara tahapan mahal.

Random stream harus memiliki derivasi stabil, misalnya berdasarkan `baseSeed`, `itemIndex`, dan namespace pipeline. Perubahan urutan pemanggilan random perlu dianggap sebagai perubahan versi algoritme karena dapat mengubah reproducibility.

## 6. Tile/seamless pipeline

`tile-engine` menerima `canvasWidth`, `canvasHeight`, pattern elements, dan seed/placement hasil domain. Fondasi utama adalah wrapped/modular coordinates:

- setiap posisi dinormalisasi ke domain `[0, W)` dan `[0, H)`;
- elemen yang melintasi batas tidak dipotong sepihak;
- salinan elemen dibuat pada sel tetangga yang relevan (`-W`, `0`, `+W` dan `-H`, `0`, `+H`);
- render ke tile hanya mengambil irisan yang berada di viewport tile;
- bentuk fungsi yang dihasilkan ekuivalen dengan `f(x, y) = f(x mod W, y mod H)`.

Corner continuity terjadi otomatis karena wrapping dilakukan pada kedua sumbu, bukan hanya pada satu edge. Detail matematis, strategi alternatif, dan acceptance checks ada di `SEAMLESS_ALGORITHM.md`.

## 7. Export pipeline

Export dipisahkan dari generation:

1. `export-engine` memvalidasi `ExportSettings` dan kompatibilitas format.
2. Generator menghasilkan satu `GenerationResult` atau render stream.
3. Encoder menulis chunk/scanline/primitive secara incremental bila format memungkinkan.
4. Native adapter menulis ke temporary file pada direktori target.
5. Setelah encoder sukses dan flush selesai, temporary file di-rename secara atomik.
6. Cancellation menghapus temporary file dan tidak mengekspos file setengah jadi.
7. Error dikembalikan sebagai error code terstruktur, bukan stack trace mentah ke UI.

Export tidak boleh mengumpulkan seluruh batch dalam memory. Untuk format raster, desain default adalah satu item selesai -> encode -> write -> release surface -> lanjut item berikutnya. Untuk format yang memerlukan buffer penuh, ukuran tetap dibatasi oleh policy.

## 8. Batch pipeline

`batch-engine` menerima `BatchJob` dan menjalankan item secara sequential atau dengan concurrency kecil yang eksplisit. Default Phase 0 adalah sequential agar memory bound mudah dibuktikan:

```text
BatchJob
  -> validate global limits
  -> for itemIndex 0..count-1:
       derive deterministic item seed
       generate one item
       export one item
       emit progress
       release buffers
       check cancellation
  -> complete summary
```

Tidak ada `Promise.all()` atas seluruh batch. Jika concurrency ditambahkan pada fase berikutnya, harus memiliki semaphore, memory budget, backpressure, dan pengukuran peak memory. Nama file dan seed item harus deterministic serta collision-safe.

## 9. Error handling

Error domain menggunakan kategori stabil, misalnya:

- `INVALID_DEFINITION`: schema/parameter tidak valid;
- `RESOURCE_LIMIT`: dimensi, jumlah elemen, atau batch melebihi policy;
- `UNSUPPORTED_FORMAT`: export format tidak tersedia;
- `OUTPUT_ACCESS_DENIED`: native write/dialog gagal;
- `ENCODE_FAILED`: encoder gagal;
- `CANCELLED`: pengguna membatalkan operasi;
- `INTERNAL_FAILURE`: invariant internal gagal.

Setiap error dapat memiliki `code`, `message` yang aman untuk user, `operationId`, dan `details` yang tidak mengandung secret/path sensitif berlebihan. UI harus membedakan cancellation dari failure biasa. Error boundary Preact mencegah satu preview merusak seluruh window.

## 10. Cancellation model

Cancellation bersifat cooperative:

- UI membuat `operationId` dan mengirim `cancel(operationId)`;
- worker memiliki cancellation token/flag yang dibaca pada checkpoint;
- checkpoint minimal berada setelah validasi, setiap fase engine besar, setiap chunk export, dan setiap item batch;
- native write adapter membatalkan sebelum commit/rename bila memungkinkan;
- hasil partial tidak dipublikasikan sebagai sukses;
- cancellation bersifat idempotent dan operasi yang sudah selesai tidak diubah menjadi gagal.

Tauri command tidak boleh memaksa termination yang meninggalkan temporary file tanpa cleanup. Jika force termination diperlukan di masa depan, recovery scan untuk temporary files harus dirancang terlebih dahulu.

## 11. Memory management

- Gunakan satu render surface aktif per item pada default batch path.
- Lepaskan reference ke geometry, pixel buffer, dan encoded chunk segera setelah tahap selesai.
- Hindari menyimpan `GenerationResult` penuh untuk semua item; simpan summary dan path output.
- Terapkan limit dimensi, jumlah elemen, bytes per pixel, batch count, dan ukuran output sebelum memulai.
- Gunakan streaming/sequential export dan backpressure antara encoder dan writer.
- Preview boleh menggunakan resolusi/downsampling yang lebih kecil daripada export final, tetapi seed dan parameter harus sama.
- Progress/status memakai metadata kecil, bukan salinan pixel buffer.
- Ukuran memory budget harus menjadi policy terukur pada fase implementasi, bukan angka tersebar di UI.

## 12. Future AI provider abstraction

AI bukan bagian dari core generator. Extension point masa depan hanya berupa port opsional, misalnya konsep `PatternProvider`:

- input/output menggunakan model domain yang tervalidasi;
- provider procedural tetap default dan tidak membutuhkan network;
- provider AI ditempatkan di package/adaptor terpisah;
- credential, network permission, retry, quota, dan privacy policy tidak boleh masuk ke `core`;
- output AI harus melalui validasi tileability, ukuran, format, dan reproducibility policy;
- jika provider AI tidak tersedia, procedural provider tetap berfungsi penuh.

Phase 0 tidak membuat provider, dependency AI, network client, atau API key flow.

## Phase 1 Foundation

Phase 1 mengimplementasikan fondasi tanpa mengaktifkan fitur generator:

- npm workspace untuk `apps/*` dan `packages/*`;
- Tauri v2 shell Rust minimal dengan capability core terbatas;
- Vite + Preact desktop UI placeholder;
- TypeScript strict, Biome, dan Vitest;
- public entry point untuk setiap package;
- shared type foundation untuk versioning, seed representation, Result/error, dan cancellation contract;
- core domain types tanpa runtime validation atau generation;
- package skeleton untuk seluruh engine.

Phase 1 tidak menambahkan network, filesystem export, shell command, image processing, worker runtime, PRNG, atau AI dependency.

## Phase 2 Foundation

Phase 2 menambahkan deterministic structured-data pipeline tanpa renderer:

```text
GenerationInput
  -> parameter/version validation
  -> canonical seed normalization
  -> Mulberry32 PRNG
  -> bounded primitive placement
  -> GenerationResult

GenerationResult
  -> tile-engine coordinate utilities only
  -> no canvas/image/export side effect
```

Keputusan teknis:

- seed canonical dibatasi ke unsigned uint32 dan disimpan sebagai decimal string;
- `prng-v1` menggunakan Mulberry32 dengan integer uint32 state;
- generation algorithm menggunakan `pattern-v1` dan schema menggunakan `schema-v1`;
- primitive IDs bersifat sequential dan deterministic (`primitive-000001`);
- parameter divalidasi sebelum allocation;
- generation dibatasi `MAX_PRIMITIVES = 10_000`;
- tile-engine menyediakan modulo coordinate dan sembilan offset tetangga, tetapi belum merender atau menggandakan primitive.

## Current feature boundary (updated Phase 3)

Yang sengaja belum ada:

- PNG/JPEG/SVG export dan filesystem export;
- batch scheduler runtime dan batch UI;
- provider AI, prompt-to-pattern, dan image-to-pattern;
- network, database, cloud service, stock metadata, dan marketplace integration;
- Tauri commands untuk filesystem.

## Phase 3 — Seamless renderer + live preview foundation

Phase 3 menambahkan `packages/renderer-engine` tanpa mengubah generator:

```text
Pattern Data (pattern-engine)
  |
  v
Renderer (renderer-engine: raster + primitive rasterization)
  |
  v
Raster Image (RGBA Uint8Array, in-memory only)
  |
  v
Tile Composer (renderer-engine: wrapped-center + 9 translated copies, 3x3 grid)
  |
  v
Preview (apps/desktop + ui: buffer -> canvas adapter, explicit Generate button)
```

### Package responsibilities (Phase 3 delta)

```text
apps/
  desktop/                 # Composition root + 3-panel live preview (Generate -> render -> 3x3 canvas)
packages/
  shared/                  # Unchanged foundation
  core/                    # Unchanged domain contracts
  pattern-engine/          # Unchanged deterministic generation
  color-engine/            # Still skeleton; no palette generator in Phase 3
  tile-engine/             # Unchanged math utilities (wrapCoordinate, neighbor translations)
  renderer-engine/         # NEW: raster image, color validation/blending, primitive
                           # rasterization, seamless tile rendering, 3x3 composition,
                           # pixel validation, FNV-1a checksum
  export-engine/           # Still skeleton; no encoder
  batch-engine/            # Still skeleton; no batch runtime
  ui/                      # AppShell 3-panel + PreviewCanvas display adapter (no domain logic)
```

### Dependency direction (Phase 3 delta)

```text
shared <- core <- pattern-engine
shared <- tile-engine
shared + core + tile-engine <- renderer-engine
core + pattern-engine + renderer-engine + ui <- apps/desktop
ui -> preact only (+ structural preview image type, no renderer import)
```

- `renderer-engine` tidak mengimpor UI, DOM, filesystem, atau network.
- `pattern-engine` tidak mengimpor `renderer-engine` (generator tetap data-only).
- UI hanya menampilkan hasil renderer via buffer->canvas adapter; tidak ada generation logic di canvas.
- Renderer tetap testable tanpa browser UI (Vitest node environment).

### Data flow (Phase 3)

```text
User input (seed, pattern, density, scale, width, height)
  |
  v
Generate button (explicit action, no per-keystroke heavy render)
  |
  v
pattern-engine: generatePattern (deterministic primitives)
  |
  v
renderer-engine: renderTile (wrapped-center + 9 copies, per-row cancellation)
  |
  v
renderer-engine: composePreviewGrid (3x3 exact repetition)
  |
  v
renderer-engine: validateTileSeamless (shift-invariance, tolerance 0)
  |
  v
UI: PreviewCanvas (putImageData) + Seamless PASS/FAIL + checksum
```

Pattern-engine sekarang menghasilkan structured primitive data saja. Renderer mengubah primitives menjadi pixels. Tile-engine math digunakan untuk wrapping. Phase berikutnya harus mempertahankan boundary ini dan tidak memindahkan rendering ke core generator.

## Phase 4 — Pattern controls + color system + interactive generation

Phase 4 mematuhi architectural rule: UI hanya mengubah configuration, bukan sumber kebenaran domain.

```text
Pattern Controls (UiFormState, degrees + hex strings)
  |
  v
Generation Config (validated GenerationConfig, radians + typed RGBA)
  |
  v
Pattern Generator (pattern-engine, deterministic + palette pick)
  |
  v
Pattern Data (GenerationResult, per-primitive colors)
  |
  v
Renderer Settings (background + foreground fallback)
  |
  v
Raster Renderer (renderer-engine, per-primitive color)
  |
  v
Preview (3x3 grid + seamless report + checksum)
```

### State separation

- `UiFormState` (raw form, `apps/desktop/src/config.ts`): seed string, numbers, rotation degrees, palette id + custom hex, background hex.
- `GenerationConfig` (`@patternforge/core`): tervalidasi, radians, typed RGBA/palette.
- `GenerationResult` / Pattern (`@patternforge/pattern-engine`): data deterministik.
- Render settings: `{ background, foreground }` diturunkan dari config (foreground = warna palette pertama sebagai fallback).
- `PreviewData` (`apps/desktop/src/pipeline.ts`): `{ tile, grid, pattern, seamless, checksum }`.
- Validation vs preview state tidak dicampur: config invalid menampilkan typed error tanpa render.

`config.ts` dan `pipeline.ts` murni (tanpa Preact/DOM/random) sehingga dapat diuji dari Vitest via relative import. Tidak ada state library baru; `useState` Preact yang sudah ada cukup.

### Dependency direction (Phase 4 delta)

```text
shared <- core (color system, palette, GenerationConfig added)
shared + core <- pattern-engine (palette input, deterministic colors)
shared + core + tile-engine <- renderer-engine (per-primitive color)
core + pattern-engine + renderer-engine <- apps/desktop (config + pipeline + App)
```

Tidak ada import cycle baru; generator dan renderer tetap bebas Preact/browser.

## Final release architecture (Phase 5–22)

```text
UI tabs (Preact, apps/desktop/src + sections/)
  |
  v
Application state (useState; UiFormState -> GenerationConfig -> PreviewData)
  |
  v
Orchestrators (config.ts, pipeline.ts, exporting.ts — pure, testable)
  |
  +--> Domain/Core (generation, colors, validation)
  +--> Generator (pattern-engine, deterministic)
  +--> Renderer (renderer-engine, browser-independent)
  +--> Exporter (export-engine: PNG/JPEG/SVG -> FileSink)
  |       |
  |       v
  |    Filesystem adapter (DesktopFileSink: Tauri dialog+fs temp+rename,
  |    fallback anchor download; MemoryFileSink in tests)
  +--> Batch (batch-engine: sequential runner, injected producer)
  +--> Library (presets/history/templates/project, injected storage)
  +--> AI (ai-provider: mock default; remote only on explicit configure+Analyze)
```

Dependency direction additions (no cycles):

```text
shared + core + renderer-engine + jpeg-js <- export-engine
shared + core + pattern-engine + export-engine <- batch-engine
shared + core <- library
shared + core <- ai-provider
apps/desktop <- all of the above (composition root only)
```

Export core, batch core, AI intent handling, and library stores are all
browser-independent; DOM/Tauri/localStorage appear only in desktop
adapters (`filesink.ts`, storage wiring, canvas display).
