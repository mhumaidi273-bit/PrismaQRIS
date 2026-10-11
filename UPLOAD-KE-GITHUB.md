# Mengunggah PRISMA ke GitHub dan Vercel

Paket ini tidak berisi data transaksi merchant, kredensial, atau metadata internal OpenAI Sites.

## Unggah ke GitHub

1. Ekstrak berkas ZIP ini.
2. Buat repositori kosong baru di GitHub. Jangan tambahkan README atau `.gitignore` dari GitHub karena keduanya sudah tersedia di paket.
3. Pada repositori baru, pilih **Add file → Upload files**.
4. Seret seluruh isi folder hasil ekstraksi—bukan folder induknya—ke halaman GitHub.
5. Isi pesan commit, lalu pilih **Commit changes**.

Pastikan `vercel.json`, `README.md`, folder `dist`, dan folder `tests` terlihat di halaman utama repositori.

## Hubungkan ke Vercel

1. Buka https://vercel.com/new dan impor repositori GitHub tersebut.
2. Pilih **Framework Preset: Other**.
3. Biarkan **Build Command** dan **Install Command** kosong.
4. Gunakan **Output Directory: dist**. Nilai ini juga sudah tercantum di `vercel.json`.
5. Pilih **Deploy**.

Setiap commit berikutnya ke branch produksi akan memicu deployment baru di Vercel.

## Catatan data

PRISMA menyimpan catatan usaha di penyimpanan lokal browser. Data dari domain OpenAI Sites tidak otomatis berpindah ke domain Vercel. Gunakan fitur ekspor dan impor cadangan bila ingin memindahkan data.
