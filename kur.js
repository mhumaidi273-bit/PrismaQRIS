(() => {
  'use strict';
  const cents = value => Math.round(value * 100);
  const add = (rows, get) => rows.reduce((total, row) => total + cents(get(row)), 0) / 100;
  const monthIndex = key => Number(key.slice(0, 4)) * 12 + Number(key.slice(5, 7)) - 1;
  const monthKey = index => `${Math.floor(index / 12)}-${String(index % 12 + 1).padStart(2, '0')}`;
  const storeKey = row => row.qris?.merchantId || row.merchant;
  const detailed = row => ['netAmount', 'mdr', 'promo'].every(key => typeof row.qris?.[key] === 'number' && Number.isFinite(row.qris[key]) && row.qris[key] >= 0);
  const balanced = row => detailed(row) && cents(row.amount) - cents(row.qris.mdr) - cents(row.qris.promo) === cents(row.qris.netAmount);
  const validDate = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)) && new Date(value + 'T12:00:00Z').toISOString().slice(0, 10) === value;

  function analyze(transactions, { period = 'all', merchant = 'all', asOf = new Date().toISOString().slice(0, 10) } = {}) {
    const seen = new Set();
    const base = transactions.filter(row => {
      if (row.source !== 'qris_settlement' || row.type !== 'income' || row.qris?.provider !== 'gopay_merchant' || !validDate(row.date) || row.date > asOf || !Number.isFinite(row.amount) || row.amount <= 0) return false;
      if (!['sukses', 'success', 'succeeded', 'settled', 'settlement', 'paid', 'completed', 'berhasil', 'lunas'].includes(String(row.qris.settlementStatus).toLowerCase())) return false;
      const key = JSON.stringify([storeKey(row), row.externalId || row.id]);
      if (seen.has(key)) return false;
      seen.add(key); return true;
    });
    const merchants = [...new Map(base.map(row => [storeKey(row), { key: storeKey(row), name: row.merchant }])).values()];
    const history = base.filter(row => merchant === 'all' || storeKey(row) === merchant);
    const rows = history.filter(row => period === 'all' || row.date.slice(0, 7) === period).sort((a, b) => a.date.localeCompare(b.date));
    const endMonth = period === 'all' ? asOf.slice(0, 7) : period;
    const window = Array.from({ length: 6 }, (_, index) => {
      const month = monthKey(monthIndex(endMonth) - 5 + index);
      return { month, count: history.filter(row => row.date.slice(0, 7) === month).length };
    });
    const active = window.filter(month => month.count > 0).length;
    const identityCount = rows.filter(row => row.externalId && row.merchant && row.qris.merchantId && row.qris.transactionTime).length;
    const detailCount = rows.filter(detailed).length;
    const balancedCount = rows.filter(balanced).length;
    const count = rows.length;
    const ratioScore = count => rows.length ? Math.round(count / rows.length * 25) : 0;
    const components = [
      { name: 'Kontinuitas data', value: count ? Math.round(active / 6 * 25) : 0, max: 25, numerator: active, denominator: 6, formula: count ? `${active} ÷ 6 × 25` : 'Tidak ada transaksi pada periode dipilih', reason: 'Jumlah bulan dengan transaksi GoPay dalam jendela enam bulan yang ditampilkan. Ini target dokumentasi internal, bukan bukti usia usaha atau syarat kelulusan KUR.' },
      { name: 'Identitas transaksi', value: ratioScore(identityCount), max: 25, numerator: identityCount, denominator: count, formula: `${identityCount} ÷ ${count || '—'} × 25`, reason: 'Baris dengan ID transaksi, nama toko, Merchant ID, dan waktu transaksi terisi. Kelengkapan kolom tidak sama dengan verifikasi ke GoPay.' },
      { name: 'Rincian penerimaan', value: ratioScore(detailCount), max: 25, numerator: detailCount, denominator: count, formula: `${detailCount} ÷ ${count || '—'} × 25`, reason: 'Baris dengan pendapatan bersih, MDR, dan promo berupa angka valid. Nilai nol yang tercantum di laporan tetap dihitung sebagai data lengkap.' },
      { name: 'Kecocokan nominal', value: ratioScore(balancedCount), max: 25, numerator: balancedCount, denominator: count, formula: `${balancedCount} ÷ ${count || '—'} × 25`, reason: 'Baris yang memenuhi Harga − MDR − Promo = Pendapatan Bersih, diperiksa sampai dua angka desimal. Ini pemeriksaan laporan, bukan rekonsiliasi rekening bank.' }
    ];
    const complete = count > 0 && detailCount === count;
    const amounts = rows.map(row => row.amount).sort((a, b) => a - b);
    const gross = add(rows, row => row.amount);
    const net = complete ? add(rows, row => row.qris.netAmount) : null;
    const mdr = complete ? add(rows, row => row.qris.mdr) : null;
    const promo = complete ? add(rows, row => row.qris.promo) : null;
    const days = new Set(rows.map(row => row.date)).size;
    const firstDate = rows[0]?.date || null, lastDate = rows.at(-1)?.date || null;
    const calendarDays = count ? Math.round((Date.parse(lastDate) - Date.parse(firstDate)) / 86400000) + 1 : 0;
    const ageDays = count ? Math.round((Date.parse(asOf) - Date.parse(lastDate)) / 86400000) : null;
    const months = [];
    if (count) {
      for (let index = monthIndex(firstDate); index <= monthIndex(lastDate); index++) {
        const month = monthKey(index), group = rows.filter(row => row.date.startsWith(month));
        months.push({ month, count: group.length, days: new Set(group.map(row => row.date)).size,
          gross: group.length ? add(group, row => row.amount) : null,
          net: group.length && group.every(detailed) ? add(group, row => row.qris.netAmount) : null,
          costs: group.length && group.every(detailed) ? add(group, row => row.qris.mdr + row.qris.promo) : null });
      }
    }
    const ocrRows = merchant === 'all' ? transactions.filter(row => row.source === 'ocr' && row.type === 'expense' && (!row.paymentAccountCode || ['1101', '1102'].includes(row.paymentAccountCode)) && validDate(row.date) && row.date <= asOf && (period === 'all' || row.date.startsWith(period)) && Number.isFinite(row.amount) && row.amount > 0) : [];
    const ocrExpense = add(ocrRows, row => row.amount);
    return { rows, merchants, count, window, active, components, score: components.reduce((total, item) => total + item.value, 0),
      gross, net, mdr, promo, detailCount, balancedCount, identityCount, days, calendarDays, ageDays, firstDate, lastDate, months,
      average: count ? gross / count : null, median: count ? (amounts[Math.floor((count - 1) / 2)] + amounts[Math.floor(count / 2)]) / 2 : null,
      maximum: count ? amounts.at(-1) : null, ocrExpense, ocrCount: ocrRows.length,
      sourceFiles: [...new Set(rows.map(row => row.qris.importedFrom).filter(Boolean))] };
  }
  function render(data, { formatIDR: rupiah, esc, merchant }) {
    const $ = selector => document.querySelector(selector);
    const n = value => new Intl.NumberFormat('id-ID', { maximumFractionDigits: 2 }).format(value);
    const cash = value => value === null ? 'Belum tersedia' : rupiah(value);
    const month = value => new Intl.DateTimeFormat('id-ID', { month: 'short', year: 'numeric' }).format(new Date(value + '-01T12:00:00'));
    const day = value => value ? new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(value + 'T12:00:00')) : '—';
    const metric = (label, value, detail) => `<article class="card kur-metric"><span>${label}</span><strong>${value}</strong><small>${detail}</small></article>`;
    $('#kurMerchant').innerHTML = '<option value="all">Semua toko dalam laporan</option>' + data.merchants.map(item => `<option value="${esc(item.key)}">${esc(item.name)} · ${esc(item.key)}</option>`).join('');
    $('#kurMerchant').value = merchant;
    $('#kurScope').textContent = `${data.count} transaksi GoPay sesuai pilihan periode dan toko. ${data.firstDate ? `${day(data.firstDate)}–${day(data.lastDate)}. ` : ''}Sumber: file yang diunggah, belum koneksi langsung ke GoPay.`;
    $('#kurEmpty').hidden = data.count > 0;
    $('#kurContent').hidden = !data.count;
    $('#scoreValue').textContent = data.score;
    $('#scoreRing').style.setProperty('--score', data.score);
    $('#scoreLabel').textContent = data.count ? 'Kelengkapan catatan QRIS' : 'Belum ada data';
    $('#scoreNarrative').textContent = `${data.active} dari 6 bulan dalam jendela analisis berisi transaksi. ${data.balancedCount} dari ${data.count} transaksi terpilih memiliki nominal yang cocok. Nilai tinggi tidak memastikan kemampuan membayar cicilan.`;
    $('#scoreComponents').innerHTML = data.components.map(item => `<details class="kur-component" open><summary><span>${item.name}</span><b>${item.value}/${item.max}</b></summary><div class="kur-progress"><i style="width:${item.value / item.max * 100}%"></i></div><p class="kur-formula">${esc(item.formula)} → ${item.value} poin</p><p>${item.reason}</p></details>`).join('');
    $('#kurMetrics').innerHTML = metric('Transaksi tercatat', n(data.count), `${data.days} hari dengan transaksi`) + metric('Penjualan QRIS kotor', cash(data.gross), 'Harga sebelum MDR dan promo') + metric('Penerimaan QRIS bersih', cash(data.net), 'Sesudah MDR dan promo; bukan saldo bank') + metric('Rata-rata per transaksi', cash(data.average), `Median ${cash(data.median)} · Maksimum ${cash(data.maximum)}`);
    const max = Math.max(1, ...data.months.map(item => item.gross || 0));
    const bars = data.months.map(item => `<div class="kur-chart-row"><span>${month(item.month)}</span><div class="kur-bar-pair">${item.gross === null ? '<small>Tidak ada catatan</small>' : `<div><i style="width:${item.gross / max * 100}%"></i><b>${cash(item.gross)}</b></div><div class="net"><i style="width:${(item.net || 0) / max * 100}%"></i><b>${cash(item.net)}</b></div>`}</div></div>`).join('');
    $('#kurMonthly').innerHTML = `<article class="card kur-section"><div class="card-heading"><div><span class="section-kicker">Kontinuitas enam bulan</span><h3>${month(data.window[0].month)}–${month(data.window.at(-1).month)}</h3></div><span class="status-chip">${data.active}/6 bulan tercatat</span></div><div class="kur-calendar">${data.window.map(item => `<div class="${item.count ? 'recorded' : ''}"><b>${month(item.month)}</b><strong>${item.count || '—'}</strong><small>${item.count ? 'transaksi' : 'tanpa catatan'}</small></div>`).join('')}</div><p class="kur-method">Jendela berakhir pada bulan yang dipilih, atau bulan saat ini untuk “Semua periode”. Bulan tanpa catatan dapat berarti laporan belum diunggah. Bulan berjalan dapat belum lengkap. Rentang ini tidak membuktikan usia usaha.</p></article>
      <article class="card kur-section"><div class="card-heading"><div><span class="section-kicker">Nominal sesuai periode terpilih</span><h3>Penjualan dan penerimaan per bulan</h3></div></div><div class="kur-legend"><span>Kotor</span><span>Bersih</span></div><div class="kur-chart" role="img" aria-label="Perbandingan penjualan QRIS kotor dan bersih per bulan; angka lengkap tersedia pada tabel di bawah">${bars}</div><p class="kur-method">Total hanya berasal dari transaksi yang diunggah. Perbedaan antarbulan belum dapat disebut pertumbuhan usaha karena kelengkapan laporan tiap bulan belum dipastikan.</p><div class="table-scroll"><table><caption class="sr-only">Rekap transaksi GoPay per bulan</caption><thead><tr><th>Bulan</th><th>Transaksi</th><th>Hari aktif</th><th>Kotor</th><th>MDR + promo</th><th>Bersih</th></tr></thead><tbody>${data.months.map(item => `<tr><td>${month(item.month)}</td><td>${item.count || '—'}</td><td>${item.days || '—'}</td><td>${cash(item.gross)}</td><td>${cash(item.costs)}</td><td>${cash(item.net)}</td></tr>`).join('')}</tbody><tfoot><tr><th>Total</th><td>${data.count}</td><td>${data.days}</td><td>${cash(data.gross)}</td><td>${data.net === null ? 'Belum tersedia' : cash((cents(data.mdr) + cents(data.promo)) / 100)}</td><td>${cash(data.net)}</td></tr></tfoot></table></div></article>`;
    const residual = data.net === null || merchant !== 'all' ? null : (cents(data.net) - cents(data.ocrExpense)) / 100;
    $('#kurCash').innerHTML = `<article class="card kur-section"><div class="card-heading"><div><span class="section-kicker">Kesehatan arus kas</span><h3>Belum dapat disimpulkan dari QRIS saja</h3></div></div><p>Pembayaran masuk membuktikan penerimaan yang tercatat. Laba bersih, kemampuan membayar cicilan, dan saldo bank membutuhkan biaya usaha lengkap, penjualan kanal lain, penarikan pemilik, saldo awal, serta utang berjalan.</p><div class="kur-cash-lines"><div><span>Penjualan QRIS kotor</span><b>${cash(data.gross)}</b></div><div><span>Dikurangi MDR laporan</span><b>${cash(data.mdr)}</b></div><div><span>Dikurangi pengeluaran promo laporan</span><b>${cash(data.promo)}</b></div><div class="total"><span>Penerimaan QRIS bersih</span><b>${cash(data.net)}</b></div><div><span>Pengeluaran OCR tercatat ${merchant === 'all' ? '(seluruh usaha)' : '(belum ditautkan ke toko)'}</span><b>${merchant === 'all' ? cash(data.ocrExpense) : 'Belum tersedia'}</b></div><div><span>Selisih QRIS bersih − OCR tercatat</span><b>${cash(residual)}</b></div></div><p class="kur-method">${merchant === 'all' ? `${data.ocrCount} struk pengeluaran pada periode terpilih. ${data.ocrCount ? 'Struk yang ada belum menjamin semua biaya sudah dicatat.' : 'Tidak ada struk pengeluaran; hal ini tidak berarti usaha tidak memiliki biaya.'}` : 'Pengeluaran OCR tidak memiliki Merchant ID GoPay sehingga tidak dialokasikan otomatis ke toko ini.'} Selisih di atas bukan laba bersih atau dana yang tersedia untuk cicilan.</p></article>
      <article class="card kur-section"><h3>Informasi yang belum tersedia untuk menilai cicilan</h3><div class="table-scroll"><table><thead><tr><th>Data</th><th>Status berdasarkan sumber saat ini</th><th>Kegunaan</th></tr></thead><tbody><tr><td>Seluruh biaya operasional</td><td>Belum dipastikan lengkap</td><td>Menilai surplus setelah bahan, sewa, gaji, dan biaya lainnya</td></tr><tr><td>Utang dan cicilan berjalan</td><td>Tidak tersedia di laporan QRIS</td><td>Menilai sisa kemampuan membayar</td></tr><tr><td>Pencairan & saldo rekening</td><td>Belum direkonsiliasi</td><td>Mencocokkan penerimaan dengan mutasi bank</td></tr><tr><td>Penjualan tunai / kanal lain</td><td>Tidak tercakup dalam sumber GoPay</td><td>Melengkapi omzet seluruh usaha</td></tr></tbody></table></div></article>`;
    $('#kurEvidence').innerHTML = `<article class="card kur-section"><h3>Jejak dan kualitas laporan</h3><div class="kur-evidence-grid">${metric('Tanggal transaksi terakhir', day(data.lastDate), data.ageDays === null ? 'Belum tersedia' : `${data.ageDays} hari sebelum tanggal analisis; bukan bukti usaha berhenti`)}${metric('Hari dengan transaksi', `${data.days}/${data.calendarDays}`, 'Hari unik dibanding rentang tanggal pertama–terakhir')}${metric('Identitas terisi lengkap', `${data.identityCount}/${data.count}`, 'ID transaksi, toko, Merchant ID, dan waktu')}${metric('Nominal cocok', `${data.balancedCount}/${data.count}`, 'Harga − MDR − Promo = Bersih')}</div><h4>File sumber pada catatan terpilih</h4><ul class="kur-files">${data.sourceFiles.map(file => `<li>${esc(file)}</li>`).join('') || '<li>Nama file tidak tersedia pada catatan.</li>'}</ul><p class="kur-method">Hanya transaksi berhasil berlabel GoPay Merchant yang masuk analisis. Catatan QRIS lama, penyedia lain, dan struk OCR tidak dihitung sebagai penjualan GoPay. Perubahan, penghapusan, atau impor laporan memperbarui angka ini.</p></article>
      <article class="card kur-section"><h3>Yang bisa dibuktikan untuk diskusi KUR</h3><div class="table-scroll"><table><thead><tr><th>Informasi</th><th>Bukti yang tersedia</th><th>Batas interpretasi</th></tr></thead><tbody><tr><td>Aktivitas penjualan</td><td>${data.count} pembayaran QRIS dalam catatan terpilih</td><td>Hanya kanal GoPay dan laporan yang sudah diunggah</td></tr><tr><td>Riwayat usaha</td><td>${day(data.firstDate)}–${day(data.lastDate)}</td><td>Tanggal transaksi pertama bukan tanggal pendirian usaha</td></tr><tr><td>Kelayakan dan cicilan</td><td>Penerimaan bersih ${cash(data.net)}</td><td>Memerlukan biaya lengkap dan kewajiban berjalan</td></tr><tr><td>Identitas, legalitas, riwayat kredit</td><td>Belum diverifikasi melalui aplikasi ini</td><td>Penilaian dan persyaratan mengikuti penyalur KUR</td></tr></tbody></table></div><p class="kur-method">Portal KUR menjelaskan kelayakan usaha dengan mempertimbangkan keuntungan dan kemampuan memenuhi kewajiban. Data QRIS membantu mendokumentasikan penjualan, tetapi belum cukup untuk memutuskan kelayakan pembiayaan. <a href="https://kur.ekon.go.id/faq-pertanyaan-yang-sering-ditanyakan" target="_blank" rel="noopener noreferrer">Baca penjelasan resmi KUR</a>.</p></article>`;
  }
  window.PRISMA_KUR = { analyze, render };
})();
