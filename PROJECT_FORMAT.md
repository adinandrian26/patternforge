# PatternForge Project Format

File proyek lokal berekstensi `.patternforge`: JSON versi
`project-v1` yang hanya menyimpan konfigurasi + metadata minimal.
Tanpa executable content, tanpa scripts, tanpa arbitrary paths,
tanpa remote loading.

## Schema

```json
{
  "app": "patternforge",
  "schemaVersion": "project-v1",
  "config": { "seed": "12345", "width": 128, "...": "..." }
}
```

- `app` harus `"patternforge"` (`INVALID_APP` bila bukan).
- `schemaVersion` harus `"project-v1"` (`INVALID_SCHEMA` bila asing —
  tidak pernah reinterpretasi diam-diam).
- `config` harus lolos `validateGenerationConfig` penuh
  (`INVALID_CONFIG` bila tidak).

## Skema terkait

- Preset: `preset-v1` (`{ name, config }`); bentuk legacy tanpa versi
  dimigrasi maju; versi asing ditolak.
- History entries: `{ checksum, seed, summary, createdAt }`
  (timestamp metadata UI saja, bukan input generator).

## Round-trip guarantee

Save → open → Generate menghasilkan checksum identik (diuji di UI
flow secara konseptual dan dijamin oleh determinisme pipeline +
validasi penuh saat open).
