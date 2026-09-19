# PatternForge Performance Strategy

## Target

Performance target Phase 0 dan guardrail Phase 1:

- preview terasa cepat untuk parameter dalam resource limits;
- batch generation tidak menghabiskan RAM karena jumlah item;
- seed deterministic dan tidak membutuhkan state global mutable;
- seluruh batch tidak disimpan di memory jika tidak diperlukan;
- export menggunakan streaming/sequential processing bila memungkinkan;
- UI tetap responsive selama generate, encode, dan batch.

Angka benchmark final ditetapkan setelah renderer dan format export dipilih. Dokumen ini menetapkan strategi dan acceptance criteria, bukan klaim benchmark.

## Prinsip resource budget

Sebelum kerja mahal dimulai, pipeline menghitung atau mengestimasi:

- pixel count `width × height`;
- bytes per pixel dan intermediate buffers;
- jumlah pattern elements;
- expanded bounds akibat stroke/blur;
- batch count;
- estimasi encoded output;
- concurrent operations.

Jika estimasi melewati policy, kembalikan `RESOURCE_LIMIT` sebelum mengalokasikan buffer besar. Policy harus berada di core/use-case layer, bukan hanya di form UI, agar semua entry point aman.

## Preview path

Preview memakai pipeline domain yang sama dengan export, dengan perbedaan yang eksplisit:

- logical placement dan seed tetap sama;
- render resolution dapat diturunkan/downsampled;
- output preview memiliki surface lebih kecil;
- update parameter yang cepat dapat didebounce atau dibatalkan;
- generation lama tidak boleh menimpa hasil terbaru, gunakan operation ID/generation token.

Preview sebaiknya dijalankan pada worker ketika jumlah elemen atau resolusi melewati threshold. UI hanya menerima progress ringan dan hasil yang siap ditampilkan, bukan menjalankan loop geometry besar pada main thread.

## Worker dan UI responsiveness

- Preact main thread menangani input, layout, dan presentation.
- CPU-heavy procedural generation, wrapping, rasterization, dan encoding dijalankan pada worker atau native async boundary.
- Message payload dijaga kecil; gunakan transferable buffers bila tersedia dan aman.
- Tidak ada progress event per pixel/element. Gunakan milestone atau throttling.
- Worker harus dapat memproses cancellation dan mengirim final state tepat satu kali.
- Error di worker dikonversi menjadi error domain serializable.

Tauri native calls untuk filesystem juga harus asynchronous dari perspektif UI. Dialog native memang dapat menunggu user, tetapi tidak boleh memblokir domain worker secara tidak perlu.

## Batch memory model

Default scheduler adalah bounded sequential:

```text
for each item:
  derive item seed
  generate one item
  encode one item
  write/commit one file
  emit summary
  release all item buffers
  check cancellation
```

Konsekuensinya:

- peak memory kira-kira dibatasi oleh satu item plus encoder buffer dan overhead;
- retry atau cancellation tidak mempertahankan seluruh output di RAM;
- progress dapat dihitung dari `completed / count`;
- resume/retry dapat ditambahkan kemudian dengan metadata, bukan cache pixel besar.

Concurrency hanya boleh ditambah jika memory budget, backpressure, dan deterministic ordering sudah diuji. `Promise.all` untuk seluruh batch dilarang.

## Sequential/streaming export

Untuk format yang mendukungnya:

- encoder menerima primitive/chunk/scanline secara incremental;
- writer mengalirkan chunk ke temporary file;
- flush dan atomic rename dilakukan setelah encoder sukses;
- temporary file dibersihkan saat cancellation/error.

Untuk format yang membutuhkan full-frame buffer, buffer tetap dibatasi satu item. Export engine tidak boleh menyimpan encoded bytes seluruh batch.

## Determinism dan performance

Determinism tidak boleh bergantung pada timing, worker scheduling, locale, atau iteration order object yang tidak ditentukan. Gunakan:

- PRNG/derivation yang dipilih dan diberi versi;
- array/ordering eksplisit untuk elements;
- canonical numeric serialization;
- seed item yang diturunkan langsung dari base seed + index;
- z-order deterministic.

Optimasi seperti caching harus tidak mengubah hasil. Cache yang digunakan harus memiliki key berbasis definition, effective seed, algorithm version, ukuran, dan render settings yang relevan. Cache batch bersifat optional dan bounded.

## Cancellation dan cleanup

Checkpoint minimum:

- setelah validation dan budget check;
- setelah pattern placement;
- setelah color resolution;
- setelah setiap tile wrapping batch besar;
- setelah setiap encoder chunk;
- setelah setiap batch item.

Saat cancel:

1. tandai token sebagai cancelling;
2. hentikan pada checkpoint aman;
3. lepaskan typed buffers/surface;
4. hapus temporary output;
5. kirim status cancelled satu kali.

Cleanup harus berjalan untuk success, failure, dan cancellation.

## Observability

Instrumentasi minimal yang aman:

- operation ID;
- elapsed time per stage;
- element count;
- estimated/actual bytes;
- peak in-process buffer estimate;
- completed batch count;
- cancellation point;
- error category.

Jangan log seed/output path secara berlebihan jika dapat mengungkap data proyek user. Log development dan user-facing diagnostic harus dipisahkan.

## Acceptance criteria fase implementasi

- UI tidak freeze pada preview/export dalam resource limit yang ditetapkan.
- Batch `N` item tidak menyebabkan alokasi array output berukuran `N`.
- Peak memory batch mendekati satu-item budget, bukan linear terhadap `N`.
- Rerun dengan definition, seed, dan algorithm version sama menghasilkan output sama.
- Cancellation menghentikan pekerjaan pada checkpoint dan tidak meninggalkan partial output yang dianggap sukses.
- Sequential export menghasilkan progress monoton dan nama file deterministic.
- Resource limit ditolak sebelum alokasi yang berpotensi berbahaya.

## Hal yang tidak dilakukan

- tidak mengoptimalkan dengan menghapus validasi;
- tidak menggunakan global mutable random state;
- tidak memindahkan kerja berat ke UI thread demi implementasi cepat;
- tidak menambah concurrency sebelum ada measurement;
- tidak menambahkan remote processing atau cloud cache.

## Phase 2 Foundation

Phase 2 mempertahankan runtime ringan sambil menambahkan structured-data generation:

- tidak ada server background, database, network client, image library, canvas library, atau AI SDK;
- generator hanya mengalokasikan array primitive bounded;
- `MAX_PRIMITIVES = 10_000` dicek sebelum loop generation;
- tidak ada global generation history atau unlimited cache;
- tidak ada image/pixel buffer dan tidak ada filesystem side effect;
- parameter dan version divalidasi sebelum PRNG/primitive allocation;
- tile utility hanya membuat sembilan translation records.

Generation menggunakan loop sederhana dan satu PRNG state per request. Benchmark preview latency, worker responsiveness, renderer memory, streaming export, dan sequential batch tetap menjadi scope fase berikutnya.

## Phase 3 Renderer Performance

- Default preview kecil: tile 128px (UI) / 256px (dokumen), 3x3 grid max ~768px sisi. UI membatasi input 16–512px per tile.
- Rasterisasi per-primitive dibatasi AABB yang di-clamp ke viewport; tidak ada full-frame scan per primitive. Primitives Phase 2 kecil sehingga AABB rata-rata << tile.
- Memory limits ditegakkan sebelum alokasi: max 2048px per axis, max 4.194.304 pixels, max 16.777.216 bytes (`width*height*4` dicek `isSafeInteger` + budget).
- Tidak ada render 8192x8192 implisit; dimensi besar ditolak dengan `RENDER_LIMIT_EXCEEDED`.
- Cancellation cooperative: checkpoint per row rasterisasi + per 16 primitives; `CANCELLED` membuang partial buffer (tidak dipublikasikan sebagai sukses).
- UI tidak merender pada setiap keystroke: explicit Generate button (debounce manual). Satu generation → satu preview; tidak ada batch.
- Tidak ada dependency image-processing berat; hanya TypeScript + platform APIs.
- Known limitation: polygon/ellipse/line memakai floating-point deterministik (IEEE-754, sama untuk input sama pada engine sama); belum ada benchmark lintas-platform formal.

## Phase 4 Performance (limits unchanged)

- Semua limit Phase 3 dipertahankan: max axis 2048, max pixels 4.194.304, max raster bytes 16.777.216, max primitives 10.000. Tambahan: max palette colors 32. Tidak ada limit yang diperbesar.
- Pemilihan warna menambah tepat satu `rng.pick` per primitive (O(1)); tidak ada alokasi pixel tambahan.
- UI preview tetap bounded (16–512px per tile di form) dan hanya merender pada explicit Generate; tidak ada heavy render per keystroke. Tidak ada render 8192x8192 dari UI.
- Cancellation `CancellationSignal` dipertahankan di renderer (per-row checkpoint); config invalid kembali sebelum generate/allocate.

## Final release performance (Phase 5–22)

- Limits tidak berubah: axis 2048, pixels 4.194.304, raster bytes 16.777.216, primitives 10.000, palette 32, batch 100, presets 100, history 50.
- Export: PNG stored-blocks ≈ raw + 5 B/64 KiB + headers; JPEG single-pass `jpeg-js`; SVG ~9× primitive markup; semua di bawah `MAX_EXPORT_BYTES` check.
- Batch sequential: peak ≈ satu tile + satu buffer encode; bytes file tidak di-retain (hanya metadata hasil).
- Smoke tests: 128/256/512 full pipeline + 1024 tile-only (grid 3×3 di 1024 melebihi limit 2048 by design) — completes + bounded, tanpa asersi timing yang rapuh.
- Tidak ada worker: render sinkron bounded di main thread di belakang tombol eksplisit; diukur cukup cepat (<1 s untuk 512) sehingga kompleksitas worker tidak justified (didokumentasikan, bukan diabaikan).
