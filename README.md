# MiNDX Shuttle S7 (APK)

Versi pembanding dari MiNDX Shuttle: tampilan dan isi data sama, tetapi komunikasi ke
PLC Siemens S7-1200 memakai **protokol S7 / ISO TCP (port 102, PUT/GET)**, bukan Modbus TCP.
Peta data untuk programmer PLC: [`docs/S7_MAP.md`](docs/S7_MAP.md) (DB1.DBW0 = "Reg 0").

Bisa dipasang berdampingan dengan versi Modbus (nama paket berbeda: `com.shuttleracking.control.s7`).

## Fitur
- Login PIN dua level: **Operator** (Operasi) dan **Maintenance** (Operasi, Manual, Setting PLC, Pengaturan).
- Operasi: Load (Load-1 / Load-N sampai lajur penuh), Pick (Pick-1 / Pick-N sampai lajur kosong), Shuffle, Start (dengan konfirmasi), Stop, Reset alarm, tombol Buzzer ON/OFF (enable fungsi buzzer), status.
- Alarm: daftar alarm aktif (EMERGENCY dan kode alarm PLC) dengan jam mulai, Reset alarm, Buzzer.
- Tema warna MiNDX (navy, biru, kuning) dan footer copyright PT. Mitrainti Sejahtera Eletrindo (logo MISEL).
- Tampilan landscape: menu di samping kiri, isi layar dua kolom. Tombol, teks dan lampu status membesar otomatis di tablet (skala 1× di HP sampai 1,6× di tablet besar).
- Manual: tombol tahan Maju / Mundur / Lifter UP / DOWN, Back to Home.
- Setting PLC: setting dikelompokkan (Speed Auto, Speed Manual, Posisi), disimpan per grup, dengan batas min/max.
- Peta Alamat (PIN Admin): alamat tiap item bisa diubah per shuttle, tipe WORD (DBW) atau BIT (DBX), validasi bentrok, nilai live, ekspor/impor CSV.
- Pengaturan: IP tiap shuttle, port (102), nomor DB, rack/slot, PIN, dan **mode simulasi** (coba tanpa PLC).
- Heartbeat tiap 200 ms untuk watchdog di PLC; heartbeat berhenti saat aplikasi ditutup.

PIN bawaan: Operator `1111`, Maintenance `9999`, Admin `0000`. **Ganti di menu Pengaturan sebelum dipakai.**
Mode simulasi aktif saat pertama dibuka; matikan di Pengaturan untuk tersambung ke PLC.

## Membuat file .apk (tanpa Android Studio)
1. Daftar akun gratis di https://expo.dev
2. Di folder ini:
   ```bash
   npm install
   npx eas-cli@latest login
   npx eas-cli@latest build -p android --profile apk
   ```
3. Setelah selesai, EAS memberi link download `.apk`. Buka link itu di HP Android dan install.

Catatan: koneksi TCP memakai modul native sendiri (`modules/iso-tcp`, Kotlin), jadi **tidak bisa dibuka di Expo Go**;
harus lewat build di atas.

## Untuk developer
```bash
npm run typecheck   # cek TypeScript
npm test            # tes client S7 terhadap server python-snap7 (butuh: pip install python-snap7)
```
Struktur:
- `src/s7.ts` — client S7: koneksi COTP, setup komunikasi, baca/tulis word di DB
- `src/nativeTransport.ts` + `modules/iso-tcp` — kirim/terima frame ISO-TCP di Android
- `src/registers.ts` — peta data (harus sama dengan `docs/S7_MAP.md`)
- `src/simulator.ts` — PLC tiruan untuk mode simulasi
- `src/useShuttle.ts` — koneksi, heartbeat, polling, kirim perintah
- `src/screens.tsx`, `App.tsx` — tampilan
