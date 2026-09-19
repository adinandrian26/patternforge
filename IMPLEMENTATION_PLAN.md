# PatternForge Implementation Plan

## Scope

Dokumen ini mengatur urutan implementasi PatternForge setelah Phase 0. Phase 0 menghasilkan arsitektur, kontrak, dan dokumentasi. Phase 1 menambahkan foundation workspace/toolchain dan desktop shell saja; generator, renderer, export runtime, dan batch runtime tetap belum dibuat.

## Phase 0 — Architecture and documentation

**Status: PASS setelah checklist validasi terpenuhi.**

Deliverables:

- `ARCHITECTURE.md` — desktop architecture, boundaries, data flow, pipelines, error/cancellation, memory, AI extension point;
- `DOMAIN_MODEL.md` — domain entities, value objects, invariants, serialization/versioning;
- `SEAMLESS_ALGORITHM.md` — wrapped/modular algorithm, edge/corner proof model, alternatives, validation;
- `PERFORMANCE.md` — worker, bounded batch, sequential/streaming export, deterministic performance strategy;
- `SECURITY.md` — local-first boundary, validation, no dynamic code, filesystem/native safety;
- monorepo directories sesuai package boundaries.

Exit criteria:

- package responsibility tidak tumpang tindih;
- domain model minimal terdokumentasi;
- wrapped/modular coordinates dipilih sebagai fondasi;
- batch memory strategy tidak menyimpan seluruh output;
- cancellation/error model jelas;
- security constraints eksplisit;
- tidak ada implementasi Phase 1 yang masuk tanpa persetujuan.

## Phase 1 — Workspace and executable shell

**Status: Foundation implemented; validation is reported separately.**

Delivered foundation:

- root npm workspace manifest untuk `apps/*` dan `packages/*`;
- package manifests dan public entry points minimal;
- Tauri v2 + Vite + TypeScript + Preact desktop shell;
- Biome configuration;
- Vitest configuration dan foundation smoke tests;
- shared/core domain type foundation;
- version metadata, Result/error abstraction, dan cancellation interface;
- minimal Tauri capability configuration tanpa filesystem, shell, atau network permission.

Deliberately excluded:

- worker runtime;
- PRNG/seed derivation;
- generator, renderer, exporter, batch runtime, dan AI provider.

Gate:

- `npm install` dan workspace resolution harus sukses;
- strict typecheck harus sukses;
- Biome lint dan format check harus sukses;
- Vitest harus menemukan dan menjalankan foundation tests;
- frontend desktop shell harus dapat dibuild;
- no-network dan no-unrestricted-filesystem default tetap berlaku.

## Phase 2 — Core contracts and deterministic seed

**Status: Implemented; validation reported in the Phase 2 report.**

Delivered:

- canonical unsigned uint32 seed normalization dari integer/numeric string;
- Mulberry32 `prng-v1` dengan uint32 state;
- `pattern-v1` dan `schema-v1` metadata;
- geometry types dan data-only primitive union;
- typed parameter validation;
- deterministic primitive placement dan sequential IDs;
- bounded generation dengan `MAX_PRIMITIVES = 10_000`;
- positive modular coordinate wrapping;
- nine neighbor translations untuk edge/corner foundation;
- reproducibility, boundary, range, property-style, dan limit tests.

Deliberately excluded:

- renderer, canvas, image buffer, export, batch runtime, AI provider, network, dan production UI.

Gate evidence:

- same input + seed + algorithm version menghasilkan structured output identical;
- invalid seed/parameter ditolak dengan typed error;
- primitive count dibatasi sebelum allocation loop;
- test suite mencakup seed boundaries, PRNG range, geometry, generation, wrapping, neighbors, dan limits.

Phase 2 berhenti pada structured deterministic data. Fase berikutnya tidak boleh mengubah generator menjadi UI atau renderer tanpa phase gate baru.

## Phase 3 — Seamless renderer + live tile preview foundation (EXECUTED)

Sesuai autonomous Phase 3 gate (menggantikan rencana awal pattern/color engines), yang telah dikerjakan:

- `packages/renderer-engine`: RGBA raster, validasi warna, integer "over" blending, rasterisasi Circle/Rectangle/Ellipse/Line/Polygon, transform x/y/rotation/scale, opacity, solid background;
- seamless tile rendering via wrapped-center + 9 translated copies (`dx/dy in {-1,0,1}`);
- 3x3 preview composition (exact repetition) + grid consistency validation;
- pixel validation horizontal/vertical/corner dengan toleransi 0 + FNV-1a golden checksum (`a319b114` untuk 32x32 seed 12345);
- typed errors, memory limits (2048px/axis, 4M pixels, 16MB), per-row cancellation;
- desktop UI 3-panel (Generator / 3x3 preview / Settings) dengan explicit Generate button, buffer->canvas adapter;
- 25 renderer tests (A–O + golden + errors/cancellation) + 20 tests Phase 0–2 (total 45 passed);
- `typecheck`, `lint`, `format:check`, `tests`, `build` PASS; native Tauri build tetap optional jika cargo belum tersedia.

Deliberately excluded (tetap berlaku): PNG/JPEG/SVG/filesystem export, batch runtime/UI, AI provider, prompt/image-to-pattern, cloud, database, network, stock metadata, marketplace.

Gate Phase 3:

- tidak ada `Math.random()`/`Date.now()`/random UUID pada renderer;
- same pattern + dimensions + settings menghasilkan pixel buffer identik;
- left/right, top/bottom, dan corner continuity teruji via shift-invariance exact;
- 3x3 composition teruji per-sel exact;
- invalid dimensions/colors/primitives ditolak dengan typed error sebelum alokasi besar;
- UI hanya preview foundation (tanpa export/batch/AI).

## Phase 4 — Pattern controls + color system + interactive generation (EXECUTED)

Yang telah dikerjakan:

- `GenerationConfig` typed + `validateGenerationConfig` di `@patternforge/core` (seed, width, height, density, scale, complexity, rotationRange radians, positionJitter, primitiveType, palette, backgroundColor);
- color model RGBA numerik + helpers (`isRgbaColor`, `validateRgbaColor`, `normalizeColor`, `colorsEqual`, `colorToHex`, `hexToColor`, `rgbaToCss` display-only) + `Palette` (1..32) + `validatePalette`;
- `PatternPrimitiveBase.color?` opsional; generator memilih warna deterministik via Mulberry32 sebagai draw terakhir per primitive; renderer memakai `primitive.color ?? foreground`;
- scale semantics fix: renderer satu-satunya sumber kebenaran; variasi per-primitive di-clamp (0, 1];
- golden Phase 3 lestari (`a319b114`) + fixture regresi multi-warna 64x64 baru (`473443c3`); resultId colorless tanpa segmen palette (format Phase 2/3);
- UI interaktif lengkap (seed+randomize, primitive, density, scale, rotation derajat, complexity, jitter, palette preset+custom, background, Generate) + `config.ts`/`pipeline.ts` murni dan testable;
- 34 tes Phase 4 (A–T + golden) + 45 tes lama (total 79 passed);
- `typecheck`, `lint`, `format:check`, `tests`, `build` PASS; native Tauri build tetap optional jika cargo belum tersedia.

Deliberately excluded (tetap berlaku): PNG/JPEG/SVG/filesystem export, batch runtime/UI, AI provider, prompt/image-to-pattern, cloud, database, network, stock metadata, marketplace, dan semua hal forbidden Phase 4.

Gate Phase 4:

- UI bukan sumber kebenaran domain (pipeline `UiFormState → GenerationConfig → Pattern → RenderSettings → Raster → Preview`);
- same config → same pattern/pixels/checksum; different seed → deterministic different;
- seamless/3x3/checksum/cancellation/memory limits Phase 3 dipertahankan;
- tidak ada `Math.random()`/`Date.now()`/random UUID di core generation/render path.

## Phase 5 — Export engine (EXECUTED)

- `@patternforge/export-engine`: typed `ExportConfig` + validation, PNG encoder deterministik (stored DEFLATE, CRC/Adler, round-trip tested), JPEG via `jpeg-js` (quality 1–100 default 90, composited opaque), SVG serializer vektor (9 copies, sanitized), `FileSink` + `MemoryFileSink`, filename sanitizer + deterministic naming, atomic-write adapter di desktop (Tauri fs temp+rename bila tersedia, fallback download).
- UI Export tab: format/quality/filename/status/error. Cancellation checkpoints di encoder.
- 11 export tests + 2 orchestration/integration tests. Lihat `EXPORT_ENGINE.md`.

## Phase 6 — Bounded batch generation (EXECUTED)

- `@patternforge/batch-engine`: `MAX_BATCH_COUNT = 100`, seed derivation `(start+index) mod 2^32`, `runBatch` strictly sequential (concurrency 1), progress callback, cancellation per item, failure isolation, deterministic ordering + rerun equality.
- UI Batch tab: count/start-seed/format, Run/Cancel, per-item results. 6 batch tests.

## Phase 7 — Presets + history (EXECUTED)

- `@patternforge/library`: `PresetStore` (save/load/duplicate/rename/delete, max 100, legacy migration) + `HistoryStore` (50 terakhir, timestamp metadata saja) di atas `KeyValueStorage` yang di-inject (localStorage di desktop, memory di tests). 6 tests.

## Phase 8 — Advanced controls (EXECUTED)

- Core: `lineThickness` 0.5–8 (default 1), `opacityMin/Max` (default 1/1, draw hanya bila range non-degenerate), `colorOrder` random/sequential (default random); `Line.thickness?`; renderer half-thickness + validasi; generator options + resultId segments non-default saja.
- Defaults = output Phase 4 byte-identik (goldens lestari). UI sliders + select. 6 tests.

## Phase 9 — Pattern templates (EXECUTED)

- 10 builtin templates (Minimal, Geometric, Organic, Dots, Lines, Abstract, Grid, Shapes, Monochrome, Colorful) sebagai `GenerationConfig` tetap; gallery di Library tab; semua tervalidasi + deterministik (diuji).

## Phase 10–11 — Optional AI (EXECUTED)

- `@patternforge/ai-provider`: interface `AIProvider`, `MockAIProvider` offline deterministik (keyword whole-word + plural), `OpenAICompatibleProvider` opt-in (validasi endpoint https, timeout, sanitasi intent, tanpa key persistence), `intentToGenerationConfig` validasi penuh.
- UI AI tab: provider select, prompt, UNDERSTANDING, Apply/Cancel eksplisit. Lihat `AI_ARCHITECTURE.md`. 6 tests (tanpa network kecuali unreachable-host guard).

## Phase 12 — Performance (EXECUTED)

- Smoke tests 128/256/512/1024 (completes + bounded, tanpa asersi timing). 4 tests.

## Phase 13–14 — UX + preview (EXECUTED)

- Tab navigation (Generator/Batch/Presets/History/AI/Export/Project), focus-visible, disabled/loading/error/empty states, help text, aria labels; preview 1×1/3×3 + zoom/fit.

## Phase 15–16 — Project + import (EXECUTED)

- `.patternforge` JSON (`project-v1`) save/load tervalidasi + palette text import. Lihat `PROJECT_FORMAT.md`.

## Phase 17–19 — Security, reliability, versioning (EXECUTED)

- Audit sumber otomatis (no eval/Function/shell), SVG sanitization per template, filename/path safety, key hygiene; typed `Result` di semua boundary; schema versions (`preset-v1`, `project-v1`, `pattern-v1`/`schema-v1`) + migrasi legacy + rejection versi asing.

## Phase 20 — Observability (EXECUTED)

- Tanpa telemetry. `devLog` dev-only + bounded; error user-friendly di UI tanpa stack trace.

## Phase 21–22 — Packaging + app config (EXECUTED, environment-blocked native)

- Metadata/identifier/CSP reviewed; plugin fs+dialog diregistrasi di Rust; `bundle.active: false` sampai ikon/build native terverifikasi; capabilities tetap minimal (`core:default`). Lihat `RELEASE.md`.

## Phase gate policy

## Phase 4 (referensi awal) — Seamless tile engine

Rencana deliverables:

- wrapped/modular coordinate implementation;
- translated copies untuk crossing edges/corners;
- bounds handling untuk stroke/expanded effects;
- primitive/raster rendering contract;
- edge comparison/property tests.

Gate:

- left/right dan top/bottom continuity teruji;
- corner continuity teruji;
- negative coordinate dan large element cases aman;
- kegagalan non-tileable tidak disilent.

## Phase 5 — Preview and export

Rencana deliverables:

- worker-based preview orchestration;
- format export yang dipilih secara eksplisit;
- sequential/streaming encoder path jika didukung;
- native Tauri dialog + safe atomic write;
- progress/error/cancel UI states.

Gate:

- UI tidak freeze pada supported budget;
- cancellation membersihkan temporary output;
- export path/filename policy lulus security tests;
- output yang ditandai tileable lulus seam validation.

## Phase 6 — Bounded batch generation

Rencana deliverables:

- `BatchJob` scheduler sequential default;
- deterministic item seed derivation;
- progress, cancellation, retry policy;
- one-item memory release;
- collision-safe deterministic filenames;
- batch summary tanpa retained pixel outputs.

Gate:

- memory tidak tumbuh linear terhadap batch count;
- retry item tidak mengubah seed item lain;
- cancellation bersifat idempotent;
- output partial tidak dilaporkan completed.

## Phase 7 — Quality and optional providers

Rencana deliverables:

- profiling/benchmark pada environment target;
- accessibility and UX hardening;
- project/preset persistence jika disetujui;
- optional AI `PatternProvider` adapter, hanya jika scope baru disetujui.

Gate tambahan untuk AI:

- procedural provider tetap lengkap tanpa AI;
- network dan credential opt-in;
- privacy disclosure dan cancellation tersedia;
- AI output melewati domain/tile/export validation yang sama.

## Testing strategy

- **Unit:** validation, seed derivation, color, placement, bounds, filename tokenization.
- **Property:** periodicity, edge/corner continuity, deterministic reruns, bounded counts.
- **Integration:** worker messages, cancellation, export temp/atomic commit, batch scheduling.
- **Performance:** preview latency, peak memory, sequential batch, encode throughput.
- **Security:** malformed DTO, traversal, overwrite policy, capability boundary, no dynamic execution.
- **Cross-platform:** Windows desktop sebagai target awal; perilaku path dan filesystem harus eksplisit.

## Phase gate policy

Setiap phase hanya boleh mulai setelah phase sebelumnya:

1. memiliki artefact yang diminta;
2. memiliki test/validation evidence yang relevan;
3. tidak memperkenalkan scope yang belum disetujui;
4. menyatakan known risks dan rollback/cleanup behavior.

Phase 0 tidak menyetujui implementasi Phase 1 secara otomatis. Persetujuan berikutnya diperlukan sebelum menambahkan dependency atau runtime code.
