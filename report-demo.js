/* Fictional learning ledger; no access to app state, storage, imports or exports. */
(() => {
  'use strict';
  function build(accounts) {
    const entries = [];
    const accountMap = new Map(accounts.map(a => [a.code, a]));
    function add(day, category, description, note, values) {
      const lines = values.map(([code, debit, credit]) => {
        const account = accountMap.get(code);
        if (!account) throw new Error(`Unknown demo account: ${code}`);
        return { ...account, debit, credit };
      });
      if (lines.reduce((n, l) => n + l.debit - l.credit, 0) !== 0) throw new Error('Unbalanced demo entry');
      entries.push({ id: `CONTOH-${String(entries.length + 1).padStart(3, '0')}`, date: `2026-09-${String(day).padStart(2,'0')}`, category, description, note, lines });
    }
    add(1, 'Modal', 'Setoran modal awal pemilik', 'Kas Rp500.000 dan bank Rp2.000.000. Setoran pemilik bukan pendapatan.', [['1101',500000,0],['1102',2000000,0],['3101',0,2500000]]);
    add(1, 'Persediaan', 'Belanja beras, ayam, sayur & bumbu', 'Bahan yang belum dipakai dicatat sebagai persediaan; dibayar dari bank.', [['1302',1400000,0],['1102',0,1400000]]);
    const repeat = pattern => Array.from({length:30},(_,i)=>pattern[i%7]);
    const qris = repeat([450000,520000,480000,600000,680000,820000,550000]);
    const cash = repeat([150000,180000,160000,200000,220000,280000,170000]);
    const costs = repeat([240000,280000,260000,320000,360000,440000,290000]);
    const mdr = repeat([0,0,0,0,1500,2500,0]);
    for (let i = 0; i < 30; i++) {
      const day = 1 + i;
      if (i > 0 && i % 3 === 0) add(day, 'Persediaan', 'Tambah stok bahan dapur', 'Persediaan bertambah Rp1.000.000; pembayaran dari bank.', [['1302',1000000,0],['1102',0,1000000]]);
      add(day, 'Penjualan', 'Rekap penjualan QRIS harian', 'Rekap fiktif beberapa pesanan yang telah diserahkan. MDR contoh bukan tarif resmi. Nilai bersih belum masuk rekening bank.', [['1202',qris[i]-mdr[i],0], ...(mdr[i] ? [['6105',mdr[i],0]] : []), ['4101',0,qris[i]]]);
      add(day, 'Penjualan', 'Penjualan tunai nasi & minuman', 'Penerimaan kas atas pesanan yang sudah diserahkan, terpisah dari penjualan QRIS.', [['1101',cash[i],0],['4101',0,cash[i]]]);
      add(day, 'Pemakaian bahan', 'Bahan yang dipakai untuk pesanan hari ini', 'Biaya bahan berdasarkan kartu pemakaian contoh, bukan perkiraan otomatis dari omzet.', [['5101',costs[i],0],['1302',0,costs[i]]]);
      if (i > 0) add(day, 'Pencairan', `Pencairan QRIS penjualan ${day-1} September`, 'Contoh mutasi bank yang sudah dicocokkan dengan tagihan QRIS. Bukan penjualan baru dan bukan pencairan yang diverifikasi dari akun nyata.', [['1102',qris[i-1]-mdr[i-1],0],['1202',0,qris[i-1]-mdr[i-1]]]);
      if (i % 7 === 0) add(day, 'Operasional', 'Ongkos belanja bahan ke pasar', 'Dibayar tunai untuk perjalanan belanja bahan.', [['6104',30000,0],['1101',0,30000]]);
      if (i % 7 === 1) add(day, 'Operasional', 'Gas LPG untuk memasak', 'Contoh gas yang telah dipakai minggu ini; dibayar tunai.', [['6199',100000,0],['1101',0,100000]]);
      if (i % 7 === 3) add(day, 'Operasional', 'Listrik usaha yang telah digunakan', 'Porsi pemakaian usaha minggu ini; dibayar lewat bank.', [['6103',150000,0],['1102',0,150000]]);
      if (i % 7 === 5) add(day, 'Operasional', 'Upah bantuan dapur selama satu minggu', 'Pembayaran upah kerja minggu ini melalui bank.', [['6101',450000,0],['1102',0,450000]]);
      if (i % 7 === 6) add(day, 'Prive', 'Pengambilan pribadi pemilik', 'Pengambilan kas oleh pemilik mengurangi ekuitas, bukan beban usaha.', [['3301',200000,0],['1101',0,200000]]);
    }
    const balances = accounts.map(account => {
      const lines = entries.flatMap(e => e.lines).filter(l => l.code === account.code);
      return { ...account, debit: lines.reduce((n,l) => n+l.debit,0), credit: lines.reduce((n,l) => n+l.credit,0) };
    }).filter(a => a.debit || a.credit);
    const revenue = balances.filter(a => a.kind === 'Pendapatan').reduce((n,a) => n+a.credit-a.debit,0);
    const expense = balances.filter(a => a.kind === 'Beban').reduce((n,a) => n+a.debit-a.credit,0);
    const assets = balances.filter(a => a.kind === 'Aset').reduce((n,a) => n+a.debit-a.credit,0);
    const accountBalance = code => { const a = balances.find(a=>a.code===code); return a ? a.debit-a.credit : 0; };
    const capital = -accountBalance('3101'), drawings = accountBalance('3301'), profit = revenue-expense;
    const daily = qris.map((v,i) => ({ date: `2026-09-${String(1+i).padStart(2,'0')}`, revenue: v+cash[i], qris: v, cash: cash[i], mdr:mdr[i] }));
    // Individual fictional payments reconcile exactly to each daily journal, with explicit demo IDs.
    const payments = daily.flatMap(day=>Array.from({length:10},(_,i)=>({id:`DEMO-QRIS-${day.date}-${i+1}`,date:day.date,amount:day.qris/10,mdr:i===0?day.mdr:0,promo:0,merchantId:'DEMO-WARUNG-BU-RINI',transactionTime:`${String(9+i).padStart(2,'0')}:15:00`}))).map(p=>({...p,netAmount:p.amount-p.mdr-p.promo}));
    return { entries, balances, revenue, expense, profit, assets, capital, drawings, equity: capital+profit-drawings, daily, payments,
      qrisTotal:qris.reduce((n,v)=>n+v,0), cashTotal:cash.reduce((n,v)=>n+v,0), receivable:accountBalance('1202'), inventory:accountBalance('1302'),
      settled:entries.filter(e=>e.category==='Pencairan').reduce((n,e)=>n+e.lines.find(l=>l.code==='1102').debit,0) };
  }
  function selectEntries(model, date = 'all', query = '') {
    const term = query.trim().toLocaleLowerCase('id-ID');
    return model.entries.filter(e => (date === 'all' || e.date === date) && (!term || [e.id,e.description,e.category,...e.lines.map(l=>`${l.code} ${l.name}`)].join(' ').toLocaleLowerCase('id-ID').includes(term)));
  }
  function mount(accounts) {
    const root = document.querySelector('#financeDemo');
    const real = document.querySelector('#financeReal');
    const realButton = document.querySelector('#financeRealButton');
    const demoButton = document.querySelector('#financeDemoButton');
    const period = document.querySelector('.period-control');
    const model = build(accounts);
    const money = n => new Intl.NumberFormat('id-ID',{style:'currency',currency:'IDR',maximumFractionDigits:0}).format(n);
    const date = value => new Intl.DateTimeFormat('id-ID',{day:'numeric',month:'short',timeZone:'Asia/Jakarta'}).format(new Date(`${value}T12:00:00+07:00`));
    const esc = value => String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    const row = (label, value, cls='') => `<div class="statement-row ${cls}"><span>${label}</span><b>${money(value)}</b></div>`;
    const costLines = model.balances.filter(a => a.kind === 'Beban');
    const assetLines = model.balances.filter(a => a.kind === 'Aset');
    const maxRevenue = Math.max(...model.daily.map(d => d.revenue));
    root.innerHTML = `<div class="report-demo-notice"><span>DEMO</span><p>Seluruh angka di bawah adalah fiktif. Tidak digabungkan dengan data GoPay, OCR, laporan usaha, atau KUR Anda.</p></div>
      <div class="sample-heading"><div><span class="section-kicker">Contoh pembukuan · warung makan</span><h2>Warung Bu Rini</h2><p>1–30 September 2026 · 30 hari kegiatan usaha</p></div><span class="sample-period">Periode contoh tetap</span></div>
      <div class="sample-summary"><article><span>Penjualan contoh</span><strong>${money(model.revenue)}</strong><small>QRIS + tunai</small></article><article><span>Beban contoh</span><strong>${money(model.expense)}</strong><small>Bahan terpakai + operasional + MDR</small></article><article><span>Laba sebelum pajak contoh</span><strong>${money(model.profit)}</strong><small>Berdasarkan cakupan contoh ini</small></article></div>
      <div class="sample-tabs" role="group" aria-label="Tampilan contoh laporan"><button type="button" aria-pressed="true" data-sample-tab="overview">Ringkasan contoh</button><button type="button" aria-pressed="false" data-sample-tab="journal">Jurnal harian</button><button type="button" aria-pressed="false" data-sample-tab="accounts">Rekap akun</button></div>
      <div data-sample-panel="overview">
        <div class="sample-report-grid"><article class="card sample-chart"><div class="card-heading"><h3>Penjualan selama 30 hari</h3><span>Contoh</span></div><div class="week-chart month-demo-chart" role="img" aria-label="Penjualan contoh harian: ${model.daily.map(d=>`${date(d.date)} ${money(d.revenue)}`).join('; ')}">${model.daily.map(d=>`<div><b>${Math.round(d.revenue/1000)} rb</b><div class="week-track"><i style="height:${d.revenue/maxRevenue*100}%"></i></div><span>${date(d.date)}</span></div>`).join('')}</div><p class="sample-caption">Pola penjualan contoh bervariasi dan berulang setiap tujuh hari. Geser grafik untuk melihat seluruh tanggal. Nilai mencakup penjualan QRIS dan tunai, bukan hanya uang yang cair ke bank.</p></article>
        <article class="card"><h3>Laba rugi contoh</h3>${row('Penjualan QRIS',model.qrisTotal)}${row('Penjualan tunai',model.cashTotal)}${row('Total pendapatan',model.revenue,'subtotal')}${costLines.map(a=>row(esc(a.name),-(a.debit-a.credit))).join('')}${row('Laba sebelum pajak',model.profit,'total')}<p class="sample-caption">Pembelian stok bukan langsung beban. Hanya bahan yang terpakai masuk beban pokok penjualan.</p></article></div>
        <div class="sample-report-grid"><article class="card"><h3>Posisi keuangan contoh</h3>${assetLines.map(a=>row(esc(a.name),a.debit-a.credit)).join('')}${row('Total aset',model.assets,'subtotal')}${row('Liabilitas dalam contoh',0)}${row('Modal awal pemilik',model.capital)}${row('Laba contoh',model.profit)}${row('Prive pemilik',-model.drawings)}${row('Total ekuitas',model.equity,'total')}<p class="sample-caption">Aset = liabilitas + ekuitas. Saldo dihitung dari seluruh jurnal contoh, termasuk setoran modal awal.</p></article>
        <article class="card sample-notes"><h3>Cara membaca contoh ini</h3><dl><dt>QRIS belum cair tetap dicatat</dt><dd>Penjualan 30 September menyisakan tagihan bersih ${money(model.receivable)} kepada penyelenggara. Ini bukan saldo bank.</dd><dt>Pencairan bukan penjualan kedua</dt><dd>Contoh pencairan ${money(model.settled)} memindahkan piutang QRIS ke bank, tanpa menambah pendapatan.</dd><dt>Stok dan prive punya tempat sendiri</dt><dd>Sisa bahan ${money(model.inventory)} adalah aset. Pengambilan pemilik ${money(model.drawings)} mengurangi ekuitas, bukan laba.</dd></dl><details><summary>Asumsi & batasan contoh</summary><p>Usaha contoh memakai tempat dan alat milik pribadi yang tidak dimasukkan sebagai aset usaha. Tidak ada utang, sewa, penyusutan aset usaha, atau pajak yang dimodelkan. Pemakaian bahan, MDR, dan pencairan adalah angka ilustrasi; bukan tarif atau jadwal resmi GoPay. Ini contoh edukasi terbatas, bukan laporan lengkap yang menyatakan kepatuhan SAK EMKM. Jurnal modal, pemakaian bahan, pencairan, dan prive di sini tidak menambah fitur pencatatan nyata pada aplikasi.</p></details></article></div>
      </div>
      <div data-sample-panel="journal" hidden><div class="sample-journal-tools"><label>Tanggal contoh<select id="sampleDate"><option value="all">Semua tanggal · 1–30 Sep</option>${model.daily.map(d=>`<option value="${d.date}">${date(d.date)} 2026</option>`).join('')}</select></label><label>Cari jurnal contoh<input id="sampleSearch" type="search" placeholder="Misalnya: bahan, QRIS, 1101"></label></div><p class="sample-caption" id="sampleMatch" role="status"></p><div id="sampleEntries"></div></div>
      <div data-sample-panel="accounts" hidden><article class="card"><h3>Mutasi dan saldo akun contoh</h3><p class="sample-caption">1–30 September 2026 · termasuk setoran modal awal. D = debit, K = kredit. Kode mengikuti daftar internal PRISMA.</p><div class="table-scroll"><table><thead><tr><th>Akun</th><th>Mutasi debit</th><th>Mutasi kredit</th><th>Saldo akhir</th></tr></thead><tbody>${model.balances.map(a=>`<tr><td><b>${a.code} · ${esc(a.name)}</b></td><td class="amount">${money(a.debit)}</td><td class="amount">${money(a.credit)}</td><td class="amount">${money(Math.abs(a.debit-a.credit))} ${a.debit>=a.credit?'D':'K'}</td></tr>`).join('')}</tbody><tfoot><tr><th>Total mutasi</th><th class="amount">${money(model.balances.reduce((n,a)=>n+a.debit,0))}</th><th class="amount">${money(model.balances.reduce((n,a)=>n+a.credit,0))}</th><th>Seimbang</th></tr></tfoot></table></div></article></div>`;
    const $ = s => root.querySelector(s);
    function renderJournal() {
      const matches = selectEntries(model,$('#sampleDate').value,$('#sampleSearch').value);
      $('#sampleMatch').textContent = `${matches.length} dari ${model.entries.length} jurnal contoh · ketuk transaksi untuk melihat debit dan kredit.`;
      $('#sampleEntries').innerHTML = matches.map(e=>`<details class="sample-entry"><summary><span class="sample-entry-icon"><svg><use href="#${e.category==='Penjualan'?'i-wallet':e.category==='Pencairan'?'i-bank':'i-receipt'}"/></svg></span><span class="sample-entry-copy"><b>${esc(e.description)}</b><small>${date(e.date)} · ${e.id} · ${e.category}</small></span><strong>${money(e.lines.reduce((n,l)=>n+l.debit,0))}</strong><span class="entry-chevron" aria-hidden="true">+</span></summary><div class="sample-entry-detail"><p>${esc(e.note)}</p>${e.lines.map(l=>`<div class="entry-line"><span><small>${l.code}</small>${esc(l.name)}</span><b>${l.debit?'Debit':'Kredit'}<br>${money(l.debit||l.credit)}</b></div>`).join('')}<div class="entry-balanced">Debit = kredit · jurnal seimbang</div></div></details>`).join('') || '<div class="card table-empty">Tidak ada jurnal yang cocok. Coba tanggal atau kata lain.</div>';
    }
    $('#sampleDate').addEventListener('change',renderJournal);
    $('#sampleSearch').addEventListener('input',renderJournal);
    root.querySelectorAll('[data-sample-tab]').forEach(button=>button.addEventListener('click',()=>{
      root.querySelectorAll('[data-sample-tab]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));
      root.querySelectorAll('[data-sample-panel]').forEach(panel=>{panel.hidden=panel.dataset.samplePanel!==button.dataset.sampleTab;});
    }));
    let isDemo = false;
    function mode(demo) {
      isDemo = demo; root.hidden = !demo; real.hidden = demo; period.hidden = demo;
      realButton.setAttribute('aria-pressed',String(!demo)); demoButton.setAttribute('aria-pressed',String(demo));
    }
    realButton.addEventListener('click',()=>mode(false)); demoButton.addEventListener('click',()=>mode(true));
    renderJournal();
    return { onPage(page) { period.hidden = page==='finance' && isDemo; } };
  }
  window.PRISMA_REPORT_DEMO = Object.freeze({ build, selectEntries, mount });
})();
