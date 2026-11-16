# Peta Data S7 (ISO TCP) — APK MiNDX Shuttle S7 (S7-1200) — DRAFT v0.7

Untuk **programmer PLC**. APK Android ini terhubung ke tiap shuttle lewat WiFi memakai
**protokol S7 / ISO TCP (port 102)**, dan HANYA membaca/menulis word di **satu DB** (default **DB1**).
Semua logika gerak, interlock dan pengaman tetap di PLC.

Ini versi pembanding dari APK Modbus TCP. **Isi dan urutan datanya sama persis**;
yang berbeda hanya cara aksesnya: "Reg n" di sini = word di **DB1.DBW(n×2)**.

- PLC: **CPU 1215C DC/DC/DC (6ES7215-1AG40-0XB0)**, satu per shuttle (2 shuttle).
- Referensi fungsi: dokumen HMI lama (S7-200 SMART). Kolom "Ref. lama" hanya menunjukkan fungsi asalnya.
- Sumber kebenaran di sisi APK: `src/registers.ts`.

> Bagian bertanda **[?]** belum final.

---

## 1. Setting di PLC (TIA Portal)

| Item | Nilai |
|---|---|
| DB | DB baru, nomor **1** (bisa diubah di APK), isi **Array[0..99] of Word** |
| Optimized block access | **MATI** (DB → Properties → Attributes → hilangkan centang "Optimized block access"), supaya alamat DBW tetap |
| PUT/GET | CPU → Properties → **Protection & Security → Connection mechanisms → centang "Permit access with PUT/GET communication from remote partner"** |
| Access level | Jangan "Complete protection" (APK tidak bisa login dengan password) |
| Rack / Slot | **0 / 1** untuk S7-1200 (diisi di APK menu Pengaturan) |
| Port | 102 (bawaan PLC, tidak perlu blok tambahan) |
| IP shuttle | Statis. Diisi di APK menu **Pengaturan** |

Contoh: `Reg[20]` (Start) = **DB1.DBW40**. `Reg[49]` (Heartbeat) = **DB1.DBW98**.

Aturan:
- **Satu word = satu sinyal** (nilai 0/1 atau angka). Tidak ada bit yang digabung.
- APK **tidak** menulis langsung ke tag kerja PLC. PLC menyalin perintah dari DB1
  ke logikanya **setelah cek interlock**.
- Perintah dengan **handshake**: APK menulis `1`, PLC menjalankan lalu menulis balik `0`.

### ⚠️ Keamanan PUT/GET
Dengan PUT/GET aktif, **perangkat apa pun di jaringan WiFi itu bisa membaca dan menulis
semua DB non-optimized dan memori PLC**, bukan hanya DB1. Karena itu:
- Simpan logika penting di DB **optimized** (tidak bisa diakses PUT/GET).
- Pakai WiFi khusus mesin dengan password, terpisah dari WiFi kantor/tamu.
- Watchdog dan interlock di PLC tetap wajib (bagian 3a).

---

## 2. Setting (Reg[0]–Reg[9], baca/tulis)

PLC memakai nilai ini langsung (atau menyalinnya ke tag setting) dan **wajib membatasi
min/max sendiri**; APK juga membatasi.

| Reg | Alamat S7 | Isi | Satuan | Ref. lama |
|---|---|---|---|---|
| 0 | DB1.DBW0 | Low speed auto | % | VW2000 |
| 1 | DB1.DBW2 | High speed auto | % | VW2002 |
| 2 | DB1.DBW4 | Lifter up/down speed auto | % | VW2004 |
| 3 | DB1.DBW6 | Low speed manual | % | VW2006 |
| 4 | DB1.DBW8 | High speed manual | % | VW2008 |
| 5 | DB1.DBW10 | Lifter up/down speed manual | % | VW2010 |
| 6 | DB1.DBW12 | Target pulse forward middle sensor | pulse | VW2012 |
| 7 | DB1.DBW14 | **[?] dicadangkan** (VW2014 lama) — tidak dipakai APK | | VW2014 |
| 8 | DB1.DBW16 | Target pulse backward middle sensor | pulse | VW2016 |
| 9 | DB1.DBW18 | Pick reposition | **[?]** | VW2018 |

---

## 3. Perintah (Reg[20]–Reg[49], APK tulis)

| Reg | Alamat S7 | Perintah | Jenis | Siapa | Ref. lama |
|---|---|---|---|---|---|
| 20 | DB1.DBW40 | Start | handshake | Operator | V204.0 |
| 21 | DB1.DBW42 | Stop | handshake | Operator | V400.0 |
| 22 | DB1.DBW44 | Reset alarm | handshake | Operator | V379.0 |
| 23 | DB1.DBW46 | Buzzer enable/disable (toggle fungsi buzzer) | handshake | Operator | V362.0 |
| 24 | DB1.DBW48 | Back to Home (shuttle kembali ke posisi Home) | handshake | Maintenance | V381.0 |
| 25 | DB1.DBW50 | *dicadangkan* (dulu Set flag Home Back — tidak dipakai APK) | — | — | V765.0 |
| 26 | DB1.DBW52 | *dicadangkan* (dulu Set flag Home Front — tidak dipakai APK) | — | — | V766.0 |
| 30 | DB1.DBW60 | Jog Lifter UP | **tahan** | Maintenance | V348.0 |
| 31 | DB1.DBW62 | Jog Lifter DOWN | **tahan** | Maintenance | V349.0 |
| 32 | DB1.DBW64 | Jog MAJU (forward) | **tahan** | Maintenance | V347.0 |
| 33 | DB1.DBW66 | Jog MUNDUR (reverse) | **tahan** | Maintenance | V346.0 |
| 40 | DB1.DBW80 | *dicadangkan* (dulu Mode diminta — tidak dipakai APK; mode langsung ditulis ke Reg[65]) | — | — | — |
| 41 | DB1.DBW82 | Jumlah palet N (lihat §4) | nilai | Operator | — |
| 49 | DB1.DBW98 | **Heartbeat** — APK menaikkan nilai tiap 200 ms | nilai | otomatis | — |

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

## 4. Mode kerja (sesuai program PLC)

APK menulis **kode mode langsung ke `Reg[65]` (Mode aktif, DB1.DBW130)** dan membaca nilai yang sama untuk
menampilkan mode yang sedang aktif. Tidak ada lagi register "Mode diminta".

| Kode di `Reg[65]` | Mode | Tombol di APK |
|---|---|---|
| 0 | Belum dipilih | — |
| **2** | **Load-1** | Load → Load-1 |
| **3** | **Load-N** (sampai lajur penuh) | Load → Load-N |
| **4** | **Manual** | Manual → Masuk Mode Manual |
| **5** | **Shuffle** | Shuffle |
| **6** | **Pick-1** | Pick → Pick-1 |
| **7** | **Pick-N** (sampai lajur kosong) | Pick → Pick-N |

Saat Start, APK juga tetap menulis `Reg[41]` (N): 1 untuk Load-1/Pick-1, 0 untuk Load-N/Pick-N
(boleh diabaikan PLC karena varian sudah ada di kode mode).

Pengaman:
1. APK **hanya mengizinkan ganti mode saat shuttle tidak RUN** (tombol mode dikunci saat RUN).
   PLC tetap **wajib** menolak/mengabaikan perubahan `Reg[65]` saat RUN.
2. Saat Start (`Reg[20]` = 1): PLC cek mode 2/3/5/6/7, IDLE, tidak emergency, tidak ada alarm → mulai RUN.
   Jika lajur sudah penuh (Load) / kosong (Pick): jangan RUN, isi kode alarm di `Reg[64]`.
   Jika syarat tidak terpenuhi: Start diabaikan (tetap tulis balik `0`).
3. Tombol gerak manual di APK hanya aktif jika `Reg[65]` = 4, tidak RUN, dan tidak EMERGENCY.
4. Tiap palet selesai: `Reg[67]` +1. Stop kapan saja menghentikan RUN.

---

## 5. Status (Reg[50]–Reg[68], APK baca saja)

PLC menulis tiap scan. `1` = aktif.

| Reg | Alamat S7 | Status | Ref. lama |
|---|---|---|---|
| 50 | DB1.DBW100 | Shuttle siap / connected | V108.0 |
| 51 | DB1.DBW102 | RUN | V107.0 |
| 52 | DB1.DBW104 | EMERGENCY ditekan — ditampilkan di layar Alarm | V109.0 |
| 53 | DB1.DBW106 | IDLE | S0.1 |
| 54 | DB1.DBW108 | STANDBY | S2.0 / S4.4 **[?]** |
| 55 | DB1.DBW110 | Home Back | V294.0 |
| 56 | DB1.DBW112 | Home Front | V295.0 |
| 57 | DB1.DBW114 | Backward limit | V373.0 |
| 58 | DB1.DBW116 | Forward limit | V374.0 |
| 59 | DB1.DBW118 | Baterai OK (1 = OK, 0 = LOW) **[?]** | V37.0 |
| 60 | DB1.DBW120 | Lifter UP | V20.0 |
| 61 | DB1.DBW122 | Lifter DOWN | V21.0 |
| 62 | DB1.DBW124 | Fungsi buzzer enable (1 = ON) — ditampilkan di tombol Buzzer | V362.0 |
| 63 | DB1.DBW126 | Counter palet — *tidak ditampilkan APK (v0.3)*, boleh tetap diisi | VW570 |
| 64 | DB1.DBW128 | Kode alarm aktif (0 = tidak ada) — ditampilkan di layar Alarm **[?] daftar kode** | — |
| 65 | DB1.DBW130 | **Mode aktif — DITULIS APK** (kode mode, lihat §4) dan dibaca kembali | — |
| 66 | DB1.DBW132 | N job berjalan (1, atau 0 = sampai penuh/kosong) | — |
| 67 | DB1.DBW134 | Palet selesai di job berjalan | — |
| 68 | DB1.DBW136 | Kode pesan status (teks "####") **[?]** | — |

APK membaca `DB1.DBB0`–`DBB137` (69 word) sekali tiap 200 ms dalam satu permintaan S7.

---

## 6. Peta Alamat di APK (alamat bisa diubah tanpa ubah program APK)

Semua alamat di dokumen ini adalah **alamat default**. Di APK (menu **Peta Alamat**, perlu **PIN Admin**)
setiap item bisa dipindah ke alamat lain **di DB mana pun** (tidak di M), per shuttle, dan dipilih tipenya:

| Tipe | Format | Contoh | Boleh untuk |
|---|---|---|---|
| WORD | `DBn.DBWbyte` | `DB1.DBW40` | semua item |
| BIT | `DBn.DBXbyte.bit` (bit 0-7) | `DB1.DBX200.0` | item ON/OFF saja (perintah, gerak manual, lampu status) |

Item angka (setting, mode, jumlah N, heartbeat, counter, kode alarm/pesan) selalu WORD.

- Bit ditulis langsung oleh protokol S7 (tulis 1 bit), jadi bit lain di byte yang sama **tidak** ikut berubah.
- Semua DB yang dipakai harus **non-optimized**, dan PUT/GET tetap harus diizinkan.
- Watchdog tetap membaca **alamat heartbeat yang dipakai di Peta Alamat** (default `DB1.DBW98`).
- "Nomor DB" di menu Pengaturan dipakai untuk alamat default; alamat yang sudah disimpan di Peta Alamat tidak ikut berubah.

Peta Alamat bisa diekspor/diimpor sebagai **CSV** (kolom `id,grup,item,tipe,alamat`). Kolom `id` tidak boleh diubah.

---

## 7. Yang masih terbuka [?]

1. Definisi mode Shuffle.
2. Daftar kode alarm → pesan, dan daftar kode pesan status.
3. Standby: sumber sinyalnya di program baru.
4. Arti sinyal baterai (1 = OK atau 1 = LOW) — APK menganggap 1 = OK.
5. Batas min/max setting dan satuan Pick reposition.
