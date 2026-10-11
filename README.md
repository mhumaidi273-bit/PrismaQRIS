# PRISMA UMKM

Pencatatan penerimaan QRIS melalui impor laporan penjual dan pengeluaran melalui OCR struk.

## Status integrasi GoPay Merchant

**Belum terhubung langsung ke akun GoPay Merchant.** Situs tidak meminta kata sandi atau API key dan tidak menganggap pemindaian QR sebagai bukti pembayaran.

GoPay menyediakan unduhan laporan melalui aplikasi pemilik usaha: Keuangan → pilih cabang → Aktivitas terakhir → Download.
Panduan: https://gopay.co.id/bantuan-merchant/pembayaran-qris/cara-download-laporan-transaksi

Impor lokal menerima CSV asli GoPay Merchant, CSV umum (pemisah koma, titik koma, atau tab), dan JSON. Format asli telah diuji dengan laporan pengguna berisi 65 transaksi; data pribadi laporan tidak disertakan dalam sumber situs. PDF/XLSX belum didukung.

Kolom GoPay: Tipe Pembayaran, Transaksi Dibuat, Status Diperbarui, Status, No. Transaksi, No. Ref, Harga, MDR, Pengeluaran Promo, Pendapatan Bersih, Toko, Merchant ID, dan Catatan. Status SUKSES diterima. Tanggal dan waktu lokal dipertahankan, termasuk bulan berbahasa Inggris. Nominal asli memakai titik desimal tanpa pemisah ribuan.

Harga dicatat sebagai pendapatan kotor. MDR dan promo dicatat sebagai beban, sedangkan penerimaan QRIS memakai Pendapatan Bersih. Importer memeriksa Harga − MDR − Promo = Pendapatan Bersih dengan ketelitian dua angka desimal. Angka tidak valid dan baris tidak lengkap disertai alasan. Status pending, gagal, refund, mata uang lain, dan metode non-QRIS tidak dicatat sebagai pemasukan.

Duplikat dalam file maupun impor ulang dilewati. ID sama dengan tanggal atau nominal berbeda menghentikan impor agar dapat diperiksa. Konfirmasi impor menampilkan jumlah transaksi baru/duplikat serta total kotor, biaya, dan bersih. Ringkasan laporan terakhir tersimpan lokal. Setelah impor, ringkasan dan jurnal menampilkan semua periode; pemilik dapat memilih bulan tertentu. Riwayat mencakup seluruh transaksi dengan ID, waktu, dan rincian biaya.

Contoh format yang didukung:

```csv
ID Transaksi;Tanggal Transaksi;Nominal Transaksi;Status Transaksi;Metode Pembayaran
contoh-001;24/09/2026;43.500,00;Berhasil;QRIS
```

Status berasal dari file, bukan verifikasi ke GoPay. Biaya MDR dan promo berasal dari kolom laporan, bukan tarif yang diperkirakan. Pencairan rekening bank dan refund belum direkonsiliasi otomatis.

Sinkron otomatis membutuhkan akses integrasi resmi untuk merchant yang sama, server aman, validasi notifikasi, dan pengujian transaksi nyata/sandbox. API untuk membuat QR pembayaran baru tidak otomatis memberikan akses riwayat QRIS lama.

## Demo pencatatan otomatis

Rekam / Data transaksi → Demo otomatis menampilkan tiga pembayaran fiktif dan jurnal debit-kredit menggunakan pemetaan akun yang sama dengan jurnal usaha. Simulasi hanya berjalan setelah tombol Mulai ditekan. Jeda, reset, perpindahan halaman/tab, dan tab browser yang tidak aktif menghentikan proses tertunda; transaksi yang sudah dicatat dalam demo tetap terlihat sampai reset/muat ulang. Semua data demo hanya ada di memori modul terpisah, tidak disimpan ke localStorage dan tidak memengaruhi impor GoPay, OCR, jurnal usaha, KUR, atau ekspor. Demo bukan integrasi GoPay aktif dan nominal biayanya bukan tarif resmi. Jalankan `node tests/demo.cjs` untuk uji isolasi, total, jurnal, dan kontrol simulasi.

## Contoh jurnal dan laporan UMKM

Jurnal & laporan → Contoh UMKM menampilkan buku contoh Warung Bu Rini (1–30 September 2026). Seluruh angka fiktif dan dihitung dari 152 jurnal berimbang: modal awal, persediaan, penjualan QRIS/tunai, pemakaian bahan, pencairan, biaya operasional, dan prive. Sebanyak 300 pembayaran QRIS contoh (10 per hari) direkonsiliasi dengan rekap jurnal harian. Ringkasan laba rugi, posisi keuangan, grafik harian, pencarian/filter jurnal, dan rekap akun hanya membaca model contoh di memori. Data asli, OCR, GoPay, penilaian KUR usaha, dan ekspor tidak dipengaruhi. Modal/pencairan/prive pada contoh bukan tambahan dukungan input nyata; asumsi edukasi dijelaskan di layar. Uji: `node tests/report-demo.cjs`.

Kesiapan KUR → Contoh UMKM menggunakan model contoh yang sama, dengan tanggal analisis tetap 30 September 2026. Skor dihitung oleh rumus analisis asli: 79/100 (kontinuitas satu dari enam bulan = 4/25; identitas, rincian, dan rekonsiliasi nominal masing-masing 25/25). Ini nilai maksimum untuk cakupan satu bulan, bukan keputusan atau peluang persetujuan KUR. Tab pola transaksi, arus kas, dan rincian pembayaran menjelaskan angka beserta batasannya. Data demo tidak disimpan atau dicampur dengan laporan merchant. Uji: `node tests/kur-demo.cjs`.

## OCR struk

Tesseract.js membaca gambar di perangkat. Mesin dan model bahasa diunduh saat diperlukan. Ekstraksi teks membedakan total dari subtotal/ID, membaca tanggal, serta menyediakan produk, jumlah, harga satuan, dan perbandingan jumlah item dengan total. Kolom yang tidak ditemukan dibiarkan kosong.

OCR tidak dijamin 100% akurat. Pengguna harus memeriksa foto dan memperbaiki hasil sebelum menyimpan. Struk dengan susunan berbeda, gambar buram, diskon, dan pajak dapat memerlukan koreksi.

## Kesiapan KUR: dokumentasi dan bukti data

Analisis menggunakan transaksi QRIS berstatus berhasil dari laporan GoPay Merchant yang diunggah. Tanggal tidak valid/masa depan, penyedia lain, dan ID duplikat tidak masuk analisis. Filter periode dan toko berlaku untuk rincian transaksi; kontinuitas selalu menampilkan jendela enam bulan yang berakhir pada bulan dipilih (atau bulan saat ini untuk semua periode).

Indeks dokumentasi internal terdiri dari empat komponen berbobot 25: bulan aktif / 6, proporsi baris beridentitas lengkap, proporsi baris dengan rincian bersih/MDR/promo lengkap, serta proporsi baris dengan nominal yang cocok sampai sen. Setiap komponen dibulatkan ke bilangan bulat dan rumusnya ditampilkan. Enam bulan adalah target dokumentasi internal, bukan syarat resmi atau bukti usia usaha. Profil dan persetujuan berbagi tidak memengaruhi nilai.

Tab pola transaksi menampilkan cakupan bulan, grafik, tabel bulanan, dan total. Bulan tanpa laporan tidak dianggap memiliki penjualan nol. Tab arus kas membedakan penerimaan bersih QRIS dari laba dan saldo bank. OCR hanya digabung pada cakupan semua toko karena belum memiliki tautan ke Merchant ID. Tidak ada skor kesehatan arus kas ketika kelengkapan biaya/debt/sumber penerimaan lain belum diketahui. Tab kualitas data menjelaskan kelengkapan, rekonsiliasi nominal, umur data, nama file sumber, dan bukti yang masih dibutuhkan untuk penilaian bank. Indeks bukan peluang persetujuan atau estimasi plafon KUR.

## Data dan batasan

### Akun jurnal

Kode akun adalah daftar internal PRISMA, bukan kode resmi IAI. Nama dan kelompok penyajian mengacu pada contoh laporan posisi keuangan dan laba rugi SAK EMKM: https://www.iaiglobal.or.id/v03/files/file_sak/emkm/files/basic-html/page62.html dan page63.html. Persediaan mengacu Bab 9 (page33.html). Referensi tersedia di tampilan jurnal.

QRIS mendebit piutang penyelenggara pembayaran sebesar neto, beban jasa pembayaran (MDR), dan beban promosi, serta mengkredit pendapatan usaha sebesar bruto. Ini pencatatan awal atas asumsi penjualan sudah terjadi, bukan saldo piutang aktual setelah pencairan. Uang muka dapat direklasifikasi ke liabilitas dari riwayat. Tidak ada pencairan bank atau HPP yang direkayasa.

Struk wajib dipilih akun aset/beban serta sumber pembayaran kas/bank/utang usaha. Persediaan, perlengkapan belum digunakan, beban dibayar di muka, dan peralatan tidak langsung masuk beban. Akun lama dipetakan saat pembacaan tanpa mengubah bukti sumber; akun tidak dikenal tidak diposting dan ditandai untuk diklasifikasikan. Transaksi lama tetap menggunakan asumsi kas lama dengan peringatan dan dapat dikoreksi. Pembelian kredit tidak dikurangkan sebagai arus kas keluar di tab KUR.

Rekap jurnal dan ringkasan dihitung dari pemetaan akun yang sama. Mutasi aset bukan saldo akhir tanpa saldo awal dan penyesuaian. Rekap banyak merchant tidak otomatis merupakan satu entitas. Pemenuhan penuh SAK EMKM membutuhkan laporan posisi keuangan, laba rugi, catatan, komparatif, serta kebijakan dan penyesuaian yang memadai; fitur ini tidak mengklaim kepatuhan penuh. Jalankan `node tests/accounts.cjs` untuk uji pemetaan dan keseimbangan.

- Data tersimpan di localStorage browser, tidak tersinkron antarperangkat. Gunakan ekspor cadangan.
- Laporan/jurnal bersifat sederhana, bukan laporan akuntansi lengkap atau saldo rekening.
- Indeks dokumentasi QRIS merupakan indikator internal kelengkapan data, bukan keputusan kredit.
- Persetujuan berbagi hanya mengaktifkan unduhan paket, tidak mengirim data otomatis ke bank/pemerintah.
- Situs publik tidak berarti catatan lokal pengguna dibagikan ke pengunjung lain.

## Pengujian

Jalankan `node --check dist/app.js` dan `node tests/regression.cjs`. Untuk pemeriksaan lokal laporan asli tanpa menyimpan salinannya di proyek, tambahkan path CSV sebagai argumen pengujian.
Pengujian mencakup parser OCR, pemetaan semua kolom GoPay, total kotor/biaya/bersih, jurnal seimbang, periode, pemulihan cadangan, konflik ID, CSV dengan catatan berkutip, dan deduplikasi. Tes laporan asli membandingkan setiap transaksi dengan nilai sumber, lalu memeriksa hasil impor ulang. Ini bukan pengujian akurasi gambar OCR atau integrasi langsung GoPay.

Jalankan juga `node --check dist/kur.js` dan `node tests/kur.cjs` (opsional argumen path laporan asli). Tes KUR memeriksa rumus, periode, toko, nilai yang tidak tersedia, bulan kosong, biaya, duplikat, dan agregat laporan asli tanpa menyalin data pribadi ke proyek.

Sajikan folder `dist` melalui HTTPS atau server localhost.
#   P r i s m a Q R I S  
 