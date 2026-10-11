/* A finite, in-memory simulation. Never receives the real ledger or its save function. */
(() => {
  'use strict';
  const examples = [
    { id: 'DEMO-001', description: 'Kopi susu × 2', amount: 25000, mdr: 0, promo: 0 },
    { id: 'DEMO-002', description: 'Paket makan × 2', amount: 50000, mdr: 350, promo: 0 },
    { id: 'DEMO-003', description: 'Pesanan katering', amount: 100000, mdr: 700, promo: 2000 }
  ];
  const clone = value => structuredClone(value);
  function create({ journalLines, onChange = () => {}, schedule = setTimeout, cancel = clearTimeout, now = () => new Date() }) {
    let running = false, stage = 'idle', pending = null, rows = [], timer = null, generation = 0;
    const ids = new Set();
    function snapshot() {
      return clone({ running, stage, pending, rows, total: examples.length,
        gross: rows.reduce((n, row) => n + row.amount, 0),
        fees: rows.reduce((n, row) => n + row.qris.mdr + row.qris.promo, 0),
        net: rows.reduce((n, row) => n + row.qris.netAmount, 0) });
    }
    const emit = () => onChange(snapshot());
    function later(callback, delay) {
      const ticket = generation;
      timer = schedule(() => { if (running && ticket === generation) callback(); }, delay);
    }
    function next() {
      const sample = examples[rows.length];
      const stamp = now();
      pending = { id: sample.id, externalId: sample.id, description: sample.description,
        merchant: 'Toko Contoh · Demo', source: 'qris_demo', type: 'income', accountCode: '4100',
        date: new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit' }).format(stamp),
        time: new Intl.DateTimeFormat('id-ID', { timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(stamp),
        amount: sample.amount, qris: { status: 'SUKSES', provider: 'demo', mdr: sample.mdr, promo: sample.promo, netAmount: sample.amount - sample.mdr - sample.promo } };
      stage = 'received'; emit();
      later(() => { stage = 'validated'; emit(); later(post, 950); }, 950);
    }
    function post() {
      const item = pending;
      const valid = item && item.qris.status === 'SUKSES' && item.amount > 0 &&
        item.amount - item.qris.mdr - item.qris.promo === item.qris.netAmount && !ids.has(item.id);
      const journal = valid ? journalLines(clone(item)) : [];
      const debit = journal.reduce((n, line) => n + Math.round(line.debit * 100), 0);
      const credit = journal.reduce((n, line) => n + Math.round(line.credit * 100), 0);
      if (!valid || !journal.length || debit !== credit || debit !== item.amount * 100) {
        running = false; pending = null; stage = 'error'; emit(); return;
      }
      ids.add(item.id); rows.push({ ...item, journal }); pending = null; stage = 'posted';
      if (rows.length === examples.length) { running = false; stage = 'complete'; }
      emit();
      if (running) later(next, 1300);
    }
    return {
      snapshot,
      start() {
        if (running || rows.length === examples.length) return;
        running = true; generation++; next();
      },
      pause() {
        if (!running) return;
        cancel(timer); generation++; running = false; pending = null; stage = 'paused'; emit();
      },
      reset() {
        cancel(timer); generation++; running = false; pending = null; rows = []; ids.clear(); stage = 'idle'; emit();
      }
    };
  }

  function mount(root, journalLines) {
    const $ = selector => root.querySelector(selector);
    const money = value => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(value);
    const esc = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
    let lastFeed = '', lastJournal = '';
    function render(state) {
      const { running, stage, pending, rows, total } = state;
      $('#demoStart').disabled = running || rows.length === total;
      $('#demoStart span').textContent = rows.length === total ? 'Demo selesai' : stage === 'paused' ? 'Lanjutkan demo' : 'Mulai demo otomatis';
      $('#demoPause').disabled = !running;
      $('#demoReset').disabled = stage === 'idle';
      const status = { idle: 'Siap', received: 'Pembayaran contoh masuk', validated: 'Status & nominal cocok · ID belum tercatat', posted: 'Jurnal demo tercatat otomatis', paused: 'Dijeda · transaksi yang belum tercatat dibatalkan', complete: 'Selesai · seluruh transaksi contoh tercatat', error: 'Demo dihentikan · jurnal tidak valid. Reset untuk mencoba lagi.' };
      $('#demoStatus').textContent = `${status[stage]} · ${rows.length} dari ${total} transaksi contoh`;
      root.dataset.running = String(running);
      const step = { received: 0, validated: 1, posted: 2, complete: 2 }[stage] ?? -1;
      root.querySelectorAll('[data-demo-stage]').forEach((node, index) => { node.classList.toggle('done', index <= step); node.classList.toggle('current', index === step); });
      $('#demoCount').textContent = `${rows.length} / ${total}`;
      $('#demoGross').textContent = money(state.gross); $('#demoFees').textContent = money(state.fees); $('#demoNet').textContent = money(state.net);
      const feed = [...(pending ? [{ ...pending, pending: true }] : []), ...[...rows].reverse()].map(row => `<article class="demo-payment ${row.pending ? 'pending' : ''}"><div class="demo-payment-icon"><svg><use href="#${row.pending ? 'i-wallet' : 'i-check'}"/></svg></div><div class="demo-payment-copy"><b>${esc(row.description)}</b><small>${row.id} · ${row.time} WIB · Toko Contoh</small><span>MDR ${money(row.qris.mdr)} · Promo ${money(row.qris.promo)} · Bersih ${money(row.qris.netAmount)}</span></div><div class="demo-payment-value"><strong>+${money(row.amount)}</strong><small>${row.pending ? stage === 'validated' ? 'Validasi selesai' : 'Pembayaran contoh diterima' : 'Tercatat · DEMO'}</small></div></article>`).join('') || '<p class="demo-empty">Tekan “Mulai demo otomatis”. Pembayaran contoh akan muncul di sini tanpa perlu diinput satu per satu.</p>';
      if (feed !== lastFeed) { $('#demoFeed').innerHTML = feed; lastFeed = feed; }
      const lines = rows.flatMap(row => row.journal.map(line => ({ ...line, id: row.id })));
      const journal = lines.map(line => `<tr><td>${line.id}</td><td><b>${line.accountCode} · ${esc(line.account)}</b></td><td class="amount">${line.debit ? money(line.debit) : '—'}</td><td class="amount">${line.credit ? money(line.credit) : '—'}</td></tr>`).join('') || '<tr><td colspan="4" class="table-empty">Belum ada jurnal demo. Mulai simulasi untuk melihat pencatatan.</td></tr>';
      if (journal !== lastJournal) { $('#demoJournal').innerHTML = journal; lastJournal = journal; }
      const debit = lines.reduce((n, line) => n + line.debit, 0), credit = lines.reduce((n, line) => n + line.credit, 0);
      $('#demoTotals').innerHTML = lines.length ? `<tr><th colspan="2">Total jurnal demo</th><th class="amount">${money(debit)}</th><th class="amount">${money(credit)}</th></tr>` : '';
      $('#demoBalance').textContent = lines.length ? debit === credit ? 'Debit = kredit · seimbang' : 'Perlu pemeriksaan' : 'Belum ada jurnal demo';
    }
    const controller = create({ journalLines, onChange: render });
    $('#demoStart').addEventListener('click', controller.start);
    $('#demoPause').addEventListener('click', controller.pause);
    $('#demoReset').addEventListener('click', controller.reset);
    window.addEventListener('pagehide', controller.pause);
    document.addEventListener('visibilitychange', () => { if (document.hidden) controller.pause(); });
    render(controller.snapshot());
    return controller;
  }
  window.PRISMA_DEMO = Object.freeze({ create, mount });
})();
