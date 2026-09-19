# PatternForge AI Architecture

AI adalah adapter **opsional** di `@patternforge/ai-provider`. Sistem
inti (generate → render → seamless → export) bekerja penuh offline
tanpa AI, tanpa key, tanpa network.

## Pipeline

```text
User prompt
  |
  v
AIProvider.analyze(prompt) -> PatternIntent (structured, partial)
  |
  v
intentToGenerationConfig(intent, baseConfig) -> GenerationConfig | typed error
  |
  v
UNDERSTANDING preview -> [Apply] / [Cancel] (user eksplisit)
  |
  v
Standard generator pipeline (validasi + render + seamless + checksum)
```

## Aturan keras

AI TIDAK PERNAH: menulis file, mengeksekusi shell/code, memanggil URL
arbitrary, mengontrol filesystem/renderer langsung, melewati validasi,
atau menimpa pattern tanpa Apply eksplisit.

## Providers

- `MockAIProvider` (default, offline): keyword whole-word
  plural-tolerant → intent tetap. Prompt sama → intent sama, selalu.
- `OpenAICompatibleProvider` (opt-in): endpoint `http(s)` + model
  wajib, key opsional per-sesi (tidak disimpan/di-log); timeout
  30 s (configurable); respons harus JSON object dengan hanya
  key yang diizinkan (`sanitizeIntent` membuang sisanya);
  non-JSON/non-object → `AI_INVALID_RESPONSE`; host tak terjangkau →
  `AI_UNAVAILABLE`. Tidak pernah dipanggil kecuali user mengkonfigurasi
  dan mengklik Analyze.

## Validasi

`intentToGenerationConfig` memvalidasi SETIAP field (tipe, range,
hex, palette) dan me-reject keseluruhan intent bila ada yang invalid —
tidak ada reinterpretasi diam-diam. Field kosong = fallback ke config
aktif. CSP `connect-src` sengaja TIDAK dilonggarkan: mengaktifkan
provider remote membutuhkan update CSP eksplisit (keputusan sadar,
terdokumentasi di sini).

## Tests

Determinisme mock, pemetaan keyword, merge valid/invalid intent,
`AI_NOT_CONFIGURED` tanpa network, `AI_UNAVAILABLE` ke host mati.
Tidak ada tes yang memanggil network eksternal.
