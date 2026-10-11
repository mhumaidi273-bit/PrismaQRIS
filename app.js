(() => {
  "use strict";

  const APP_KEY = "prisma-remake-v3";
  const TODAY = new Date();
  const currency = new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 });
  const compactCurrency = new Intl.NumberFormat("id-ID", { notation: "compact", style: "currency", currency: "IDR", maximumFractionDigits: 1 });
  const dateFormat = new Intl.DateTimeFormat("id-ID", { day: "2-digit", month: "short", year: "numeric" });
  const pageTitles = {
    dashboard: "Ringkasan usaha",
    scanner: "Rekam transaksi",
    transactions: "Riwayat transaksi",
    finance: "Jurnal & laporan",
    financing: "Kesiapan KUR",
    consent: "Data & persetujuan"
  };

  const defaultState = {
    version: 3,
    transactions: [],
    profile: { name: "Warung Berkah", type: "Kuliner", city: "Tangerang Selatan" },
    consent: { ljk: false, gov: false },
    qrisConnection: { provider: "gopay_merchant", apiUrl: "", lastSync: null, lastImported: 0 },
    theme: "light"
  };

  function loadState() {
    try {
      const saved = JSON.parse(localStorage.getItem(APP_KEY));
      return saved ? {
        ...defaultState,
        ...saved,
        profile: { ...defaultState.profile, ...(saved.profile || {}) },
        consent: { ...defaultState.consent, ...(saved.consent || {}) },
        qrisConnection: { ...defaultState.qrisConnection, ...(saved.qrisConnection || {}) },
        transactions: Array.isArray(saved.transactions) ? saved.transactions : []
      } : structuredClone(defaultState);
    } catch {
      return structuredClone(defaultState);
    }
  }

  let state = loadState();
  let activeFilter = "all";
  let qrisDemo;
  let reportDemo;
  let kurDemo;

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const esc = (value) => String(value ?? "").replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[char]));
  const money = (value) => Math.round((Number(value) + Number.EPSILON) * 100) / 100;
  const sum = (items) => money(items.reduce((total, item) => total + item.amount, 0));
  const monthKey = (date) => String(date).slice(0, 7);
  const currentMonthKey = monthKey(TODAY.toISOString());
  let selectedPeriod = state.qrisConnection.lastReport ? "all" : currentMonthKey;
  const fees = (item) => money((item.qris?.mdr || 0) + (item.qris?.promo || 0));
  const netReceived = (item) => item.qris?.netAmount ?? item.amount;

  // Codes are PRISMA's chart of accounts, not codes prescribed by IAI.
  const ACCOUNTS = [
    ['1101', 'Kas', 'Aset', 'Kas dan setara kas'],
    ['1102', 'Bank', 'Aset', 'Kas dan setara kas'],
    ['1201', 'Piutang usaha', 'Aset', 'Piutang'],
    ['1202', 'Piutang penyelenggara pembayaran QRIS', 'Aset', 'Piutang'],
    ['1301', 'Persediaan barang dagang', 'Aset', 'Persediaan', true],
    ['1302', 'Persediaan bahan baku', 'Aset', 'Persediaan', true],
    ['1303', 'Persediaan perlengkapan', 'Aset', 'Persediaan', true],
    ['1401', 'Beban dibayar di muka', 'Aset', 'Beban dibayar di muka', true],
    ['1501', 'Peralatan', 'Aset', 'Aset tetap', true],
    ['1502', 'Akumulasi penyusutan peralatan', 'Kontra aset', 'Aset tetap'],
    ['2101', 'Utang usaha', 'Liabilitas', 'Utang usaha'],
    ['2102', 'Uang muka pelanggan', 'Liabilitas', 'Liabilitas lainnya'],
    ['2201', 'Utang bank', 'Liabilitas', 'Utang bank'],
    ['2301', 'Utang pajak', 'Liabilitas', 'Utang pajak'],
    ['3101', 'Modal pemilik', 'Ekuitas', 'Modal'],
    ['3201', 'Saldo laba (defisit)', 'Ekuitas', 'Saldo laba (defisit)'],
    ['3301', 'Prive', 'Kontra ekuitas', 'Modal'],
    ['4100', 'Pendapatan usaha', 'Pendapatan', 'Pendapatan usaha'],
    ['4101', 'Pendapatan penjualan barang', 'Pendapatan', 'Pendapatan usaha'],
    ['4102', 'Pendapatan jasa', 'Pendapatan', 'Pendapatan usaha'],
    ['4201', 'Pendapatan lain-lain', 'Pendapatan', 'Pendapatan lain-lain'],
    ['5101', 'Beban pokok penjualan', 'Beban', 'Beban usaha'],
    ['6101', 'Beban gaji dan upah', 'Beban', 'Beban usaha', true],
    ['6102', 'Beban sewa', 'Beban', 'Beban usaha', true],
    ['6103', 'Beban listrik, air, dan telekomunikasi', 'Beban', 'Beban usaha', true],
    ['6104', 'Beban transportasi', 'Beban', 'Beban usaha', true],
    ['6105', 'Beban jasa pembayaran QRIS (MDR)', 'Beban', 'Beban usaha'],
    ['6106', 'Beban promosi', 'Beban', 'Beban usaha', true],
    ['6107', 'Beban perlengkapan', 'Beban', 'Beban usaha', true],
    ['6108', 'Beban penyusutan peralatan', 'Beban', 'Beban usaha'],
    ['6199', 'Beban usaha lainnya', 'Beban', 'Beban usaha', true],
    ['7101', 'Beban bunga', 'Beban', 'Beban keuangan', true],
    ['7201', 'Beban lain-lain', 'Beban', 'Beban lain-lain', true],
    ['8101', 'Beban pajak penghasilan', 'Beban', 'Beban pajak penghasilan', true]
  ].map(([code, name, kind, group, receipt = false]) => ({ code, name, kind, group, receipt }));
  const accountByCode = code => ACCOUNTS.find(account => account.code === code);
  const oldAccountCodes = {
    'Pendapatan penjualan': '4100', 'Beban operasional': '6199',
    'Perlengkapan': '1303', 'Beban utilitas': '6103',
    'Beban MDR': '6105', 'Kas tunai': '1101'
  };
  function transactionAccount(item) {
    const account = item.accountCode ? accountByCode(item.accountCode) :
      accountByCode(oldAccountCodes[item.account]) || ACCOUNTS.find(account => account.name === item.account);
    if (!account) return null;
    return (item.type === 'income' ? account.kind === 'Pendapatan' || account.code === '2102' : account.receipt) ? account : null;
  }
  function paymentAccount(item) {
    const code = item.paymentAccountCode || '1101'; // Historical OCR was explicitly recorded as cash.
    return ['1101', '1102', '2101'].includes(code) ? accountByCode(code) : null;
  }
  function accountOptions(type, selected = '') {
    return '<option value="">Pilih akun sesuai transaksi</option>' + ACCOUNTS
      .filter(account => type === 'income' ? account.kind === 'Pendapatan' || account.code === '2102' : account.receipt)
      .map(account => `<option value="${account.code}" ${selected === account.code ? 'selected' : ''}>${account.code} · ${account.name}</option>`).join('');
  }

  function saveState() {
    state.version = 3;
    localStorage.setItem(APP_KEY, JSON.stringify(state));
  }

  function formatIDR(value) {
    const amount = money(Number(value) || 0);
    return (Number.isInteger(amount) ? currency : new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", minimumFractionDigits: 2, maximumFractionDigits: 2 })).format(amount).replace(/\u00a0/g, " ");
  }

  function formatSigned(value) {
    const prefix = value >= 0 ? "+" : "−";
    return `${prefix}${formatIDR(Math.abs(value))}`;
  }

  function parseAmount(value) {
    return Number(String(value || "").replace(/[^0-9]/g, "")) || 0;
  }

  function uid(prefix = "TRX") {
    return `${prefix}-${crypto.randomUUID()}`;
  }

  function downloadJson(filename, value) {
    const blob = new Blob([JSON.stringify(value, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1200);
  }

  function exportBackup() {
    downloadJson(`prisma-cadangan-${TODAY.toISOString().slice(0, 10)}.json`, {
      format: "prisma-backup",
      version: 3,
      exportedAt: new Date().toISOString(),
      profile: state.profile,
      consent: state.consent,
      qrisConnection: { provider: state.qrisConnection.provider, apiUrl: state.qrisConnection.apiUrl, lastSync: state.qrisConnection.lastSync, lastImported: state.qrisConnection.lastImported },
      transactions: state.transactions
    });
    toast("Cadangan dibuat", "File JSON sudah diunduh ke perangkat ini.");
  }

  function parseBackup(value) {
    if (!value || value.format !== "prisma-backup" || !Array.isArray(value.transactions)) throw new Error("Format cadangan PRISMA tidak dikenali.");
    const transactions = value.transactions.filter((item) => item && typeof item === "object" && item.id && item.date && Number(item.amount) > 0 && ["income", "expense"].includes(item.type)).map((item) => ({
      ...item,
      amount: money(Number(item.amount)),
      source: item.source === "qris_settlement" ? "qris_settlement" : item.source === "ocr" ? "ocr" : "qris",
      merchant: String(item.merchant || "Tanpa nama").slice(0, 100),
      description: String(item.description || "Transaksi").slice(0, 160),
      account: String(item.account || "Belum diklasifikasikan").slice(0, 100)
    }));
    return {
      version: 3,
      transactions,
      profile: { ...defaultState.profile, ...(value.profile || {}) },
      consent: { ...defaultState.consent, ...(value.consent || {}) },
      qrisConnection: { ...defaultState.qrisConnection, ...(value.qrisConnection || {}) },
      theme: state.theme
    };
  }

  async function importBackupFile(file) {
    if (!file) return;
    try {
      const value = JSON.parse(await file.text());
      const imported = parseBackup(value);
      if (!window.confirm(`Ganti data lokal dengan ${imported.transactions.length} transaksi dari cadangan ini?`)) return;
      state = imported;
      saveState();
      renderAll();
      toast("Cadangan dipulihkan", `${state.transactions.length} transaksi siap digunakan.`);
    } catch (error) {
      toast("Cadangan tidak dapat dipulihkan", error.message || "Periksa file JSON yang dipilih.", "error");
    } finally {
      $("#backupFile").value = "";
    }
  }

  function exportLjkPacket() {
    if (!state.consent.ljk) {
      toast("Persetujuan belum aktif", "Aktifkan persetujuan LJK sebelum membuat paket data.", "error");
      return;
    }
    const totals = periodTotals();
    downloadJson(`prisma-paket-ljk-${TODAY.toISOString().slice(0, 10)}.json`, {
      format: "prisma-ljk-summary",
      generatedAt: new Date().toISOString(),
      profile: state.profile,
      period: selectedPeriod,
      summary: { revenue: totals.income, expense: totals.expense, estimatedProfit: totals.profit, transactionCount: totals.count, financingInformationScore: getScore() },
      accountingNote: 'Jurnal belum disesuaikan. Kode akun internal PRISMA; bukan pernyataan kepatuhan penuh SAK EMKM.',
      transactions: state.transactions.filter(item => selectedPeriod === "all" || monthKey(item.date) === selectedPeriod).map(item => ({ id: item.id, date: item.date, source: item.source, merchant: item.merchant, description: item.description, amount: item.amount, type: item.type, account: transactionAccount(item)?.name || 'Belum diklasifikasikan', accountCode: transactionAccount(item)?.code || null, journal: journalLines(item), ...(item.qris ? { netAmount: item.qris.netAmount, mdr: item.qris.mdr, promo: item.qris.promo } : {}) }))
    });
    toast("Paket LJK dibuat", "Ringkasan usaha sudah diunduh. Tinjau sebelum dibagikan.");
  }

  function exportGovPacket() {
    if (!state.consent.gov) {
      toast("Persetujuan belum aktif", "Aktifkan persetujuan data agregat sebelum membuat paket.", "error");
      return;
    }
    const totals = periodTotals();
    const months = [...new Set(state.transactions.map((item) => monthKey(item.date)))].length;
    downloadJson(`prisma-agregat-${TODAY.toISOString().slice(0, 10)}.json`, {
      format: "prisma-anonymous-aggregate",
      generatedAt: new Date().toISOString(),
      period: selectedPeriod,
      aggregate: { transactionCount: totals.count, revenue: totals.income, expense: totals.expense, estimatedProfit: totals.profit, activeMonths: months },
      note: "Tidak berisi nama usaha, merchant, payload QRIS, atau foto struk."
    });
    toast("Agregat dibuat", "Paket anonim sudah diunduh ke perangkat ini.");
  }

  function clearLocalData() {
    if (!window.confirm("Hapus seluruh transaksi, profil, dan persetujuan dari perangkat ini? Tindakan ini tidak dapat dibatalkan.")) return;
    state = structuredClone(defaultState);
    saveState();
    renderAll();
    toast("Data lokal dihapus", "PRISMA siap digunakan kembali dari awal.");
  }

  function toast(title, message, type = "success") {
    const wrapper = document.createElement("div");
    wrapper.className = `toast ${type}`;
    wrapper.innerHTML = `<i>${type === "error" ? "!" : "✓"}</i><div><strong>${esc(title)}</strong><small>${esc(message)}</small></div>`;
    $("#toastStack").appendChild(wrapper);
    $("#liveRegion").textContent = `${title}. ${message}`;
    setTimeout(() => {
      wrapper.classList.add("leaving");
      setTimeout(() => wrapper.remove(), 260);
    }, 3600);
  }

  function setMobileMenu(open, returnFocus = false) {
    const mobile = window.matchMedia('(max-width: 940px)').matches;
    const expanded = open && mobile;
    $("#sidebar").classList.toggle("open", expanded);
    $("#scrim").classList.toggle("open", expanded);
    document.body.classList.toggle('menu-open', expanded);
    $("#menuButton").setAttribute('aria-expanded', String(expanded));
    $("#sidebar").inert = mobile && !expanded;
    if (expanded) $("#sidebar .nav-item.active")?.focus();
    else if (returnFocus && mobile) $("#menuButton").focus();
  }

  function setPage(page) {
    if (!pageTitles[page]) return;
    if (page !== 'scanner') qrisDemo?.pause();
    reportDemo?.onPage(page);
    kurDemo?.onPage(page);
    $$(".page").forEach((item) => item.classList.toggle("active", item.dataset.page === page));
    $$("[data-page]").filter((item) => item.matches("button")).forEach((item) => item.classList.toggle("active", item.dataset.page === page));
    $("#pageTitle").textContent = pageTitles[page];
    $$('.side-nav [data-page], .mobile-nav [data-page]').forEach(button => {
      if (button.dataset.page === page) button.setAttribute('aria-current', 'page');
      else button.removeAttribute('aria-current');
    });
    const focusWasInMenu = $("#sidebar").contains(document.activeElement);
    setMobileMenu(false, focusWasInMenu);
    window.scrollTo({ top: 0, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
    if (page === "dashboard") renderDashboard();
    if (page === "transactions") renderTransactions();
    if (page === "finance") renderFinance();
    if (page === "financing") renderFinancing();
  }

  function periodTotals(key = selectedPeriod) {
    const items = state.transactions.filter((item) => key === "all" || monthKey(item.date) === key);
    const lines = items.flatMap(journalLines);
    const income = money(lines.filter(line => line.kind === 'Pendapatan').reduce((total, line) => total + line.credit - line.debit, 0));
    const expense = money(lines.filter(line => line.kind === 'Beban').reduce((total, line) => total + line.debit - line.credit, 0));
    const unclassified = items.filter(item => !journalLines(item).length).length;
    return { income, expense, profit: money(income - expense), count: items.length, unclassified };
  }

  function previousMonthKey(key = currentMonthKey) {
    const [year, month] = key.split("-").map(Number);
    const date = new Date(year, month - 2, 1);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
  }

  function trendText(current, previous) {
    if (!previous) return "belum ada pembanding";
    const change = Math.round(((current - previous) / previous) * 100);
    return `${change >= 0 ? "↗" : "↘"} ${Math.abs(change)}% vs bulan lalu`;
  }

  let kurMerchantFilter = "all";
  function getFinancingAnalysis() {
    return window.PRISMA_KUR.analyze(state.transactions, { period: selectedPeriod, merchant: kurMerchantFilter, asOf: new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Jakarta" }).format(TODAY) });
  }

  function financingComponents() { return getFinancingAnalysis().components; }

  function getScore() {
    return financingComponents().reduce((total, component) => total + component.value, 0);
  }

  function renderDashboard() {
    const totals = periodTotals();
    const previous = selectedPeriod === "all" ? { income: 0, expense: 0 } : periodTotals(previousMonthKey(selectedPeriod));
    const score = getScore();
    $("#metricRevenue").textContent = formatIDR(totals.income);
    $("#metricExpense").textContent = formatIDR(totals.expense);
    $("#metricProfit").textContent = formatIDR(totals.profit);
    $("#metricMargin").textContent = "belum disesuaikan";
    $("#metricRevenueTrend").textContent = trendText(totals.income, previous.income);
    $("#metricRevenueTrend").className = `trend ${totals.income >= previous.income ? "good" : "neutral"}`;
    $("#metricExpenseTrend").textContent = trendText(totals.expense, previous.expense);
    $("#metricExpenseTrend").className = `trend ${totals.expense <= previous.expense ? "good" : "neutral"}`;
    $("#metricScore").textContent = score;
    $("#heroNet").textContent = formatSigned(totals.profit);
    $("#heroRecordCount").textContent = `${state.transactions.length} transaksi tercatat`;
    renderChart();
    renderActivity();
  }

  function renderChart() {
    const months = Array.from({ length: 6 }, (_, index) => {
      const date = new Date(TODAY.getFullYear(), TODAY.getMonth() - (5 - index), 1);
      return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    });
    const labels = months.map((key) => new Intl.DateTimeFormat("id-ID", { month: "short" }).format(new Date(`${key}-01T12:00:00`)));
    const series = months.map((key) => periodTotals(key));
    const max = Math.max(...series.flatMap((item) => [item.income, item.expense]), 1) * 1.15;
    const width = 720;
    const height = 250;
    const pad = { left: 34, right: 12, top: 16, bottom: 28 };
    const chartW = width - pad.left - pad.right;
    const chartH = height - pad.top - pad.bottom;
    const point = (value, index) => ({
      x: pad.left + (chartW / (months.length - 1)) * index,
      y: pad.top + chartH - (value / max) * chartH
    });
    const revenue = series.map((item, index) => point(item.income, index));
    const expense = series.map((item, index) => point(item.expense, index));
    const smoothPath = (points) => points.reduce((path, p, i) => {
      if (i === 0) return `M ${p.x} ${p.y}`;
      const prev = points[i - 1];
      const mid = (prev.x + p.x) / 2;
      return `${path} C ${mid} ${prev.y}, ${mid} ${p.y}, ${p.x} ${p.y}`;
    }, "");
    const area = `${smoothPath(revenue)} L ${revenue.at(-1).x} ${pad.top + chartH} L ${revenue[0].x} ${pad.top + chartH} Z`;
    const grid = [0, .25, .5, .75, 1].map((v) => {
      const y = pad.top + chartH - v * chartH;
      return `<line x1="${pad.left}" y1="${y}" x2="${width - pad.right}" y2="${y}" stroke="var(--line)" stroke-width="1"/><text class="chart-label" x="0" y="${y + 3}">${compactCurrency.format(max * v).replace(/Rp\s?/, "")}</text>`;
    }).join("");
    const xLabels = labels.map((label, index) => `<text class="chart-label" x="${revenue[index].x}" y="${height - 4}" text-anchor="middle">${label}</text>`).join("");
    const dots = revenue.map((p) => `<circle cx="${p.x}" cy="${p.y}" r="3.5" fill="var(--surface)" stroke="var(--primary)" stroke-width="2"/>`).join("");
    $("#cashChart").innerHTML = `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Grafik omzet dan pengeluaran">
      <defs><linearGradient id="areaFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="var(--primary)" stop-opacity=".23"/><stop offset="1" stop-color="var(--primary)" stop-opacity="0"/></linearGradient></defs>
      ${grid}<path d="${area}" fill="url(#areaFill)" stroke="none"/><path d="${smoothPath(revenue)}" fill="none" stroke="var(--primary)" stroke-width="3"/><path d="${smoothPath(expense)}" fill="none" stroke="var(--teal)" stroke-width="2.5" stroke-dasharray="6 6"/>${dots}${xLabels}</svg>`;
  }

  function renderActivity() {
    const items = [...state.transactions].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5);
    $("#activityList").innerHTML = items.map((item) => `<div class="activity-item">
      <div class="activity-icon ${item.type === "expense" ? "expense" : ""}"><svg><use href="#${item.source.startsWith("qris") ? "i-scan" : "i-receipt"}"/></svg></div>
      <div><strong>${esc(item.merchant)}</strong><small>${dateFormat.format(new Date(`${item.date}T12:00:00`))} · ${item.source.startsWith("qris") ? "QRIS SETTLEMENT" : "OCR"}</small></div>
      <div class="activity-amount ${item.type === "expense" ? "expense" : ""}">${item.type === "expense" ? "−" : "+"}${formatIDR(item.amount)}</div>
    </div>`).join("");
  }

  function renderTransactions() {
    const query = $("#transactionSearch").value.trim().toLowerCase();
    const rows = [...state.transactions]
      .filter((item) => activeFilter === "all" || (activeFilter === "qris" ? item.source.startsWith("qris") : item.source === activeFilter))
      .filter((item) => !query || `${item.merchant} ${item.description} ${transactionAccount(item)?.name || item.account} ${transactionAccount(item)?.code || ''} ${item.externalId || ""}`.toLowerCase().includes(query))
      .sort((a, b) => b.date.localeCompare(a.date));
    $("#transactionRows").innerHTML = rows.map((item) => `<tr>
      <td class="muted">${dateFormat.format(new Date(`${item.date}T12:00:00`))}</td>
      <td><span class="source-badge ${item.source.startsWith("qris") ? "qris" : "ocr"}">${item.source.startsWith("qris") ? "QRIS" : "OCR"}</span></td>
      <td><b>${esc(item.merchant)}</b><br><span class="muted">${esc(item.description)}</span>${item.externalId ? `<br><small class="muted">${esc(item.externalId)}${item.qris?.transactionTime ? ` · ${esc(item.qris.transactionTime)}` : ""}</small>` : ""}</td>
      <td><label class="sr-only" for="account-${esc(item.id)}">Akun ${esc(item.externalId || item.id)}</label><select class="account-select" id="account-${esc(item.id)}" data-account-id="${esc(item.id)}">${accountOptions(item.type, transactionAccount(item)?.code)}</select>${!transactionAccount(item) ? '<small class="verification-note">Belum masuk jurnal: pilih klasifikasi.</small>' : ''}${item.type === 'expense' ? `<br><label class="sr-only" for="payment-${esc(item.id)}">Pembayaran ${esc(item.id)}</label><select class="account-select" id="payment-${esc(item.id)}" data-payment-id="${esc(item.id)}"><option value="">Pilih sumber pembayaran</option>${['1101', '1102', '2101'].map(code => `<option value="${code}" ${paymentAccount(item)?.code === code ? 'selected' : ''}>${accountByCode(code).name}</option>`).join('')}</select>${!item.paymentAccountCode ? '<small class="verification-note">Kas: asumsi struk versi lama.</small>' : ''}` : ''}</td>
      <td class="amount ${item.type === "expense" ? "expense" : ""}">${item.type === "expense" ? "−" : "+"}${formatIDR(item.amount)}${item.qris?.netAmount != null ? `<br><small class="muted">Bersih ${formatIDR(netReceived(item))}<br>MDR ${formatIDR(item.qris.mdr || 0)} · Promo ${formatIDR(item.qris.promo || 0)}</small>` : ""}</td>
      <td><button class="row-delete" data-delete="${esc(item.id)}" aria-label="Hapus transaksi ${esc(item.merchant)}"><svg><use href="#i-trash"/></svg></button></td>
    </tr>`).join("");
    $("#transactionEmpty").hidden = rows.length > 0;
  }

  function journalLines(item) {
    const account = transactionAccount(item);
    if (!account) return [];
    const line = (code, debit, credit) => { const a = accountByCode(code); return { accountCode: a.code, account: a.name, kind: a.kind, group: a.group, debit: money(debit), credit: money(credit) }; };
    if (item.type === "income") {
      return [
        line(item.source?.startsWith('qris') ? '1202' : '1101', netReceived(item), 0),
        ...(item.qris?.mdr ? [line('6105', item.qris.mdr, 0)] : []),
        ...(item.qris?.promo ? [line('6106', item.qris.promo, 0)] : []),
        line(account.code, 0, item.amount)
      ];
    }
    const payment = paymentAccount(item);
    return payment ? [line(account.code, item.amount, 0), line(payment.code, 0, item.amount)] : [];
  }

  function renderFinance() {
    const totals = periodTotals();
    $("#reportRevenue").textContent = formatIDR(totals.income);
    $("#reportExpense").textContent = formatIDR(totals.expense);
    $("#reportProfit").textContent = formatIDR(totals.profit);
    const periodItems = state.transactions.filter(item => selectedPeriod === "all" || monthKey(item.date) === selectedPeriod);
    const rows = [...periodItems].sort((a, b) => b.date.localeCompare(a.date)).flatMap((item) => journalLines(item).map((line) => ({ ...line, date: item.date, id: item.externalId || item.id })));
    $("#journalRows").innerHTML = rows.map((line) => `<tr><td class="muted">${dateFormat.format(new Date(`${line.date}T12:00:00`))}</td><td class="muted">${esc(line.id)}</td><td><b>${line.accountCode} · ${esc(line.account)}</b><br><small class="muted">${esc(line.kind)} / ${esc(line.group)}</small></td><td class="amount">${line.debit ? formatIDR(line.debit) : "—"}</td><td class="amount">${line.credit ? formatIDR(line.credit) : "—"}</td></tr>`).join("") || '<tr><td colspan="5" class="table-empty">Belum ada jurnal yang dapat ditampilkan.</td></tr>';
    const debit = money(rows.reduce((total, line) => total + line.debit, 0));
    const credit = money(rows.reduce((total, line) => total + line.credit, 0));
    $("#journalBalance").textContent = !rows.length ? 'Belum ada jurnal' : debit === credit ? 'Debit = kredit' : 'Perlu diperiksa';
    $("#journalTotals").innerHTML = `<tr><th colspan="3">Total periode</th><td class="amount">${formatIDR(debit)}</td><td class="amount">${formatIDR(credit)}</td></tr>`;
    $("#journalWarning").textContent = `${totals.unclassified ? `${totals.unclassified} transaksi belum terklasifikasi dan belum masuk jurnal. Pilih akun di Riwayat transaksi. ` : ''}Ringkasan hanya mencakup jurnal tercatat, bukan laporan SAK EMKM lengkap. Saldo awal, HPP, penyusutan, pajak, dan pencairan QRIS belum dilengkapi otomatis. Pisahkan usaha berbeda; rekap gabungan merchant bukan laporan satu entitas.`;
    const movement = code => money(rows.filter(line => line.accountCode === code).reduce((total, line) => total + line.debit - line.credit, 0));
    $("#bankBalance").textContent = formatIDR(movement('1202'));
    $("#cashBalance").textContent = formatIDR(movement('1101'));
    $("#assetBalance").textContent = formatIDR(movement('1301') + movement('1302') + movement('1303'));
    $("#accountBalances").innerHTML = ACCOUNTS.filter(account => rows.some(line => line.accountCode === account.code)).map(account => {
      const group = rows.filter(line => line.accountCode === account.code);
      return `<tr><td>${account.code}</td><td>${esc(account.name)}</td><td>${esc(account.kind)} / ${esc(account.group)}</td><td class="amount">${formatIDR(group.reduce((t, l) => t + l.debit, 0))}</td><td class="amount">${formatIDR(group.reduce((t, l) => t + l.credit, 0))}</td></tr>`;
    }).join('') || '<tr><td colspan="5" class="table-empty">Belum ada mutasi akun.</td></tr>';
    $("#accountDirectory").innerHTML = ACCOUNTS.map(account => `<tr><td>${account.code}</td><td>${esc(account.name)}</td><td>${esc(account.kind)}</td><td>${esc(account.group)}</td></tr>`).join('');
  }

  function renderFinancing() {
    let data = getFinancingAnalysis();
    if (kurMerchantFilter !== "all" && !data.merchants.some(item => item.key === kurMerchantFilter)) { kurMerchantFilter = "all"; data = getFinancingAnalysis(); }
    window.PRISMA_KUR.render(data, { formatIDR, esc, merchant: kurMerchantFilter });
    $("#metricScore").textContent = data.score;
  }

  function renderProfile() {
    $("#todayLabel").textContent = new Intl.DateTimeFormat("id-ID", { weekday: "long", day: "2-digit", month: "long", year: "numeric" }).format(TODAY);
    $("#businessName").value = state.profile.name;
    $("#businessType").value = state.profile.type;
    $("#businessCity").value = state.profile.city;
    $("#sideBusiness").textContent = state.profile.name;
    $$(".business-chip b").forEach((item) => item.textContent = state.profile.name);
    $("#consentLjk").checked = state.consent.ljk;
    $("#consentGov").checked = state.consent.gov;
  }

  function settlementDate(value) {
    if (value == null || value === "") return null;
    if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value)) {
      const day = value.slice(0, 10);
      const date = new Date(`${day}T12:00:00Z`);
      return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === day ? day : null;
    }
    if (typeof value === "number") {
      const timestamp = value < 1e12 ? value * 1000 : value;
      const date = new Date(timestamp);
      return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
    }
    const parsed = parseReceiptDate(String(value || ""));
    if (parsed) return parsed;
    return null;
  }

  function pickField(record, names) {
    const keys = Object.keys(record || {});
    const normalized = new Map(keys.map((key) => [key.toLowerCase().replace(/[^a-z0-9]/g, ""), key]));
    for (const name of names) {
      const key = normalized.get(name.toLowerCase().replace(/[^a-z0-9]/g, ""));
      if (key && record[key] !== "" && record[key] != null) return record[key];
    }
    return "";
  }

  function parseCsv(text) {
    text = text.replace(/^\uFEFF/, "");
    const firstLine = text.split(/\r?\n/)[0];
    const delimiter = [";", "\t", ","].sort((a, b) => firstLine.split(b).length - firstLine.split(a).length)[0];
    const rows = [];
    let row = [];
    let cell = "";
    let quoted = false;
    for (let index = 0; index < text.length; index += 1) {
      const char = text[index];
      if (char === '"' && text[index + 1] === '"' && quoted) { cell += '"'; index += 1; continue; }
      if (char === '"') { quoted = !quoted; continue; }
      if (!quoted && char === delimiter) { row.push(cell.trim()); cell = ""; continue; }
      if (!quoted && (char === "\n" || char === "\r")) {
        if (char === "\r" && text[index + 1] === "\n") index += 1;
        row.push(cell.trim()); cell = "";
        if (row.some(Boolean)) rows.push(row);
        row = [];
        continue;
      }
      cell += char;
    }
    if (quoted) throw new Error("CSV memiliki tanda kutip yang belum ditutup.");
    row.push(cell.trim());
    if (row.some(Boolean)) rows.push(row);
    if (rows.length < 2) return [];
    const headers = rows[0].map((header, index) => header || `column_${index}`);
    if (new Set(headers.map(header => header.toLowerCase().replace(/[^a-z0-9]/g, ""))).size !== headers.length) throw new Error("Header CSV berulang. Gunakan laporan asli tanpa kolom duplikat.");
    return rows.slice(1).map((values) => {
      if (values.length !== headers.length) throw new Error("Jumlah kolom CSV tidak sesuai header. Periksa pemisah dan kutip nominal.");
      return Object.fromEntries(headers.map((header, index) => [header, values[index] || ""]));
    });
  }

  function normalizeSettlementRecords(payload) {
    let records = payload;
    if (typeof payload === "string") {
      try { records = JSON.parse(payload); } catch { records = parseCsv(payload); }
    }
    if (records && !Array.isArray(records) && typeof records === "object") {
      records = records.transactions || records.settlements || records.payments || records.items || records.results || records.data || [];
    }
    if (!Array.isArray(records)) throw new Error("Respons settlement harus berupa daftar transaksi.");
    const issues = [];
    const accepted = records.map((record, index) => {
      const reject = (reason) => { issues.push({ row: index + 2, reason }); return null; };
      if (!record || typeof record !== "object") return reject("Baris tidak valid");
      const status = String(pickField(record, ["settlement_status", "transaction_status", "payment_status", "status", "status transaksi"])).trim().toLowerCase();
      if (!["success", "succeeded", "settled", "settlement", "paid", "completed", "berhasil", "sukses", "lunas"].includes(status)) return reject("Status belum berhasil");
      const method = String(pickField(record, ["payment_type", "payment_method", "tipe pembayaran", "metode pembayaran"])).toLowerCase();
      if (method && !/^qris(?:\s|$)/.test(method)) return reject("Metode bukan QRIS");
      const currencyCode = String(pickField(record, ["currency", "mata uang"])).toUpperCase();
      if (currencyCode && currencyCode !== "IDR" && currencyCode !== "360") return reject("Mata uang bukan IDR");
      const nativeGoPay = Object.keys(record).some(key => key.toLowerCase().replace(/[^a-z0-9]/g, "") === "notransaksi");
      let amount, netAmount, mdr = 0, promo = 0;
      if (nativeGoPay) {
        // GoPay exports ungrouped numbers with a dot for fractional rupiah.
        const readMoney = (name) => {
          const value = String(pickField(record, [name])).trim();
          if (!/^\d+(?:\.\d{1,2})?$/.test(value)) return NaN;
          const number = Number(value);
          return Number.isSafeInteger(Math.round(number * 100)) ? money(number) : NaN;
        };
        amount = readMoney("Harga");
        netAmount = readMoney("Pendapatan Bersih");
        mdr = readMoney("MDR");
        promo = readMoney("Pengeluaran Promo");
        if (![amount, netAmount, mdr, promo].every(Number.isFinite) || amount <= 0) return reject("Nominal GoPay tidak valid atau tidak lengkap");
        if (Math.round(amount * 100) - Math.round(mdr * 100) - Math.round(promo * 100) !== Math.round(netAmount * 100)) return reject("Harga dikurangi MDR dan promo tidak sama dengan pendapatan bersih");
      } else {
        amount = parseReceiptAmount(pickField(record, ["amount", "gross_amount", "settlement_amount", "paid_amount", "total", "nominal", "pendapatan", "jumlah pembayaran", "nominal transaksi"]));
        if (!Number.isFinite(amount) || amount <= 0 || !Number.isSafeInteger(Math.round(amount * 100))) return reject("Nominal tidak valid");
        netAmount = amount;
      }
      const externalId = String(pickField(record, ["No. Transaksi", "id", "transaction_id", "transactionId", "reference", "rrn", "invoice", "order_id", "external_id", "id pesanan", "id referensi gopay", "id transaksi"]) || "").trim();
      const dateInput = pickField(record, nativeGoPay ? ["Transaksi Dibuat"] : ["settled_at", "settlement_date", "paid_at", "created_at", "transaction_date", "date", "timestamp", "tanggal", "tanggal & waktu", "tanggal transaksi", "transaction_time"]);
      const date = settlementDate(dateInput);
      if (!externalId) return reject("ID transaksi kosong");
      if (!date) return reject("Tanggal tidak dikenali");
      const transactionTime = String(dateInput).match(/\b([01]\d|2[0-3]):[0-5]\d:[0-5]\d\b/)?.[0] || "";
      const merchant = String(pickField(record, ["Toko", "merchant", "merchant_name", "store_name", "description", "customer_name", "payee", "nama cabang", "nama toko"]) || state.profile.name || "Merchant QRIS").trim();
      return { externalId, date, transactionTime, merchant: merchant.slice(0, 100), amount, netAmount, mdr, promo, status,
        merchantId: String(pickField(record, ["Merchant ID", "merchant_id"])), reference: String(pickField(record, ["No. Ref", "reference", "rrn"])),
        statusUpdated: String(pickField(record, ["Status Diperbarui"])),
        description: String(pickField(record, ["Catatan", "description", "product", "remark", "note"]) || "Penerimaan QRIS GoPay").slice(0, 160), raw: record };
    }).filter(Boolean);
    accepted.skipped = issues.length;
    accepted.issues = issues;
    return accepted;
  }

  function renderQrisConnection() {
    const connection = state.qrisConnection || defaultState.qrisConnection;
    if ($("#qrisProvider")) $("#qrisProvider").value = "gopay_merchant";
    const status = $("#qrisConnectionStatus");
    if (status) {
      status.textContent = "Impor laporan · belum terhubung langsung";
      status.className = "connection-status";
    }
    if ($("#qrisLastSync")) $("#qrisLastSync").textContent = connection.lastSync ? `Impor terakhir: ${dateFormat.format(new Date(connection.lastSync))}` : "Belum ada impor";
    const report = connection.lastReport;
    const summary = $("#qrisImportSummary");
    if (summary) {
      summary.hidden = !report;
      if (report) summary.innerHTML = `<h4>Laporan terakhir · ${report.count} transaksi valid</h4><p>${esc(report.firstDate)} — ${esc(report.lastDate)} · ${report.added} baru, ${report.duplicates} duplikat, ${report.skipped} dilewati</p><dl><div><dt>Penjualan kotor</dt><dd>${formatIDR(report.gross)}</dd></div><div><dt>MDR</dt><dd>${formatIDR(report.mdr)}</dd></div><div><dt>Promo</dt><dd>${formatIDR(report.promo)}</dd></div><div><dt>Penerimaan bersih</dt><dd>${formatIDR(report.net)}</dd></div></dl><p>Total di atas mencakup semua baris valid dalam file, termasuk duplikat. Duplikat tidak ditambahkan kembali ke catatan.</p>`;
    }
  }

  function logQrisSync(title, detail, type = "success") {
    const log = $("#qrisSyncLog");
    if (!log) return;
    const empty = $(".sync-log-empty", log);
    if (empty) empty.remove();
    const row = document.createElement("div");
    row.className = `sync-log-row ${type}`;
    row.innerHTML = `<i>${type === "error" ? "!" : "✓"}</i><div><b>${esc(title)}</b><small>${esc(detail)}</small></div><time>${new Intl.DateTimeFormat("id-ID", { hour: "2-digit", minute: "2-digit" }).format(new Date())}</time>`;
    log.prepend(row);
  }

  function planSettlementImport(records) {
    const key = (item) => JSON.stringify([item.qris?.provider || state.qrisConnection.provider, item.externalId]);
    const known = new Map(state.transactions.filter(item => item.externalId).map(item => [key(item), item]));
    const fresh = [];
    let duplicates = 0;
    for (const item of records) {
      const previous = known.get(key(item));
      if (previous) {
        const previousNet = previous.netAmount ?? netReceived(previous);
        if (previous.amount !== item.amount || previous.date !== item.date || previousNet !== item.netAmount ||
            (previous.mdr ?? previous.qris?.mdr ?? 0) !== item.mdr || (previous.promo ?? previous.qris?.promo ?? 0) !== item.promo) {
          throw new Error("ID transaksi yang sama memiliki tanggal atau nominal berbeda. Periksa laporan sebelum mengimpor.");
        }
        duplicates += 1;
      } else { known.set(key(item), item); fresh.push(item); }
    }
    return { fresh, duplicates };
  }

  function importSummary(records) {
    const dates = records.map(item => item.date).sort();
    return { count: records.length, gross: sum(records), mdr: sum(records.map(item => ({ amount: item.mdr }))),
      promo: sum(records.map(item => ({ amount: item.promo }))), net: sum(records.map(item => ({ amount: item.netAmount }))),
      firstDate: dates[0] || "", lastDate: dates.at(-1) || "" };
  }

  function issueSummary(records) {
    const counts = new Map();
    (records.issues || []).forEach(item => counts.set(item.reason, (counts.get(item.reason) || 0) + 1));
    return [...counts].map(([reason, count]) => `${count} ${reason.toLowerCase()}`).join("; ");
  }

  function saveSettlementRecords(records, origin = "Laporan") {
    const { fresh, duplicates } = planSettlementImport(records);
    const before = structuredClone(state);
    fresh.forEach((item) => state.transactions.push({ id: uid("QRIS"), externalId: item.externalId, date: item.date, source: "qris_settlement", merchant: item.merchant, description: item.description, amount: item.amount, type: "income", account: "Pendapatan usaha", accountCode: '4100', qris: { provider: state.qrisConnection.provider, settlementStatus: item.status, importedFrom: origin, netAmount: item.netAmount, mdr: item.mdr, promo: item.promo, merchantId: item.merchantId, reference: item.reference, transactionTime: item.transactionTime, statusUpdated: item.statusUpdated, raw: item.raw } }));
    state.qrisConnection.lastSync = new Date().toISOString();
    state.qrisConnection.lastImported = fresh.length;
    state.qrisConnection.lastReport = { ...importSummary(records), added: fresh.length, duplicates, skipped: records.skipped || 0 };
    try { saveState(); } catch { state = before; throw new Error("Penyimpanan perangkat penuh atau tidak tersedia. Tidak ada transaksi baru disimpan."); }
    selectedPeriod = "all";
    renderAll();
    $("#qrisTransactionsFound").textContent = `${fresh.length} transaksi baru`;
    logQrisSync(fresh.length ? `${fresh.length} transaksi masuk` : "Tidak ada transaksi baru", `${origin} · ${records.length} valid, ${records.skipped || 0} dilewati, ${duplicates} duplikat${records.skipped ? `. ${issueSummary(records)}` : ""}`);
    return fresh.length;
  }

  async function importSettlementFile(file) {
    if (!file) return;
    const button = $("#importSettlement");
    if (button.disabled) return;
    button.disabled = true;
    try {
      if (file.size > 10 * 1024 * 1024) throw new Error("Ukuran laporan maksimal 10 MB.");
      const text = await file.text();
      const records = normalizeSettlementRecords(text);
      if (!records.length) throw new Error(`Tidak ada transaksi yang dapat diimpor. ${issueSummary(records) || "Laporan kosong atau format tidak dikenali."}`);
      state.qrisConnection.provider = "gopay_merchant";
      const plan = planSettlementImport(records);
      const totals = importSummary(plan.fresh);
      if (!window.confirm(`${records.length} transaksi valid · ${plan.fresh.length} baru · ${plan.duplicates} duplikat.\n\nPenjualan kotor: ${formatIDR(totals.gross)}\nMDR: ${formatIDR(totals.mdr)}\nPromo: ${formatIDR(totals.promo)}\nPenerimaan bersih baru: ${formatIDR(totals.net)}\n\n${records.skipped ? `Dilewati: ${issueSummary(records)}.\n\n` : ""}Simpan transaksi baru?`)) return;
      const added = saveSettlementRecords(records, file.name);
      toast("Laporan berhasil diimpor", `${added} transaksi baru disimpan; ${plan.duplicates} duplikat dilewati. Ringkasan menampilkan semua periode.`);
    } catch (error) {
      logQrisSync("Impor gagal", error.message || "Format file tidak dikenali.", "error");
      toast("File settlement tidak terbaca", error.message || "Periksa format settlement.", "error");
    } finally { $("#settlementFile").value = ""; button.disabled = false; }
  }

  function fileToImage(file) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("image")); };
      img.src = url;
    });
  }

  function loadTesseract() {
    if (window.Tesseract) return Promise.resolve(window.Tesseract);
    return new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "https://cdnjs.cloudflare.com/ajax/libs/tesseract.js/5.0.4/tesseract.min.js";
      script.onload = () => resolve(window.Tesseract);
      script.onerror = () => reject(new Error("OCR library"));
      document.head.appendChild(script);
    });
  }

  function parseReceiptAmount(value) {
    if (typeof value === "number") return Number.isFinite(value) ? value : 0;
    const input = String(value || "").trim().replace(/^Rp\.?\s*/i, "").replace(/\s/g, "");
    if (!/^-?\d[\d.,]*$/.test(input)) return 0;
    const text = input;
    if (!text) return 0;
    const lastComma = text.lastIndexOf(",");
    const lastDot = text.lastIndexOf(".");
    const separator = Math.max(lastComma, lastDot);
    const tailLength = separator >= 0 ? text.length - separator - 1 : 0;
    if (separator >= 0 && tailLength > 0 && tailLength < 3) return Number(text.slice(0, separator).replace(/[.,]/g, "") + "." + text.slice(separator + 1)) || 0;
    return Number(text.replace(/[.,]/g, "")) || 0;
  }

  function normalizeReceiptLine(line) {
    return String(line || "").replace(/[|]/g, " ").replace(/\s+/g, " ").trim();
  }

  function parseReceiptDate(text) {
    const months = { jan: 1, januari: 1, feb: 2, februari: 2, mar: 3, maret: 3, apr: 4, april: 4, mei: 5, may: 5, jun: 6, juni: 6, jul: 7, juli: 7, aug: 8, agu: 8, agt: 8, agustus: 8, sep: 9, sept: 9, september: 9, oct: 10, okt: 10, oktober: 10, nov: 11, november: 11, des: 12, desember: 12, dec: 12 };
    const iso = String(text).match(/\b(20\d{2})-(\d{2})-(\d{2})\b/);
    if (iso) {
      const date = new Date(iso[0] + "T12:00:00Z");
      return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === iso[0] ? iso[0] : null;
    }
    const numeric = String(text).match(/\b(\d{1,2})[\/.\-](\d{1,2})[\/.\-](20\d{2}|\d{2})\b/);
    let day;
    let month;
    let year;
    if (numeric) {
      day = Number(numeric[1]); month = Number(numeric[2]); year = Number(numeric[3]);
    } else {
      const words = String(text).toLowerCase().match(/\b(\d{1,2})\s+([a-z]+)\s+(\d{2,4})\b|\b([a-z]+)\s+(\d{1,2}),?\s+(\d{2,4})\b/);
      if (!words) return null;
      if (words[1]) { day = Number(words[1]); month = months[words[2].slice(0, 3)] || months[words[2]]; year = Number(words[3]); }
      else { month = months[words[4].slice(0, 3)] || months[words[4]]; day = Number(words[5]); year = Number(words[6]); }
    }
    if (!month || !day || !year) return null;
    if (year < 100) year += year >= 70 ? 1900 : 2000;
    const date = new Date(year, month - 1, day);
    if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
    return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }

  function parseReceiptItems(lines) {
    const items = [];
    const itemPattern = /^\s*(\d{1,3})\s+(.+?)\s+(?:rp\s*)?([0-9][0-9.,]*)\s*$/i;
    lines.forEach((line) => {
      const clean = normalizeReceiptLine(line);
      const match = clean.match(itemPattern);
      if (!match || /check|tanggal|date|subtotal|total|payment|tunai|cash|debit|credit|closed|change|kembali|tax|pajak/i.test(clean)) return;
      const name = match[2].replace(/\s+$/, "").trim();
      const price = parseReceiptAmount(match[3]);
      const quantity = Number(match[1]);
      if (name.length >= 2 && price > 0 && quantity > 0 && quantity < 1000) items.push({ name: name.slice(0, 90), quantity, unitPrice: Math.round(price / quantity), total: price });
    });
    return items;
  }

  function renderOcrItems(items = []) {
    const list = $("#ocrItems");
    if (!list) return;
    list.innerHTML = items.map((item, index) => `<div class="ocr-item" data-index="${index}"><input class="ocr-item-qty" aria-label="Jumlah ${esc(item.name)}" inputmode="numeric" value="${esc(item.quantity || 1)}"><input class="ocr-item-name" aria-label="Nama produk" value="${esc(item.name)}"><input class="ocr-item-price" aria-label="Harga ${esc(item.name)}" inputmode="numeric" value="${esc(new Intl.NumberFormat("id-ID").format(item.unitPrice || item.total || 0))}"><button type="button" class="row-delete ocr-item-remove" aria-label="Hapus produk"><svg><use href="#i-trash"/></svg></button></div>`).join("");
    list.querySelectorAll("input").forEach((input) => input.addEventListener("input", updateOcrReconciliation));
    list.querySelectorAll(".ocr-item-remove").forEach((button) => button.addEventListener("click", () => { button.closest(".ocr-item").remove(); updateOcrReconciliation(); }));
    updateOcrReconciliation();
  }

  function readOcrItems() {
    return $$(".ocr-item", $("#ocrItems")).map((row) => {
      const quantity = Number($(".ocr-item-qty", row).value);
      const name = $(".ocr-item-name", row).value.trim();
      const unitPrice = parseReceiptAmount($(".ocr-item-price", row).value);
      return { name, quantity, unitPrice, total: quantity * unitPrice };
    });
  }

  function updateOcrReconciliation() {
    const itemsTotal = sum(readOcrItems().map((item) => ({ amount: item.total })));
    const total = parseAmount($("#ocrAmount")?.value);
    $("#ocrItemsTotal").textContent = formatIDR(itemsTotal);
    const status = $("#ocrMatchStatus");
    if (!status) return;
    if (!itemsTotal) status.textContent = "Tidak ada item terbaca";
    else if (!total) status.textContent = "Masukkan total struk";
    else if (itemsTotal === total) status.textContent = "Cocok dengan total struk";
    else status.textContent = `Selisih ${formatIDR(Math.abs(total - itemsTotal))}`;
    status.className = itemsTotal && total && itemsTotal === total ? "match" : "mismatch";
  }

  async function prepareReceiptImage(file) {
    const source = "createImageBitmap" in window ? await createImageBitmap(file) : await fileToImage(file);
    const scale = Math.min(3, 2400 / Math.max(source.width, source.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(source.width * scale);
    canvas.height = Math.round(source.height * scale);
    const context = canvas.getContext("2d", { willReadFrequently: true });
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    context.filter = "grayscale(1) contrast(1.35) brightness(1.05)";
    context.drawImage(source, 0, 0, canvas.width, canvas.height);
    if (source.close) source.close();
    return canvas;
  }

  function extractReceipt(text) {
    const lines = String(text).split(/\r?\n/).map(normalizeReceiptLine).filter(Boolean);
    const items = parseReceiptItems(lines);
    const candidates = lines.map((line, index) => {
      const match = line.match(/^(grand\s*total|total(?:\s*(?:bayar|akhir))?|jumlah(?:\s*bayar)?|amount\s*due|subtotal)\s*[:=-]?\s*(.*)$/i);
      if (!match) return null;
      const token = match[2].match(/(?:Rp\.?\s*)?(-?\d[\d.,]*)\s*$/i)?.[1] ||
        (/^(?:Rp\.?\s*)?\d[\d.,]*$/i.test(lines[index + 1] || "") ? lines[index + 1] : "");
      const amount = parseReceiptAmount(token);
      return amount > 0 ? { amount, rank: /^subtotal$/i.test(match[1]) ? 1 : /^grand/i.test(match[1]) ? 3 : 2 } : null;
    }).filter(Boolean).sort((a, b) => b.rank - a.rank);
    const total = candidates[0]?.amount || 0;
    const merchant = lines.slice(0, Math.max(2, lines.findIndex((line) => /check\s*(no|number)|invoice|subtotal|total/i.test(line)))).find((line) => {
      const letters = (line.match(/[A-Za-z]/g) || []).length;
      const digits = (line.match(/\d/g) || []).length;
      return letters >= 4 && letters > digits * 2 && !/^(?:jl[.\s]|jalan\b|tel|alamat|\d)|www\.|@|pos\s*\d|kasir|receipt|struk|tanggal|date|closed|boulevard/i.test(line);
    }) || "";
    return { merchant: merchant.slice(0, 70), amount: total, date: parseReceiptDate(text) || "", items };
  }

  let ocrBusy = false;
  async function processReceipt(file) {
    if (!file || ocrBusy) return;
    if (!file.type.startsWith("image/") || file.size > 15 * 1024 * 1024) { toast("Gambar tidak didukung", "Gunakan gambar maksimal 15 MB.", "error"); return; }
    ocrBusy = true;
    let worker;
    $("#ocrForm").hidden = true;
    const previewUrl = URL.createObjectURL(file);
    $("#receiptPreview").src = previewUrl;
    $("#receiptPreview").hidden = false;
    $("#receiptDrop").hidden = true;
    $("#ocrProgress").hidden = false;
    $("#ocrStage").textContent = "Memuat mesin OCR…";
    try {
      const Tesseract = await loadTesseract();
      const prepared = await prepareReceiptImage(file);
      worker = await Tesseract.createWorker("ind+eng", 1, {
        logger: (message) => {
          const pct = Math.round((message.progress || 0) * 100);
          $("#ocrStage").textContent = message.status === "recognizing text" ? "Membaca isi struk…" : "Menyiapkan OCR…";
          $("#ocrPercent").textContent = `${pct}%`;
          $("#ocrBar").style.width = `${pct}%`;
        }
      });
      await worker.setParameters({ preserve_interword_spaces: "1", tessedit_pageseg_mode: "6", user_defined_dpi: "300" });
      const result = await worker.recognize(prepared);
      const raw = result?.data?.text || "";
      if (raw.trim().length < 8) throw new Error("Teks pada struk terlalu sedikit.");
      const parsed = extractReceipt(raw);
      $("#ocrMerchant").value = parsed.merchant;
      $("#ocrAmount").value = parsed.amount ? new Intl.NumberFormat("id-ID").format(parsed.amount) : "";
      $("#ocrDate").value = parsed.date;
      $("#ocrRaw").textContent = raw;
      renderOcrItems(parsed.items);
      $("#ocrEmpty").hidden = true;
      $("#ocrForm").hidden = false;
      toast("OCR selesai", `${parsed.items.length} produk dan total ${formatIDR(parsed.amount)} terbaca. Periksa hasil sebelum menyimpan.`);
    } catch (error) {
      toast("OCR belum berhasil", error.message || "Pastikan koneksi tersedia dan foto cukup jelas.", "error");
      resetOcr();
    } finally {
      if (worker) await worker.terminate().catch(() => {});
      ocrBusy = false;
      $("#ocrProgress").hidden = true;
      $("#receiptFile").value = "";
      setTimeout(() => URL.revokeObjectURL(previewUrl), 1000);
    }
  }

  function resetOcr() {
    $("#receiptPreview").hidden = true;
    $("#receiptPreview").removeAttribute("src");
    $("#receiptDrop").hidden = false;
    $("#ocrProgress").hidden = true;
    $("#ocrEmpty").hidden = false;
    $("#ocrForm").hidden = true;
    $("#ocrBar").style.width = "0";
    $("#ocrRaw").textContent = "";
    $("#ocrCategory").value = '';
    $("#ocrPayment").value = '';
    if ($("#ocrItems")) $("#ocrItems").innerHTML = "";
    if ($("#ocrItemsTotal")) $("#ocrItemsTotal").textContent = formatIDR(0);
    if ($("#ocrMatchStatus")) $("#ocrMatchStatus").textContent = "Periksa sebelum menyimpan";
  }

  function saveOcrTransaction(event) {
    event.preventDefault();
    const merchant = $("#ocrMerchant").value.trim();
    const amount = parseAmount($("#ocrAmount").value);
    const date = $("#ocrDate").value;
    const account = accountByCode($("#ocrCategory").value);
    const paymentCode = $("#ocrPayment").value;
    if (!account?.receipt || !['1101', '1102', '2101'].includes(paymentCode)) {
      toast('Klasifikasi belum lengkap', 'Pilih akun dan sumber pembayaran sesuai struk.', 'error');
      return;
    }
    if (!merchant || !date || amount <= 0) {
      toast("Data belum lengkap", "Isi merchant, tanggal, dan total struk.", "error");
      return;
    }
    const items = readOcrItems();
    if (items.some(item => !item.name || !Number.isFinite(item.quantity) || item.quantity <= 0 || item.unitPrice <= 0)) {
      toast("Produk belum lengkap", "Periksa nama, jumlah, dan harga setiap produk, atau hapus baris yang tidak digunakan.", "error");
      return;
    }
    const itemsTotal = sum(items.map((item) => ({ amount: item.total })));
    if (items.length && itemsTotal !== amount && !window.confirm(`Jumlah produk ${formatIDR(itemsTotal)} berbeda dari total struk ${formatIDR(amount)}. Simpan tetap?`)) return;
    state.transactions.push({ id: uid("OCR"), date, source: "ocr", merchant, description: items.length ? `${items.length} produk dari OCR` : "Pembelian / beban dari OCR", amount, type: "expense", account: account.name, accountCode: account.code, paymentAccountCode: paymentCode, items, ocr: { verifiedByUser: true, itemsTotal, rawText: $("#ocrRaw").textContent } });
    saveState();
    renderAll();
    resetOcr();
    toast("Struk disimpan", `${formatIDR(amount)} telah diklasifikasikan sebagai pengeluaran.`);
  }

  function renderPeriodSelector() {
    const select = $("#reportPeriod");
    const months = [...new Set([currentMonthKey, ...state.transactions.map(item => monthKey(item.date))])].sort().reverse();
    if (selectedPeriod !== "all" && !months.includes(selectedPeriod)) selectedPeriod = currentMonthKey;
    select.innerHTML = '<option value="all">Semua periode</option>' + months.map(month => `<option value="${esc(month)}">${new Intl.DateTimeFormat("id-ID", { month: "long", year: "numeric" }).format(new Date(`${month}-01T12:00:00`))}</option>`).join("");
    select.value = selectedPeriod;
  }

  function renderAll() {
    renderPeriodSelector();
    renderProfile();
    renderQrisConnection();
    renderDashboard();
    renderTransactions();
    renderFinance();
    renderFinancing();
  }

  function registerWebMcp() {
    const context = document.modelContext;
    if (!context?.registerTool) return;
    const response = (value) => JSON.stringify(value);
    try {
      context.registerTool({
        name: "get_business_summary",
        description: "Membaca ringkasan omzet, pengeluaran, laba, jumlah transaksi, dan skor informasi pembiayaan pada PRISMA.",
        inputSchema: { type: "object", properties: {}, additionalProperties: false },
        annotations: { readOnlyHint: true, consequentialHint: false, untrustedContentHint: false },
        execute: async () => {
          const totals = periodTotals();
          return response({ period: selectedPeriod, revenue: totals.income, expense: totals.expense, estimated_profit: totals.profit, transaction_count: totals.count, financing_information_score: getScore() });
        }
      });
      context.registerTool({
        name: "import_qris_settlement",
        description: "Membaca daftar settlement QRIS penjual dari JSON atau CSV, menyaring status berhasil, dan mencatat transaksi baru ke jurnal lokal PRISMA.",
        inputSchema: {
          type: "object",
          required: ["settlements"],
          properties: { settlements: { type: "string", description: "JSON array/object settlement atau CSV dengan transaction_id, amount, status, dan date" }, provider: { type: "string" } },
          additionalProperties: false
        },
        annotations: { readOnlyHint: false, consequentialHint: true, untrustedContentHint: true },
        execute: async ({ settlements, provider = "gopay_merchant" }) => {
          try {
            const records = normalizeSettlementRecords(settlements);
            state.qrisConnection.provider = provider;
            const count = saveSettlementRecords(records, provider);
            return response({ ok: true, imported: count, read: records.length });
          } catch (error) { return response({ ok: false, error: error.message || "Settlement tidak dapat dibaca." }); }
        }
      });
      context.registerTool({
        name: "set_data_consent",
        description: "Mengubah pilihan persetujuan lokal untuk berbagi ringkasan ke LJK atau data agregat anonim ke pemerintah.",
        inputSchema: {
          type: "object",
          required: ["purpose", "enabled"],
          properties: { purpose: { type: "string", enum: ["ljk", "government_aggregate"] }, enabled: { type: "boolean" } },
          additionalProperties: false
        },
        annotations: { readOnlyHint: false, consequentialHint: false, untrustedContentHint: false },
        execute: async ({ purpose, enabled }) => {
          if (purpose === "ljk") state.consent.ljk = Boolean(enabled);
          else state.consent.gov = Boolean(enabled);
          saveState();
          renderAll();
          return response({ ok: true, consent: state.consent });
        }
      });
    } catch (error) {
      console.debug("WebMCP tools are not available in this browser.", error);
    }
  }

  function bindEvents() {
    $("#transactionRows").addEventListener('change', event => {
      const select = event.target.closest('[data-account-id], [data-payment-id]');
      if (!select) return;
      const item = state.transactions.find(row => row.id === (select.dataset.accountId || select.dataset.paymentId));
      const account = accountByCode(select.value);
      if (!item || !account) { renderTransactions(); return; }
      const isPayment = Boolean(select.dataset.paymentId);
      if (isPayment ? !['1101', '1102', '2101'].includes(account.code) : !transactionAccount({ ...item, accountCode: account.code })) return;
      if (!window.confirm(`Ubah ${isPayment ? 'sumber pembayaran' : 'klasifikasi'} transaksi ${item.externalId || item.id} menjadi ${account.code} · ${account.name}? Nominal tidak diubah.`)) { renderTransactions(); return; }
      const before = structuredClone(item);
      if (isPayment) item.paymentAccountCode = account.code;
      else { item.accountCode = account.code; item.account = account.name; }
      try { saveState(); } catch { Object.keys(item).forEach(key => delete item[key]); Object.assign(item, before); toast('Perubahan tidak tersimpan', 'Penyimpanan perangkat tidak tersedia.', 'error'); }
      renderAll();
    });
    $("#kurMerchant").addEventListener("change", (event) => { kurMerchantFilter = event.target.value; renderFinancing(); });
    $$(".kur-tab").forEach(button => button.addEventListener("click", () => {
      $$(".kur-tab").forEach(tab => { const active = tab === button; tab.classList.toggle("active", active); tab.setAttribute("aria-selected", String(active)); });
      $$(".kur-panel").forEach(panel => { panel.hidden = panel.id !== button.getAttribute("aria-controls"); });
    }));
    $("#reportPeriod").addEventListener("change", (event) => { selectedPeriod = event.target.value; renderAll(); });
    $$("[data-page]").filter((item) => item.matches("button")).forEach((button) => button.addEventListener("click", () => setPage(button.dataset.page)));
    $$('[data-page-jump]').forEach((button) => button.addEventListener("click", () => setPage(button.dataset.pageJump)));
    $("#menuButton").addEventListener("click", () => setMobileMenu(true));
    $("#scrim").addEventListener("click", () => setMobileMenu(false, true));
    window.matchMedia('(max-width: 940px)').addEventListener('change', () => setMobileMenu(false));
    setMobileMenu(false);
    $$('.side-nav .active, .mobile-nav .active').forEach(button => button.setAttribute('aria-current', 'page'));
    document.addEventListener('keydown', event => {
      if (!document.body.classList.contains('menu-open')) return;
      if (event.key === 'Escape') { event.preventDefault(); setMobileMenu(false, true); }
      if (event.key === 'Tab') {
        const buttons = $$('#sidebar button:not([disabled])');
        const first = buttons[0], last = buttons.at(-1);
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    });
    $$('.table-scroll').forEach(wrapper => {
      if (wrapper.closest('[data-page="transactions"]')) return;
      wrapper.tabIndex = 0;
      wrapper.setAttribute('role', 'region');
      wrapper.setAttribute('aria-label', 'Tabel rincian, geser ke samping untuk kolom lainnya');
      const hint = document.createElement('p');
      hint.className = 'mobile-table-hint';
      hint.textContent = 'Geser tabel ke samping untuk melihat semua kolom ↔';
      wrapper.before(hint);
    });
    $("#themeButton").addEventListener("click", () => {
      state.theme = state.theme === "dark" ? "light" : "dark";
      document.documentElement.dataset.theme = state.theme;
      saveState();
    });
    $("#notificationButton")?.addEventListener("click", () => {
      const totals = periodTotals();
      toast("Status usaha", `${totals.count} transaksi pada bulan ini · ${formatIDR(totals.profit)} laba estimasi.`);
    });
    $$(".capture-tab").forEach((button) => button.addEventListener("click", () => {
      if (button.dataset.capture !== 'demo') qrisDemo?.pause();
      $$(".capture-tab").forEach((tab) => { tab.classList.toggle("active", tab === button); tab.setAttribute("aria-selected", String(tab === button)); });
      $$(".capture-panel").forEach((panel) => panel.classList.toggle("active", panel.dataset.capturePanel === button.dataset.capture));
    }));
    $("#uploadReceipt").addEventListener("click", () => $("#receiptFile").click());
    $("#receiptFile").addEventListener("change", (event) => processReceipt(event.target.files[0]));
    $("#resetOcr").addEventListener("click", resetOcr);
    $("#ocrAmount").addEventListener("input", (event) => {
      const amount = parseAmount(event.target.value);
      event.target.value = amount ? new Intl.NumberFormat("id-ID").format(amount) : "";
      updateOcrReconciliation();
    });
    $("#addOcrItem")?.addEventListener("click", () => {
      const items = readOcrItems();
      items.push({ name: "", quantity: 1, unitPrice: 0, total: 0 });
      renderOcrItems(items);
      const names = $$(".ocr-item-name", $("#ocrItems"));
      names.at(-1)?.focus();
    });
    $("#ocrForm").addEventListener("submit", saveOcrTransaction);
    $("#importSettlement")?.addEventListener("click", () => $("#settlementFile").click());
    $("#settlementFile")?.addEventListener("change", (event) => importSettlementFile(event.target.files[0]));
    $("#exportBackup")?.addEventListener("click", exportBackup);
    $("#importBackup")?.addEventListener("click", () => $("#backupFile").click());
    $("#backupFile")?.addEventListener("change", (event) => importBackupFile(event.target.files[0]));
    $("#clearData")?.addEventListener("click", clearLocalData);
    $("#exportLjk")?.addEventListener("click", exportLjkPacket);
    $("#exportGov")?.addEventListener("click", exportGovPacket);
    $$("[data-filter]").forEach((button) => button.addEventListener("click", () => {
      activeFilter = button.dataset.filter;
      $$("[data-filter]").forEach((item) => item.classList.toggle("active", item === button));
      renderTransactions();
    }));
    $("#transactionSearch").addEventListener("input", renderTransactions);
    $("#transactionRows").addEventListener("click", (event) => {
      const button = event.target.closest("[data-delete]");
      if (!button) return;
      const item = state.transactions.find((transaction) => transaction.id === button.dataset.delete);
      if (!item || !window.confirm(`Hapus transaksi ${item.merchant} senilai ${formatIDR(item.amount)}?`)) return;
      state.transactions = state.transactions.filter((transaction) => transaction.id !== item.id);
      saveState();
      renderAll();
      toast("Transaksi dihapus", "Jurnal dan ringkasan telah diperbarui.");
    });
    $("#consentLjk").addEventListener("change", (event) => { state.consent.ljk = event.target.checked; saveState(); renderFinancing(); toast("Preferensi diperbarui", event.target.checked ? "Paket ringkasan LJK siap dibuat saat Anda menekan tombol unduh." : "Berbagi ke LJK dinonaktifkan."); });
    $("#consentGov").addEventListener("change", (event) => { state.consent.gov = event.target.checked; saveState(); renderFinancing(); toast("Preferensi diperbarui", event.target.checked ? "Data agregat anonim diaktifkan." : "Data agregat dinonaktifkan."); });
    $("#profileForm").addEventListener("submit", (event) => {
      event.preventDefault();
      state.profile = { name: $("#businessName").value.trim() || "Usaha Saya", type: $("#businessType").value.trim(), city: $("#businessCity").value.trim() };
      saveState();
      renderProfile();
      renderFinancing();
      toast("Profil tersimpan", "Identitas laporan lokal telah diperbarui.");
    });
  }

  function init() {
    document.documentElement.dataset.theme = state.theme;
    $("#ocrCategory").innerHTML = accountOptions('expense');
    bindEvents();
    renderAll();
    qrisDemo = window.PRISMA_DEMO.mount($("#qrisDemo"), journalLines);
    reportDemo = window.PRISMA_REPORT_DEMO.mount(ACCOUNTS);
    kurDemo = window.PRISMA_KUR_DEMO.mount(ACCOUNTS, () => { setPage('finance'); $('#financeDemoButton').click(); });
    registerWebMcp();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
