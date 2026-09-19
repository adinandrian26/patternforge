# PatternForge Release

## Status

FINAL RELEASE, source-complete:
`typecheck` / `lint` / `format:check` / `tests` (125) / `vite build`
semuanya PASS. Native installer: dibuild via GitHub Actions
(`.github/workflows/windows-release.yml`, manual dispatch).

## Ikon (deterministik, bukan placeholder)

`apps/desktop/src-tauri/icons/` berisi `32x32.png`, `128x128.png`,
`128x128@2x.png` (256px), dan `icon.ico` (entri PNG 16/32/64/256).

Satu-satunya sumber yang sah: `node scripts/generate-icons.mts`
(seed "987654321", tile 256 lingkaran primary di atas navy #142850,
dirender engine proyek sendiri, downscale box-average integer,
encode PNG via export-engine). Kebenaran header + dimensi dikunci
`tests/icon.test.ts`. Tidak ada seni dari internet; tidak ada file
palsu. `.icns` sengaja absen (macOS-only; rilis ini Windows-only).

## Native packaging (GitHub Actions)

- Metadata: `productName PatternForge`, `version 0.1.0`,
  `identifier com.patternforge.desktop`, window 1280×800, CSP,
  `src-tauri` dengan plugin fs + dialog terregistrasi.
- Bundle: `active: true`, `targets: ["nsis"]`, array `icon` menunjuk
  tepat ke 4 file di atas. MSI tidak ditargetkan (butuh WiX/.NET;
  di luar kebutuhan minimal).
- Capabilities least-privilege: `core:default` + `dialog:allow-save`,
  `fs:allow-write-file`, `fs:allow-rename` (hanya path tulis FileSink;
  tanpa shell, tanpa read, tanpa akses luas). Ketiga identifier
  diverifikasi ADA di manifest permission plugin
  (tauri-plugin-fs 2.5.2 + dialog 2.7.3, "without any pre-configured
  scope").
- Workflow `.github/workflows/windows-release.yml` (manual):
  checkout → Node 24 → `npm ci` → Rust stable MSVC → verifikasi
  toolchain → typecheck → lint → format:check → tests → Vite build
  → cek prasyarat bundle → `npm run tauri:build` → verifikasi
  installer ada (FAIL bila bundle aktif tapi installer tak ditemukan)
  → upload artifact `patternforge-windows-installer` (kondisional,
  `if-no-files-found: error`). Tanpa secrets, tanpa `.env`.
- Blocker lokal presisi: linker MSVC `link.exe` TIDAK ADA di mesin
  ini (cargo 1.98.1 + rustc 1.98.1 ADA; `cargo metadata` OK;
  `rustfmt --check` bersih). Instalasi Build Tools butuh admin +
  perubahan sistem sehingga TIDAK dilakukan dari repository.
  `npm run tauri:build` lokal gagal secara jujur pada kompilasi
  crate pertama — gunakan GitHub Actions untuk build native.

## Verifikasi tanpa Rust (selesai)

- `npm install`, `npm run typecheck`, `npm run lint`,
  `npm run format:check`, `npm test`, `npm run build`.
- FileSink terverifikasi via fallback download + `MemoryFileSink`
  di tests; adapter Tauri di-try/catch dengan fallback yang sama.

## Yang tidak dirilis

Tidak ada telemetry, ads, tracking, crypto, auto-update, atau
background network. Daftar larangan final di spesifikasi tetap
berlaku dan diaudit otomatis (`tests/security.test.ts`).
