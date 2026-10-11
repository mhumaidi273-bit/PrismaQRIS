# Instruksi unggah paling sederhana

Paket ini dibuat tanpa folder `dist`. `index.html` dan seluruh aset situs berada langsung di tingkat teratas agar mudah diunggah melalui antarmuka GitHub.

## Perbaiki repositori GitHub

1. Buka repositori `PrismaQRIS`.
2. Pilih **Add file → Upload files**.
3. Ekstrak paket ZIP di komputer.
4. Pilih dan seret **semua berkas** dari folder hasil ekstraksi ke GitHub.
5. Pastikan `index.html`, `app.js`, `styles.css`, `prisma-logo.svg`, dan `vercel.json` terlihat dalam daftar unggahan.
6. Pilih **Commit changes**.

Berkas lama seperti README boleh tetap ada. `vercel.json` lama akan digantikan oleh berkas dari paket ini.

## Pengaturan Vercel

- Framework Preset: **Other**
- Root Directory: `./`
- Build Command: kosong
- Output Directory: `.`
- Install Command: kosong

Setelah commit GitHub selesai, Vercel biasanya memulai deployment baru otomatis. Jika tidak, buka **Deployments**, tekan `…` pada deployment terbaru, lalu pilih **Redeploy**.
