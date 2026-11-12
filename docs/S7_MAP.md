# Peta Data S7 (ISO TCP) — APK MiNDX Shuttle S7 (S7-1200) — DRAFT v0.4

Untuk **programmer PLC**. APK Android ini terhubung ke tiap shuttle lewat WiFi memakai
**protokol S7 / ISO TCP (port 102)**, dan HANYA membaca/menulis word di **satu DB** (default **DB100**).
Semua logika gerak, interlock dan pengaman tetap di PLC.

Ini versi pembanding dari APK Modbus TCP. **Isi dan urutan datanya sama persis**;
yang berbeda hanya cara aksesnya: "Reg n" di sini = word di **DB100.DBW(n×2)**.

- PLC: **CPU 1215C DC/DC/DC (6ES7215-1AG40-0XB0)**, satu per shuttle (2 shuttle).
- Referensi fungsi: dokumen HMI lama (S7-200 SMART). Kolom "Ref. lama" hanya menunjukkan fungsi asalnya.
- Sumber kebenaran di sisi APK: `src/registers.ts`.

> Bagian bertanda **[?]** belum final.

---

## 1. Setting di PLC (TIA Portal)

| Item | Nilai |
|---|---|
| DB | DB baru, nomor **100** (bisa diubah di APK), isi **Array[0..99] of Word** |
| Optimized block access | **MATI** (DB → Properties → Attributes → hilangkan centang "Optimized block access"), supaya alamat DBW tetap |
| PUT/GET | CPU → Properties → **Protection & Security → Connection mechanisms → centang "Permit access with PUT/GET communication from remote partner"** |
| Access level | Jangan "Complete protection" (APK tidak bisa login dengan password) |
| Rack / Slot | **0 / 1** untuk S7-1200 (diisi di APK menu Pengaturan) |
| Port | 102 (bawaan PLC, tidak perlu blok tambahan) |
| IP shuttle | Statis. Diisi di APK menu **Pengaturan** |

Contoh: `Reg[20]` (Start) = **DB100.DBW40**. `Reg[49]` (Heartbeat) = **DB100.DBW98**.

Aturan:
- **Satu word = satu sinyal** (nilai 0/1 atau angka). Tidak ada bit yang digabung.
- APK **tidak** menulis langsung ke tag kerja PLC. PLC menyalin perintah dari DB100
  ke logikanya **setelah cek interlock**.
- Perintah dengan **handshake**: APK menulis `1`, PLC menjalankan lalu menulis balik `0`.

### ⚠️ Keamanan PUT/GET
Dengan PUT/GET aktif, **perangkat apa pun di jaringan WiFi itu bisa membaca dan menulis
semua DB non-optimized dan memori PLC**, bukan hanya DB100. Karena itu:
- Simpan logika penting di DB **optimized** (tidak bisa diakses PUT/GET).
- Pakai WiFi khusus mesin dengan password, terpisah dari WiFi kantor/tamu.
- Watchdog dan interlock di PLC tetap wajib (bagian 3a).

---

## 2. Setting (Reg[0]–Reg[9], baca/tulis)

PLC memakai nilai ini langsung (atau menyalinnya ke tag setting) dan **wajib membatasi
min/max sendiri**; APK juga membatasi.

| Reg | Alamat S7 | Isi | Satuan | Ref. lama |
|---|---|---|---|---|
| 0 | DB100.DBW0 | Low speed auto | % | VW2000 |
| 1 | DB100.DBW2 | High speed auto | % | VW2002 |
| 2 | DB100.DBW4 | Lifter up/down speed auto | % | VW2004 |
| 3 | DB100.DBW6 | Low speed manual | % | VW2006 |
| 4 | DB100.DBW8 | High speed manual | % | VW2008 |
| 5 | DB100.DBW10 | Lifter up/down speed manual | % | VW2010 |
| 6 | DB100.DBW12 | Target pulse forward middle sensor | pulse | VW2012 |
| 7 | DB100.DBW14 | **[?] dicadangkan** (VW2014 lama) — tidak dipakai APK | | VW2014 |
| 8 | DB100.DBW16 | Target pulse backward middle sensor | pulse | VW2016 |
| 9 | DB100.DBW18 | Pick reposition | **[?]** | VW2018 |

---

## 3. Perintah (Reg[20]–Reg[49], APK tulis)

| Reg | Alamat S7 | Perintah | Jenis | Siapa | Ref. lama |
|---|---|---|---|---|---|
| 20 | DB100.DBW40 | Start | handshake | Operator | V204.0 |
| 21 | DB100.DBW42 | Stop | handshake | Operator | V400.0 |
| 22 | DB100.DBW44 | Reset alarm | handshake | Operator | V379.0 |
| 23 | DB100.DBW46 | Buzzer enable/disable (toggle fungsi buzzer) | handshake | Operator | V362.0 |
| 24 | DB100.DBW48 | Back to Home (shuttle kembali ke posisi Home) | handshake | Maintenance | V381.0 |
| 25 | DB100.DBW50 | *dicadangkan* (dulu Set flag Home Back — tidak dipakai APK) | — | — | V765.0 |
| 26 | DB100.DBW52 | *dicadangkan* (dulu Set flag Home Front — tidak dipakai APK) | — | — | V766.0 |
| 30 | DB100.DBW60 | Jog Lifter UP | **tahan** | Maintenance | V348.0 |
| 31 | DB100.DBW62 | Jog Lifter DOWN | **tahan** | Maintenance | V349.0 |
| 32 | DB100.DBW64 | Jog MAJU (forward) | **tahan** | Maintenance | V347.0 |
| 33 | DB100.DBW66 | Jog MUNDUR (reverse) | **tahan** | Maintenance | V346.0 |
| 40 | DB100.DBW80 | Mode diminta (lihat §4) | nilai | Operator / Maintenance | — |
| 41 | DB100.DBW82 | Jumlah palet N (lihat §4) | nilai | Operator | — |
| 49 | DB100.DBW98 | **Heartbeat** — APK menaikkan nilai tiap 200 ms | nilai | otomatis | — |

### 3a. Watchdog — WAJIB di PLC
WiFi bisa putus saat tombol jog sedang ditahan. PLC wajib:
1. Mendeteksi `Reg[49]` berubah. Jika **tidak berubah > 500 ms** → koneksi APK dianggap putus.
2. Saat putus: matikan semua gerak manual, tulis `0` ke `Reg[30..33]` (DBW60–DBW66), abaikan perintah
   baru sampai heartbeat jalan lagi.
3. Jog hanya boleh jalan jika: mode aktif = **4 (Manual)**, shuttle tidak RUN, tidak
   emergency, dan heartbeat sehat. Selain itu PLC menulis `0` ke `Reg[30..33]` (DBW60–DBW66).

APK juga menghentikan heartbeat dengan sengaja saat aplikasi ditutup/di-background,
supaya watchdog PLC langsung bekerja.

---

## 4. Ide pemilihan mode (usulan)

Di HMI lama, Load 1 / Load N / Pick 1 / Pick N / Shuffle memakai tombol Start yang sama.
Usulan: **satu register mode + satu register jumlah**. Di APK, tombol **Load** membuka pilihan **Load-1 / Load-N**, dan **Pick** membuka **Pick-1 / Pick-N**. Load-1/Pick-1 mengirim **N = 1**. Load-N/Pick-N mengirim **N = 0**, artinya **jalan terus sampai lajur penuh (Load) atau kosong (Pick)**.

| `Reg[40]` | Mode | `Reg[41]` (N) |
|---|---|---|
| 0 | Belum dipilih | — |
| 1 | **Load** (masukkan palet ke lajur) | 1 = Load-1, 0 = Load-N (sampai lajur penuh) |
| 2 | **Pick** (ambil palet dari lajur) | 1 = Pick-1, 0 = Pick-N (sampai lajur kosong) |
| 3 | **Shuffle** **[?] definisi** | diabaikan |
| 4 | **Manual** (maintenance) | diabaikan |

Alur yang diharapkan di PLC:
1. APK menulis `Reg[40]`. PLC **hanya menerima ganti mode saat shuttle IDLE** dan
   menyalinnya ke `Reg[65]` (mode aktif). Saat RUN, permintaan ganti mode diabaikan.
2. Saat Start (`Reg[20]` = 1): PLC cek mode aktif 1–3, IDLE, tidak emergency, tidak
   ada alarm → ambil N dari `Reg[41]`, salin ke `Reg[66]`, nolkan `Reg[67]`, mulai RUN.
   Jika lajur sudah penuh (Load) / kosong (Pick) saat Start: jangan RUN, isi kode alarm di `Reg[64]`.
   Jika syarat tidak terpenuhi: Start diabaikan (tetap tulis balik `0`).
3. Tiap palet selesai: `Reg[67]` +1. Selesai dan kembali IDLE jika: N = 1 dan 1 palet selesai, atau N = 0 dan lajur sudah penuh (Load) / kosong (Pick).
4. Stop kapan saja menghentikan RUN.

---

## 5. Status (Reg[50]–Reg[68], APK baca saja)

PLC menulis tiap scan. `1` = aktif.

| Reg | Alamat S7 | Status | Ref. lama |
|---|---|---|---|
| 50 | DB100.DBW100 | Shuttle siap / connected | V108.0 |
| 51 | DB100.DBW102 | RUN | V107.0 |
| 52 | DB100.DBW104 | EMERGENCY ditekan — ditampilkan di layar Alarm | V109.0 |
| 53 | DB100.DBW106 | IDLE | S0.1 |
| 54 | DB100.DBW108 | STANDBY | S2.0 / S4.4 **[?]** |
| 55 | DB100.DBW110 | Home Back | V294.0 |
| 56 | DB100.DBW112 | Home Front | V295.0 |
| 57 | DB100.DBW114 | Backward limit | V373.0 |
| 58 | DB100.DBW116 | Forward limit | V374.0 |
| 59 | DB100.DBW118 | Baterai OK (1 = OK, 0 = LOW) **[?]** | V37.0 |
| 60 | DB100.DBW120 | Lifter UP | V20.0 |
| 61 | DB100.DBW122 | Lifter DOWN | V21.0 |
| 62 | DB100.DBW124 | Fungsi buzzer enable (1 = ON) — ditampilkan di tombol Buzzer | V362.0 |
| 63 | DB100.DBW126 | Counter palet — *tidak ditampilkan APK (v0.3)*, boleh tetap diisi | VW570 |
| 64 | DB100.DBW128 | Kode alarm aktif (0 = tidak ada) — ditampilkan di layar Alarm **[?] daftar kode** | — |
| 65 | DB100.DBW130 | Mode aktif (0–4, lihat §4) | — |
| 66 | DB100.DBW132 | N job berjalan (1, atau 0 = sampai penuh/kosong) | — |
| 67 | DB100.DBW134 | Palet selesai di job berjalan | — |
| 68 | DB100.DBW136 | Kode pesan status (teks "####") **[?]** | — |

APK membaca `DB100.DBB0`–`DBB137` (69 word) sekali tiap 200 ms dalam satu permintaan S7.

---

## 6. Yang masih terbuka [?]

1. Definisi mode Shuffle.
2. Daftar kode alarm → pesan, dan daftar kode pesan status.
3. Standby: sumber sinyalnya di program baru.
4. Arti sinyal baterai (1 = OK atau 1 = LOW) — APK menganggap 1 = OK.
5. Batas min/max setting dan satuan Pick reposition.
