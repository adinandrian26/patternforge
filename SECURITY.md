# PatternForge Security Strategy

## Scope

PatternForge adalah desktop local-first. Phase 0 mendesain security boundary; Phase 1 menambahkan Tauri capability file minimal untuk shell saja. Belum ada Tauri command, network client, filesystem export, atau persistence implementation.

Security objectives:

- data dan output user tetap lokal secara default;
- hanya capability native yang diperlukan yang diekspos;
- input pattern/export tidak pernah diperlakukan sebagai kode;
- resource exhaustion dikendalikan;
- partial/unsafe file write tidak dipublikasikan sebagai output sukses;
- future AI provider tidak memperluas trust boundary secara diam-diam.

## Threat model ringkas

### Assets

- pattern definition dan preset user;
- seed dan metadata reproducibility;
- output design;
- filesystem path yang dipilih user;
- availability/responsiveness aplikasi.

### Threats

- malformed input menyebabkan crash atau memory exhaustion;
- filename/path traversal atau overwrite file yang tidak diinginkan;
- template export disalahgunakan sebagai expression/code;
- dependency/provider masa depan mengirim data tanpa persetujuan;
- worker/native boundary menerima message yang tidak tervalidasi;
- partial write dianggap sebagai file valid;
- log membocorkan path atau data proyek.

## Local-first dan network policy

- Tidak ada backend/server untuk core workflow.
- Tidak ada API key untuk procedural generation.
- Core tidak melakukan network request.
- Default desktop capability tidak memberi network permission bila tidak diperlukan.
- Future AI/network provider harus berupa adapter terpisah dengan opt-in capability, disclosure privacy, timeout, cancellation, dan error boundary.
- Tidak ada browser automation atau remote browser control.

## Input validation

Validasi dilakukan di domain boundary, bukan hanya UI:

- schema version dan field type;
- finite numbers, integer constraints, enum allowlist;
- dimensi, element count, batch count, color count, dan file size limits;
- geometry bounds dan expanded effects;
- export format dan quality range;
- filename template dan output path;
- message origin/operation ID pada worker boundary.

Input invalid harus ditolak sebelum alokasi besar atau filesystem write.

## Tidak ada dynamic code execution

Pattern styles, color modes, filename tokens, dan export formats dipilih dari registries/allowlist statis. String user hanya data.

Dilarang:

- `eval()`;
- `Function()` atau constructor sejenis;
- menjalankan JavaScript/DSL dari `PatternDefinition`;
- interpolasi template yang dapat mengevaluasi expression arbitrary;
- import/module loading berdasarkan path user.

Jika kelak diperlukan expression language, harus menjadi interpreter terbatas dengan grammar, parser, resource limit, dan sandbox terpisah—bukan scope Phase 0.

## Tauri capability boundary

Implementasi Tauri v2 berikutnya harus:

- menggunakan capabilities/permissions minimum;
- membatasi command yang dapat dipanggil frontend;
- memvalidasi semua argument command di native boundary;
- tidak membuka akses filesystem global jika dialog-selected path cukup;
- menghindari shell/process capability yang tidak diperlukan;
- memisahkan dialog, atomic write, dan lifecycle command.

Rust/Tauri adapter tidak menerima pattern code atau mengeksekusi input definition. Ia hanya menjalankan operasi native yang sudah dibatasi.

## Filesystem dan export safety

- Path output dinormalisasi dan divalidasi terhadap policy.
- Filename token adalah allowlist (`index`, `seed`, `name` yang disanitasi, dan token lain yang ditentukan), bukan ekspresi.
- Path traversal (`..`), NUL byte, reserved device names, dan nama invalid platform ditolak atau disanitasi secara eksplisit.
- Overwrite policy harus dipilih user dan default tidak merusak file tanpa konfirmasi/policy.
- Tulis ke temporary file pada target directory, flush, lalu atomic rename.
- Temporary file dibersihkan saat cancel/failure; recovery tidak menganggapnya output final.
- Symlink/reparse-point behavior harus ditentukan dan diuji pada native adapter sebelum export production.
- Jangan menulis ke lokasi yang tidak dipilih/diizinkan user.

## Resource exhaustion

Security dan performance berbagi boundary:

- limit dimensi, pixel count, element count, expanded bounds, batch count, concurrent jobs, dan encoded bytes;
- bounded queue/backpressure;
- satu item batch pada memory default;
- cancellation checkpoint;
- reject-before-allocate untuk estimate yang melewati budget.

Nilai limit harus dikonfigurasi sebagai policy tervalidasi, bukan dapat diubah oleh input arbitrary tanpa batas.

## Worker boundary

- Semua message di-parse dan divalidasi sebagai DTO.
- `operationId` dan job state diperiksa agar hasil stale tidak mengubah UI.
- Worker tidak dipercaya untuk menerima object/function dari UI; hanya data serializable.
- Transferable buffers tidak dipakai ulang setelah ownership berpindah.
- Error yang dikirim kembali tidak memuat stack/path sensitif secara default.

## Secret dan privacy

- Phase 0 tidak menyimpan credentials.
- Seed bukan secret, tetapi dapat mengungkap hubungan antara output dan preset; tampilkan/simpan sesuai keputusan user.
- Logs tidak boleh mencetak full definition besar, pixel buffer, atau absolute path kecuali mode debug eksplisit.
- Future AI provider wajib menyatakan data apa yang dikirim, tujuan, retensi, dan kebutuhan key sebelum diaktifkan.

## Dependency dan supply chain

Pada fase implementasi:

- lock dependency npm;
- gunakan npm workspaces dengan package boundary jelas;
- audit dependency dan hindari package yang tidak diperlukan;
- gunakan Biome/Vitest sebagai development tooling tanpa menambah runtime dependency yang tidak diperlukan;
- review Tauri plugins berdasarkan capability yang diberikan;
- jangan menambahkan package AI/network ke core.

## Security validation checklist

- [ ] Tidak ada `eval`, `Function`, dynamic import dari user input, atau browser automation.
- [ ] Core workflow berjalan tanpa network.
- [ ] Semua domain DTO tervalidasi di boundary.
- [ ] Semua resource limits diuji sebelum allocation besar.
- [ ] Output ditulis temporary lalu atomic rename.
- [ ] Cancellation membersihkan partial output.
- [ ] Capability Tauri minimal dan command arguments tervalidasi.
- [ ] Filename/path traversal dan overwrite behavior diuji lintas platform.
- [ ] Future AI provider terisolasi dan opt-in.

## Phase 2 Foundation

Phase 2 menambahkan deterministic computation tanpa memperluas trust boundary:

- canonical seed hanya menerima integer atau numeric string unsigned dalam batas uint32;
- invalid seed dan parameter menghasilkan typed serializable errors;
- generation tidak memakai `Math.random()`, `Date.now()`, random UUID, network, filesystem, atau shell;
- primitive IDs berasal dari index deterministic, bukan identifier acak;
- tidak ada dynamic code, expression execution, image decoder, encoder, atau external provider;
- resource guard `MAX_PRIMITIVES` mencegah allocation tak terbatas.

Checklist ini menjadi bagian dari gate sebelum fitur renderer, export, atau batch dirilis.

## Phase 3 Renderer Security

Phase 3 tidak memperluas trust boundary:

- renderer tidak memakai network, filesystem, shell, `eval()`, `Function()`, `Math.random()`, `Date.now()`, atau random UUID;
- semua dimensi divalidasi sebelum alokasi (`INVALID_DIMENSIONS` / `RENDER_LIMIT_EXCEEDED`); `width*height*4` dicek overflow dan budget 16MB;
- warna divalidasi integer 0..255 (`INVALID_COLOR`); primitives divalidasi finite/bounded (`INVALID_PRIMITIVE`); scale dibatasi (0..1], opacity [0..1], polygon 3..64 points;
- tidak ada dynamic code atau expression execution dari `PatternDefinition`;
- output hanya in-memory raster; tidak ada PNG/JPEG/SVG encoder, save/export/download, atau filesystem write;
- cancellation membuang partial buffer; tidak ada partial output yang dianggap sukses;
- checksum FNV-1a hanya untuk regression testing, bukan security feature;
- UI preview hanya menampilkan buffer via `putImageData`; tidak ada parsing image eksternal.

## Phase 4 Security

Phase 4 tidak memperluas trust boundary:

- tidak ada network, backend, database, telemetry, remote image fetching, external API, arbitrary code execution, `eval`, atau `Function`;
- hex colors divalidasi ketat (`#rgb`/`#rrggbb`/`#rrggbbaa`, hex digits saja); string CSS tidak pernah menjadi representasi domain;
- palette dibatasi 1..32 warna valid; custom palette berisi entri invalid ditolak seluruhnya;
- Randomize Seed memakai `crypto.getRandomValues` hanya di adapter UI untuk mengisi field seed; core generator tidak menerima randomness dari browser dan tetap deterministic terhadap explicit seed;
- typed errors baru (`INVALID_PALETTE`, `INVALID_DENSITY`, `INVALID_SCALE`, `INVALID_ROTATION`, `INVALID_COMPLEXITY`, `INVALID_POSITION_JITTER`, `INVALID_SEED/WIDTH/HEIGHT/BACKGROUND`) dapat ditampilkan user-friendly tanpa stack/path sensitif.

## Final release security (Phase 5–22)

- Export: tidak ada shell; filename allowlist + traversal ditolak (diuji); SVG tanpa `<script>`, handlers, URL eksternal, `javascript:` (diuji per template + audit sumber otomatis menolak `eval(`/`new Function`/shell); API key tidak pernah ada di sumber (diuji pola `sk-*`).
- AI: default mock offline; provider remote hanya via konfigurasi eksplisit + klik Analyze; kunci hanya di argumen panggilan sesi (tidak disimpan/di-log); endpoint wajib `http(s)`; respons non-JSON-object ditolak; CSP `connect-src` tidak dilonggarkan (remote AI butuh update CSP eksplisit — didokumentasikan di `AI_ARCHITECTURE.md`).
- Filesystem: adapter-based; temp + rename; tidak ada arbitrary path (hanya filename tervalidasi; dialog native memilih direktori); tidak ada eksekusi file hasil export.
- Tauri: capabilities tetap minimal (`core:default`); tidak ada permission shell; plugin fs/dialog diregistrasi di Rust tetapi tanpa capability write sehingga path download yang terverifikasi yang dipakai sampai packaging native.
- Import: project/palette/preset/history selalu divalidasi sebelum masuk core; JSON malformed ditolak dengan typed error.
