# PatternForge Seamless Algorithm

## Tujuan

`tile-engine` harus mengubah input berikut menjadi satu tile yang dapat diulang tanpa garis putus pada batas:

- canvas width `W`;
- canvas height `H`;
- pattern elements;
- seed/placement deterministic.

Output harus mempertahankan kontinuitas:

- left edge ↔ right edge;
- top edge ↔ bottom edge;
- empat corner secara konsisten.

Dokumen ini mendeskripsikan fondasi algoritmik Phase 0, bukan implementasi renderer.

## Model koordinat

Tile canonical memiliki domain:

```text
T = [0, W) × [0, H)
```

Untuk posisi arbitrary `(x, y)`, koordinat modular canonical adalah:

```text
wrapX(x) = ((x mod W) + W) mod W
wrapY(y) = ((y mod H) + H) mod H
```

Bentuk modulo positif diperlukan karena beberapa runtime menghasilkan remainder negatif untuk input negatif.

Pattern periodik didefinisikan oleh translasi lattice:

```text
L = {(iW, jH) | i dan j adalah integer}
```

Dengan demikian setiap posisi/primitive pada tile memiliki salinan ekuivalen pada semua cell lattice.

## Fondasi utama: wrapped/modular coordinates

Strategi utama adalah menghasilkan motif dalam logical coordinate space, lalu merender semua salinan yang mungkin memengaruhi canonical tile.

Untuk setiap `PatternElement` dengan bounds `B` dan posisi canonical atau extended `p`:

1. Hitung kandidat offset `dx ∈ {-W, 0, +W}`.
2. Hitung kandidat offset `dy ∈ {-H, 0, +H}`.
3. Untuk setiap pasangan `(dx, dy)`, translasi elemen ke `p + (dx, dy)`.
4. Jika bounds hasil translasi beririsan dengan `T`, render irisan tersebut.
5. Pertahankan geometry, transform, warna, opacity, dan z-order yang sama untuk seluruh salinan.

Untuk primitive yang diameter/bounds-nya dapat lebih besar dari satu tile, daftar offset harus diperluas berdasarkan jumlah cell yang mungkin beririsan, bukan dibatasi secara buta ke `-1, 0, +1`. Itu harus dibatasi oleh resource policy.

Secara ekuivalen, renderer dapat mengevaluasi sampling periodik:

```text
f(x + iW, y + jH) = f(x, y)
```

Dengan menyelesaikan wrapping sebelum viewport clipping, edge tidak kehilangan bagian motif.

## Mengapa edge continuity terjamin

### Left ↔ right

Motif yang keluar dari `x = 0` dirender juga dengan offset `+W`. Motif yang keluar dari `x = W` dirender dengan offset `-W`. Ketika tile diulang, kedua potongan bertemu sebagai satu motif yang sama pada lattice berikutnya.

### Top ↔ bottom

Prosedur yang sama diterapkan untuk sumbu `y` menggunakan offset `±H`.

### Corner continuity

Motif yang keluar pada dua arah menggunakan pasangan offset seperti `(+W, +H)`, `(-W, +H)`, `(+W, -H)`, atau `(-W, -H)` sesuai lokasi. Karena wrapping dilakukan sebagai produk Cartesian dari kedua sumbu, bagian di top-left bertemu dengan bagian di bottom-right pada tile tetangga. Corner tidak diperlakukan sebagai kasus khusus terpisah yang berisiko mismatch.

## Placement dan seed

Pattern engine harus menghasilkan placement deterministic. Tile engine tidak boleh memanggil random baru untuk memutuskan apakah edge element diduplikasi.

Rekomendasi kontrak:

1. `pattern-engine` membuat logical elements dari seed yang telah dinormalisasi.
2. `tile-engine` menerima elements dan `TileSettings`.
3. `tile-engine` hanya melakukan deterministic geometry transform dan clipping.
4. Jika placement perlu berasal dari area extended, seed stream menggunakan namespace/version tetap dan domain yang eksplisit.

Seed tidak boleh berubah hanya karena preview memakai viewport berbeda. Preview downsampling boleh mengubah rasterization resolution, tetapi tidak boleh mengubah logical placement.

## Strategi alternatif yang didokumentasikan

### 1. Mirrored placement

Setiap elemen di dekat edge dicerminkan ke sisi berlawanan.

**Kelebihan:**

- mudah dipahami untuk motif tertentu;
- dapat mengurangi perubahan arah visual di edge.

**Kekurangan:**

- reflection mengubah orientasi/handedness motif;
- tidak selalu mewakili pola periodik asli;
- corner dan rotation memerlukan aturan khusus;
- berisiko menghasilkan seam visual walaupun posisi matematis bertemu.

**Keputusan:** bukan fondasi utama. Dapat menjadi style transform opsional setelah kontrak periodik tetap terpenuhi.

### 2. Wrapped coordinates

Posisi dikembalikan ke domain tile dengan modulo lalu elemen yang crossing boundary diduplikasi.

**Kelebihan:**

- langsung merepresentasikan periodic tiling;
- cocok untuk procedural placement;
- edge dan corner ditangani dengan aturan yang sama;
- tidak memerlukan AI atau server.

**Kekurangan:**

- geometry dengan stroke/blur besar membutuhkan expanded bounds;
- renderer harus konsisten terhadap clipping dan anti-aliasing.

**Keputusan:** dipilih sebagai pendekatan utama.

### 3. Modular coordinates

Setiap sample pada output memakai koordinat `(x mod W, y mod H)`.

**Kelebihan:**

- definisi matematis sederhana;
- kuat untuk shader/raster sampling;
- menjamin periodicity jika seluruh operasi bersifat translationally periodic.

**Kekurangan:**

- tidak cukup sendiri untuk primitive vector yang crossing boundary;
- clipping dan antialiasing masih memerlukan render copies/expanded domain;
- perlu disiplin agar operasi non-periodik tidak masuk pipeline.

**Keputusan:** digunakan sebagai model matematis dan normalisasi coordinate pada fondasi wrapped placement.

### 4. Edge-aware placement

Generator menghindari atau secara sengaja mengisi zona dekat edge dengan constraint tambahan.

**Kelebihan:**

- dapat mengontrol kepadatan atau seam visual;
- berguna untuk style yang memiliki ukuran motif tertentu.

**Kekurangan:**

- lebih kompleks;
- constraint bisa mengubah distribusi pattern;
- tidak menjamin tileability jika tidak diikuti wrapping.

**Keputusan:** policy/heuristic tambahan pada pattern engine, bukan pengganti wrapped/modular coordinate.

## Render contract

Sebelum rasterisasi, setiap element harus memiliki finite bounds. Untuk element dengan stroke, shadow, blur, atau sampling radius:

- bounds harus diperluas sebesar efek maksimum;
- kandidat translated copies dihitung berdasarkan expanded bounds;
- clipping hanya dilakukan pada output viewport;
- urutan z-index sama pada semua translated copies;
- blending/opacity harus identik pada boundary.

Jika engine belum dapat menjamin efek tertentu tileable, style atau efek tersebut harus ditolak daripada menghasilkan output yang mengklaim tileable.

## Edge validation tanpa visual guesswork

Phase implementasi harus menyediakan pemeriksaan berikut:

1. Bandingkan strip kiri dan kanan setelah translasi `W` pada coordinate space yang sama.
2. Bandingkan strip atas dan bawah setelah translasi `H`.
3. Uji empat corner dengan kombinasi translasi `(±W, ±H)`.
4. Uji element yang berada tepat di boundary.
5. Uji element yang crossing satu edge.
6. Uji element yang crossing dua edge sekaligus.
7. Uji negative coordinate dan ukuran element mendekati ukuran tile.
8. Uji beberapa seed, termasuk seed minimum, maksimum yang didukung, dan seed dengan nilai nol.

Untuk raster, perbandingan menggunakan tolerance yang terdokumentasi untuk antialiasing/pixel density. Untuk primitive stream, bandingkan canonical geometry dan translated copies secara exact.

## Failure conditions

Tile engine harus gagal dengan error terstruktur bila:

- `W` atau `H` bukan finite positive integer;
- element bounds tidak finite;
- expanded bounds melewati resource limit;
- efek renderer tidak memiliki bound yang dapat dihitung;
- transform menghasilkan nilai non-finite;
- style mengklaim tileable tetapi menggunakan operasi non-periodik yang belum didukung.

Jangan mengatasi kegagalan dengan silent clipping, random fallback, atau mengubah seed.

## Performance implications

Wrapped placement hanya perlu menyalin element yang bounds-nya beririsan dengan tile. Jangan membuat seluruh infinite lattice. Kandidat offset dihitung dari bounds dan dilepas setelah render. Untuk batch, tile-engine tidak menyimpan copy dari item sebelumnya.

Jika primitive sangat besar atau efek memiliki radius besar, validator harus menolak atau menggunakan policy khusus sebelum alokasi besar dilakukan.

## Phase 2 Foundation

Phase 2 mengimplementasikan utility matematika yang tidak memiliki side effect render di `packages/tile-engine`:

- `wrapCoordinate(value, size)` menggunakan modulo positif sehingga hasil valid berada pada `[0, size)`;
- `getNeighborTranslations(width, height)` mengembalikan tepat sembilan offset `(dx, dy)` untuk `dx/dy ∈ {-1, 0, 1}`;
- offset dihitung sebagai `dx * canvasWidth` dan `dy * canvasHeight`;
- kombinasi `(-1, -1)`, `(1, -1)`, `(-1, 1)`, dan `(1, 1)` menjadi foundation corner translations;
- utility menolak ukuran canvas non-finite atau tidak positif.

Phase 2 belum membuat translated primitive copies, clipping, rasterization, pixel comparison, atau live preview. Utility ini hanya menyediakan kontrak matematis yang akan digunakan renderer pada Phase 3.

## Phase 3 Implementation

Phase 3 mengimplementasikan wrapped rendering di `packages/renderer-engine/src/render.ts`:

### Wrapped-center + 9 translated copies

Untuk tile `W x H` dan setiap primitive dengan pusat `(x, y)`:

1. Hitung wrapped center `(wx, wy) = (wrapCoordinate(x, W), wrapCoordinate(y, H))`.
2. Untuk `dx in {-1,0,1}`, `dy in {-1,0,1}`, rasterize satu copy di `(wx + dx*W, wy + dy*H)`.
3. Clip setiap copy ke viewport `[0,W) x [0,H)` via AABB yang di-clamp.
4. Composite dalam urutan primitive (deterministic z-order) dengan integer "over".

Wrapping pusat terlebih dahulu menjamin shift-invariance: menggeser semua primitives sejauh `(+W,0)`, `(0,+H)`, atau `(+W,+H)` menghasilkan tile identik, karena wrapped center tidak berubah. Primitives Phase 2 berukuran kecil relatif terhadap tile (size <= ~7% dimensi minimum), sehingga 9 copies cukup dan bounded. Primitives dengan extent melebihi policy ditolak via `INVALID_PRIMITIVE` sebelum render.

### Edge continuity

- Primitive melewati left edge (`x < r`) dirender juga via copy `+W` sehingga muncul di right edge.
- Primitive melewati right edge dirender via copy `-W` sehingga muncul di left edge.
- Sama untuk top/bottom via `±H`.
- Tidak ada crop sepihak tanpa opposite translated copy.

### Corner continuity

Corner ditangani sebagai produk Cartesian kedua sumbu, bukan kasus khusus: primitive melewati left+top memiliki copy `(+W,+H)` yang muncul di opposite corner (bottom-right), dan seterusnya untuk keempat corner.

### 3x3 preview

`composePreviewGrid(tile, 3, 3)` mengulang buffer tile secara exact (pixel copy, bukan re-render) menjadi `3W x 3H`. Center tile adalah original. Setiap sel diverifikasi sama dengan source via `extractGridCell` + `imagesEqual`. Seam yang terlihat pada grid menandakan defect wrapping, bukan defect komposisi.

### Pixel validation (tolerance 0)

- `validateHorizontalSeam`: render base vs primitives digeser `(+W,0)`; bandingkan exact.
- `validateVerticalSeam`: geser `(0,+H)`; bandingkan exact.
- `validateCornerContinuity`: geser `(+W,+H)`; bandingkan exact + memeriksa empat corner pixels.
- `validateTileSeamless`: gabungan ketiganya.
- `validatePreviewGridConsistency`: setiap sel 3x3 sama dengan sel (0,0), exact.
- `countMismatchedPixels` / `imagesEqual`: per-channel absolute tolerance (default 0). Renderer integer RGBA deterministic tanpa anti-aliasing sehingga exact equality dapat dicapai; tolerance tidak dinaikkan untuk menyembunyikan mismatch. Jika tolerance > 0 diperlukan di masa depan, alasannya harus didokumentasikan.
- Golden test: render 32x32 fixed seed `12345` menghasilkan checksum FNV-1a `a319b114`; perubahan renderer akan terdeteksi.

## Phase 4 Note (colors and seamlessness)

Warna tidak memengaruhi sifat seamless: setiap translated copy memakai warna, opacity, dan z-order yang sama dengan primitive aslinya, sehingga shift-invariance (base vs `+W`/`+H`/`+W+H`) tetap exact untuk palette apa pun. `validateTileSeamless` Phase 4 dijalankan ulang di atas pattern berwarna (sunset, jitter 1) dan tetap PASS dengan 0 mismatched pixels. Position jitter tetap bounded (`min(W,H) * jitter`) dan pusat di-wrap sebelum disalin, sehingga jitter maksimum pun tileable.

## Final release note (export preserves seamlessness)

Export tidak mengubah sifat seamless: PNG/JPEG meng-encode tile yang sudah seamless (piksel identik dengan preview); SVG memancarkan 9 translated copies yang sama di dalam `<g clip-path>` sehingga tiling vektor tetap kontinu. Batch memakai pipeline identik per item sehingga setiap file se-seamless preview.
