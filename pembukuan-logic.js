// Logika murni Neraca Awal, Pembukuan dan Evaluasi Usaha (tanpa DOM, mudah diuji).
// Rumus mengikuti sheet "Neraca Awal", "Pembukuan" dan "Evaluasi Usaha" pada Pembukuan_DBL_revisi.xlsx.
//
// Sumber data (semua dari menu yang sudah ada di aplikasi):
//   transactions  -> penjualan (Transaksi / Riwayat)
//   expenses      -> HPP (Belanja Bahan + Operasional) dan Gaji (menu Pengeluaran)
//   assets        -> penyusutan & peralatan (menu Aset & Penyusutan)
//   liabilities / receivables -> hutang & piutang beserta pembayarannya
//   opening       -> Neraca Awal (kas awal, persediaan awal, asumsi sewa, target)

export const TEMPO = 'Tempo / Kasbon';
export const BK_DEFAULTS = {
  kas: 0, persediaan: 0, peralatan: 0, akum: 0, hutang: 0,
  rentYear: 0, rentStart: '', life: 8, residualPct: 0, taxPct: 0,
  tFood: 0.35, tSalary: 0.25, tMargin: 0.10, tSales: 0,
  tHppVar: 0.10, // batas selisih HPP aktual vs standar (10%)
  stockEnd: {},  // nilai persediaan akhir per bulan { 'YYYY-MM': rupiah } hasil stok opname
};

const n = v => Number(v) || 0;
export const pad = x => String(x).padStart(2, '0');
export const round2 = v => Math.round(n(v) * 100) / 100;

// ---------- tanggal (string YYYY-MM-DD, tanpa zona waktu) ----------
export const ymOf = d => String(d || '').slice(0, 7);
export const ymIdx = ym => { const [y, m] = String(ym).split('-').map(Number); return y * 12 + (m - 1); };
export const idxYm = i => `${Math.floor(i / 12)}-${pad((i % 12) + 1)}`;
export const addMonths = (ym, k) => idxYm(ymIdx(ym) + k);
export const daysIn = ym => { const [y, m] = ym.split('-').map(Number); return new Date(y, m, 0).getDate(); };
export const monthFrom = ym => `${ym}-01`;
export const monthTo = ym => `${ym}-${pad(daysIn(ym))}`;
export const localToday = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export function daysBetween(a, b) { // b - a (hari)
  const p = s => { const [y, m, d] = s.split('-').map(Number); return Date.UTC(y, m - 1, d); };
  return Math.round((p(b) - p(a)) / 86400000);
}
export function addMonthsDate(date, k) { // seperti EDATE
  const [y, m, d] = date.split('-').map(Number);
  const i = y * 12 + (m - 1) + k, yy = Math.floor(i / 12), mm = (i % 12) + 1;
  return `${yy}-${pad(mm)}-${pad(Math.min(d, daysIn(`${yy}-${pad(mm)}`)))}`;
}
// Bulan-bulan yang tersentuh rentang from..to, dengan bobot hari (1 = bulan penuh).
export function rangeMonths(from, to) {
  const out = [];
  if (!from || !to || from > to) return out;
  for (let i = ymIdx(ymOf(from)); i <= ymIdx(ymOf(to)); i++) {
    const ym = idxYm(i), a = from > monthFrom(ym) ? from : monthFrom(ym), b = to < monthTo(ym) ? to : monthTo(ym);
    out.push({ ym, frac: (daysBetween(a, b) + 1) / daysIn(ym) });
  }
  return out;
}

export const normSku = s => String(s ?? '').trim().toUpperCase();

// ---------- pengaturan pembukuan (disimpan di record openingBalance 'main') ----------
export function normOpening(raw = {}) {
  const o = { ...BK_DEFAULTS, ...raw };
  if (raw.kas === undefined && (raw.cash !== undefined || raw.bank !== undefined)) o.kas = n(raw.cash) + n(raw.bank); // migrasi data lama
  for (const k of ['kas', 'persediaan', 'peralatan', 'akum', 'hutang', 'rentYear', 'life', 'residualPct', 'taxPct', 'tFood', 'tSalary', 'tMargin', 'tSales', 'tHppVar']) o[k] = n(o[k]);
  o.stockEnd = raw.stockEnd && typeof raw.stockEnd === 'object' ? { ...raw.stockEnd } : {};
  if (!(o.life > 0)) o.life = BK_DEFAULTS.life;
  o.date = o.date || '';
  return o;
}

// ---------- aset & penyusutan ----------
export function assetInfo(a, asOf = localToday()) {
  const value = n(a.value), residual = n(a.residual), life = Math.max(1, n(a.life) || 1), months = life * 12;
  const monthly = Math.max(0, (value - residual) / months);
  const buy = ymOf(a.date || asOf);
  const through = Math.min(months, Math.max(0, ymIdx(ymOf(asOf)) - ymIdx(buy) + 1)); // sampai bulan asOf (termasuk)
  const accum = Math.min(value - residual, monthly * through);
  return { monthly, annual: monthly * 12, accum, book: value - accum, months, buy };
}
export const assetDepInMonth = (a, ym) => {
  const { monthly, months, buy } = assetInfo(a), k = ymIdx(ym) - ymIdx(buy);
  return k >= 0 && k < months ? monthly : 0;
};
export const assetAccumBefore = (a, ym) => {
  const { monthly, months, buy } = assetInfo(a);
  return monthly * Math.min(months, Math.max(0, ymIdx(ym) - ymIdx(buy)));
};

// ---------- hutang & piutang ----------
export const paidOf = x => (x.payments || []).reduce((s, p) => s + n(p.amount), 0);
export const remainOf = x => Math.max(0, n(x.amount) - paidOf(x));
export function debtStatus(x, today = localToday()) {
  const r = remainOf(x);
  if (r <= 0) return 'Lunas';
  return x.due && x.due < today ? 'Jatuh tempo' : 'Belum lunas';
}

// ---------- kelompok pengeluaran ----------
// Kelompok: bahan + operasional = HPP (pembelian); gaji; beban = Utilitas, Transportasi & beban usaha lain (di luar HPP).
export const defaultExpenseGroup = t => (t === 'Bahan baku' ? 'bahan' : t === 'Gaji' ? 'gaji' : t === 'Utilitas' || t === 'Transportasi' ? 'beban' : 'operasional');
export const groupOf = (e, groups = {}) => groups[e.type] || defaultExpenseGroup(e.type);

// ---------- persediaan (nilai Rp) untuk HPP aktual ----------
// HPP aktual = persediaan awal + pembelian (bahan + operasional) - persediaan akhir.
// Persediaan awal bulan = persediaan akhir bulan sebelumnya (bila belum diisi, dibawa dari bulan terakhir yang terisi,
// atau dari Neraca Awal). Bila persediaan akhir belum diisi, dianggap tidak berubah (HPP = pembelian).
export function stockOpening(o, ym) {
  const start = ymOf(o.date);
  if (!start || ymIdx(ym) <= ymIdx(start)) return n(o.persediaan);
  for (let i = ymIdx(ym) - 1; i >= ymIdx(start); i--) { const v = o.stockEnd[idxYm(i)]; if (v !== undefined && v !== null && v !== '') return n(v); }
  return n(o.persediaan);
}
export function stockClose(o, ym) {
  const v = o.stockEnd[ym];
  return v !== undefined && v !== null && v !== '' ? n(v) : stockOpening(o, ym);
}
export const stockClosed = (o, ym) => { const v = o.stockEnd[ym]; return v !== undefined && v !== null && v !== ''; };

// Selisih HPP aktual vs HPP standar (HPP produk x terjual). Batas peringatan = o.tHppVar (default 10%).
export function hppVariance(p, threshold = 0.10) {
  if (!(p.hppStandar > 0)) return { status: 'na', pct: 0, text: 'Belum ada HPP standar (isi HPP produk di Kelola Produk)' };
  if (p.hppCoverage < 0.8) return { status: 'na', pct: p.selisihPct, text: `HPP produk baru terisi untuk ${Math.round(p.hppCoverage * 100)}% penjualan; lengkapi HPP produk agar pembanding akurat` };
  const pct = p.selisihPct, a = Math.abs(pct) * 100, lim = Math.round(threshold * 100);
  if (Math.abs(pct) <= threshold) return { status: 'ok', pct, text: `Wajar: selisih HPP ${a.toLocaleString('id-ID', { maximumFractionDigits: 1 })}% (batas ${lim}%)` };
  return pct > 0
    ? { status: 'warn', pct, text: `Perhatian: HPP aktual ${a.toLocaleString('id-ID', { maximumFractionDigits: 1 })}% di atas HPP standar (batas ${lim}%). Cek pemborosan, bahan rusak, atau kenaikan harga bahan` }
    : { status: 'warn', pct, text: `Perhatian: HPP aktual ${a.toLocaleString('id-ID', { maximumFractionDigits: 1 })}% di bawah HPP standar (batas ${lim}%). HPP produk mungkin terlalu tinggi, atau persediaan akhir belum diisi` };
}

// ---------- laba rugi (sheet "Laba Rugi") untuk rentang tanggal ----------
export function pnl(d, from, to) {
  const o = normOpening(d.opening), tx = (d.transactions || []).filter(x => x.date >= from && x.date <= to);
  const ex = (d.expenses || []).filter(x => x.date >= from && x.date <= to);
  const sum = (l, f) => l.reduce((s, x) => s + f(x), 0);
  const r = {};
  r.tunai = sum(tx.filter(x => x.payment === 'Tunai'), x => n(x.subtotal));
  r.tempo = sum(tx.filter(x => x.payment === TEMPO), x => n(x.subtotal));
  r.nontunai = sum(tx, x => n(x.subtotal)) - r.tunai - r.tempo; // QRIS, transfer, kartu, e-wallet
  r.bruto = r.tunai + r.nontunai + r.tempo;
  r.diskon = sum(tx, x => n(x.discount));
  r.bersih = r.bruto - r.diskon;
  r.trx = tx.length;
  r.avgTrx = r.trx ? r.bersih / r.trx : 0;
  r.hariBuka = new Set(tx.filter(x => n(x.total) > 0).map(x => x.date)).size;
  const g = d.groups || {};
  r.bahan = sum(ex.filter(x => groupOf(x, g) === 'bahan'), x => n(x.amount));
  r.operasional = sum(ex.filter(x => groupOf(x, g) === 'operasional'), x => n(x.amount));
  r.hppBeli = r.bahan + r.operasional; // pembelian: bahan baku + operasional langsung (tanpa gaji, utilitas, transportasi)
  r.bebanLain = sum(ex.filter(x => groupOf(x, g) === 'beban'), x => n(x.amount)); // Utilitas, Transportasi, dst (di luar HPP)
  r.gaji = sum(ex.filter(x => groupOf(x, g) === 'gaji'), x => n(x.amount));
  const months = rangeMonths(from, to);
  r.perubahanStok = sum(months, m => (stockOpening(o, m.ym) - stockClose(o, m.ym)) * m.frac); // + bila stok turun (bahan terpakai dari persediaan)
  r.hpp = r.hppBeli + r.perubahanStok;
  r.labaKotor = r.bersih - r.hpp;
  r.marginKotor = r.bersih ? r.labaKotor / r.bersih : 0;
  r.sewa = o.rentYear ? sum(months, m => (o.rentYear / 12) * m.frac) : 0;
  r.penyusutan = sum(months, m => sum(d.assets || [], a => assetDepInMonth(a, m.ym) * m.frac));
  r.beban = r.gaji + r.bebanLain + r.sewa + r.penyusutan;
  r.labaSebelumPajak = r.labaKotor - r.beban;
  r.pajak = r.bruto * (o.taxPct / 100);
  r.labaBersih = r.labaSebelumPajak - r.pajak;
  r.marginBersih = r.bersih ? r.labaBersih / r.bersih : 0;
  r.foodCost = r.bersih ? r.hpp / r.bersih : 0;
  r.gajiPct = r.bersih ? r.gaji / r.bersih : 0;
  // HPP standar = HPP satuan produk (Kelola Produk, tersimpan di baris transaksi) x jumlah terjual
  let std = 0, valAll = 0, valCost = 0;
  for (const t of tx) for (const it of t.items || []) { const v = n(it.price) * n(it.qty); valAll += v; if (n(it.costPrice) > 0) valCost += v; std += n(it.costPrice) * n(it.qty); }
  r.hppStandar = std; r.hppCoverage = valAll ? valCost / valAll : 0;
  r.selisihHpp = r.hpp - std; r.selisihPct = std ? r.selisihHpp / std : 0;
  r.labaKotorStandar = r.bersih - std;
  r.breakEven = r.marginKotor > 0 ? r.beban / r.marginKotor : 0;
  return r;
}
export function monthlyPnl(d, startYm, count = 12) {
  return Array.from({ length: count }, (_, i) => { const ym = addMonths(startYm, i); return { ym, ...pnl(d, monthFrom(ym), monthTo(ym)) }; });
}

// ---------- kas (sheet "Buku Kas" & "Arus Kas") ----------
// Kejadian kas: penjualan non-tempo masuk pada hari transaksi; piutang masuk saat dibayar;
// pengeluaran keluar pada hari dicatat kecuali metode "Hutang"; hutang keluar saat dibayar.
export function cashEvents(d, from = '', to = '9999-12-31') {
  const ev = [];
  for (const t of d.transactions || []) {
    if (t.payment === TEMPO) continue;
    ev.push({ date: t.date, kind: 'in', amount: n(t.total), label: `Penjualan ${t.invoice || ''}`.trim(), method: t.payment, src: 'penjualan' });
  }
  for (const e of d.expenses || []) {
    if (e.payment === 'Hutang') continue;
    ev.push({ date: e.date, kind: 'out', amount: n(e.amount), label: `${e.type || 'Pengeluaran'}: ${e.name || ''}`, method: e.payment || 'Tunai', src: 'pengeluaran' });
  }
  for (const x of d.receivables || []) for (const p of x.payments || []) ev.push({ date: p.date, kind: 'in', amount: n(p.amount), label: `Piutang: ${x.name}`, method: p.method || 'Tunai', src: 'piutang' });
  for (const x of d.liabilities || []) for (const p of x.payments || []) ev.push({ date: p.date, kind: 'out', amount: n(p.amount), label: `Hutang: ${x.name}`, method: p.method || 'Tunai', src: 'hutang' });
  const start = (d.opening && normOpening(d.opening).date) || '';
  return ev.filter(e => e.amount && e.date && e.date >= from && e.date <= to && (!start || e.date >= start)).sort((a, b) => a.date.localeCompare(b.date));
}
export function cashBalanceAt(d, date) { // saldo kas & bank pada akhir 'date'
  const o = normOpening(d.opening);
  return o.kas + cashEvents(d, '', date).reduce((s, e) => s + (e.kind === 'in' ? e.amount : -e.amount), 0);
}
export function cashBook(d, from, to) { // baris per kejadian + saldo berjalan
  const o = normOpening(d.opening);
  let saldo = cashBalanceAt(d, addDay(from, -1));
  const open = saldo;
  const rows = cashEvents(d, from, to).map(e => { saldo += e.kind === 'in' ? e.amount : -e.amount; return { ...e, saldo }; });
  return { open, rows, close: saldo, in: rows.filter(r => r.kind === 'in').reduce((s, r) => s + r.amount, 0), out: rows.filter(r => r.kind === 'out').reduce((s, r) => s + r.amount, 0), start: o.date };
}
export function addDay(date, k) {
  const [y, m, dd] = date.split('-').map(Number), t = new Date(Date.UTC(y, m - 1, dd + k));
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}
export function monthlyCash(d, startYm, count = 12) {
  const o = normOpening(d.opening); let saldo = o.kas;
  return Array.from({ length: count }, (_, i) => {
    const ym = addMonths(startYm, i), ev = cashEvents(d, monthFrom(ym), monthTo(ym));
    const masuk = ev.filter(e => e.kind === 'in').reduce((s, e) => s + e.amount, 0), keluar = ev.filter(e => e.kind === 'out').reduce((s, e) => s + e.amount, 0);
    saldo += masuk - keluar;
    const laba = pnl(d, monthFrom(ym), monthTo(ym)).labaBersih;
    return { ym, masuk, keluar, bersih: masuk - keluar, saldo, laba, selisih: masuk - keluar - laba };
  });
}

// ---------- neraca awal (sheet "Neraca Awal") ----------
export function neraca(d, today = localToday()) {
  const o = normOpening(d.opening), assets = d.assets || [];
  const startYm = ymOf(o.date);
  const useAssets = assets.length > 0;
  const aset = useAssets ? assets.filter(a => !startYm || ymOf(a.date) <= startYm) : [];
  const peralatan = useAssets ? aset.reduce((s, a) => s + n(a.value), 0) : o.peralatan;
  const akum = useAssets ? aset.reduce((s, a) => s + assetAccumBefore(a, startYm || ymOf(today)), 0) : o.akum;
  let sewaDimuka = 0, jatuhTempo = '', sisaHari = null;
  if (o.rentYear && o.rentStart && startYm) {
    const used = ymIdx(startYm) - ymIdx(ymOf(o.rentStart));
    sewaDimuka = (o.rentYear * Math.max(0, 12 - used)) / 12;
  }
  if (o.rentStart) { jatuhTempo = addMonthsDate(o.rentStart, 12); sisaHari = daysBetween(today, jatuhTempo); }
  const totalAset = o.kas + o.persediaan + peralatan - akum + sewaDimuka;
  return { o, peralatan, akum, peralatanAuto: useAssets, sewaDimuka, totalAset, hutang: o.hutang, modal: totalAset - o.hutang, jatuhTempo, sisaHari };
}

// ---------- ringkasan hutang/piutang ----------
export function debtSummary(d) {
  const sisaHutang = (d.liabilities || []).reduce((s, x) => s + remainOf(x), 0);
  const sisaPiutang = (d.receivables || []).reduce((s, x) => s + remainOf(x), 0);
  return { sisaHutang, sisaPiutang };
}

// ---------- nilai stok produk (stok x HPP satuan) ----------
export const stockValue = products => (products || []).reduce((s, p) => (p.stock === null || p.stock === undefined || p.stock === '' ? s : s + n(p.stock) * n(p.costPrice)), 0);

// ---------- dashboard Pembukuan: indikator + peringatan otomatis ----------
export function pembukuan(d, ym, today = localToday()) {
  const o = normOpening(d.opening), from = monthFrom(ym), to = monthTo(ym), p = pnl(d, from, to);
  const cash = cashBook(d, from, to), ds = debtSummary(d), nr = neraca(d, today);
  const saldoNow = cashBalanceAt(d, today);
  const rupiah = v => 'Rp' + Math.round(v).toLocaleString('id-ID');
  const pct = (v, dec = 1) => (Math.round(v * 100 * 10 ** dec) / 10 ** dec).toLocaleString('id-ID') + '%';
  const warn = [];
  const add = (level, text) => warn.push({ level, text });
  if (!p.bersih) add('muted', 'Belum ada penjualan bulan ini');
  else {
    p.foodCost > o.tFood ? add('warn', `Perhatian: food cost ${pct(p.foodCost)} di atas target ${pct(o.tFood, 0)}`) : add('ok', `Aman: food cost ${pct(p.foodCost)}`);
    p.gajiPct > o.tSalary ? add('warn', `Perhatian: beban gaji ${pct(p.gajiPct)} di atas target ${pct(o.tSalary, 0)}`) : add('ok', `Aman: beban gaji ${pct(p.gajiPct)}`);
    p.marginBersih < o.tMargin ? add('warn', `Perhatian: margin bersih ${pct(p.marginBersih)} di bawah target ${pct(o.tMargin, 0)}`) : add('ok', `Aman: margin bersih ${pct(p.marginBersih)}`);
  }
  saldoNow < 0 ? add('warn', 'Perhatian: saldo kas negatif') : add('ok', 'Aman: saldo kas positif');
  if (nr.sisaHari !== null) nr.sisaHari <= 90 ? add('warn', `Perhatian: sewa jatuh tempo ${nr.sisaHari} hari lagi`) : add('ok', `Aman: sewa masih ${nr.sisaHari} hari`);
  const hv = hppVariance(p, o.tHppVar);
  if (hv.status !== 'na') add(hv.status === 'ok' ? 'ok' : 'warn', hv.text); else if (p.bersih) add('muted', hv.text);
  if (p.hppBeli && !stockClosed(o, ym)) add('muted', 'Persediaan akhir bulan belum diisi: HPP dianggap sama dengan pembelian');
  ds.sisaHutang > 0 ? add('warn', `Perhatian: ada hutang supplier ${rupiah(ds.sisaHutang)}`) : add('ok', 'Aman: tidak ada hutang supplier');
  return { ym, p, cash, saldoNow, ...ds, neraca: nr, warn, hv, stokAwal: stockOpening(o, ym), stokAkhir: stockClose(o, ym), stokAkhirTerisi: stockClosed(o, ym), nilaiStok: stockValue(d.products) };
}

// ---------- Evaluasi Usaha ----------
export function evaluasi(d, ym, today = localToday()) {
  const o = normOpening(d.opening), b = pembukuan(d, ym, today), p = b.p;
  const st = (empty, ok, okText, badText) => (empty ? '-' : ok ? okText : badText);
  const none = !p.bersih;
  const rows = [
    { key: 'bersih', label: 'Penjualan bersih', value: p.bersih, fmt: 'rp', target: o.tSales || null, status: o.tSales ? st(false, p.bersih >= o.tSales, 'Baik', 'Perlu perhatian') : '-', hint: 'Omzet setelah diskon.' },
    { key: 'trx', label: 'Jumlah transaksi', value: p.trx, fmt: 'num', status: '-', hint: 'Jumlah transaksi kasir pada bulan itu.' },
    { key: 'avg', label: 'Rata-rata nilai per transaksi', value: p.avgTrx, fmt: 'rp', status: '-', hint: 'Penjualan bersih dibagi jumlah transaksi; naikkan lewat paket/menu tambahan.' },
    { key: 'hari', label: 'Rata-rata penjualan bersih per hari buka', value: p.hariBuka ? p.bersih / p.hariBuka : 0, fmt: 'rp', status: '-', hint: 'Penjualan bersih dibagi jumlah hari yang ada penjualannya.' },
    { key: 'mk', label: 'Margin laba kotor', value: p.marginKotor, fmt: 'pct', status: '-', hint: 'Laba kotor dibagi penjualan bersih.' },
    { key: 'hppA', label: 'HPP aktual (pembelian ± perubahan persediaan)', value: p.hpp, fmt: 'rp', status: '-', hint: 'Persediaan awal + belanja bahan & operasional − persediaan akhir.' },
    { key: 'hppS', label: 'HPP standar (HPP produk × terjual)', value: p.hppStandar, fmt: 'rp', status: '-', hint: 'Dari HPP satuan di Kelola Produk.' },
    { key: 'hppV', label: 'Selisih HPP aktual vs standar', value: p.selisihPct, fmt: 'pct', target: o.tHppVar, status: b.hv.status === 'ok' ? 'Wajar' : b.hv.status === 'warn' ? 'Perlu perhatian' : '-', hint: 'Di atas batas = cek pemborosan/kenaikan harga bahan; di bawah batas negatif = HPP produk terlalu tinggi atau stok akhir belum diisi.' },
    { key: 'food', label: 'Food cost (HPP aktual / penjualan bersih)', value: p.foodCost, fmt: 'pct', target: o.tFood, status: st(none, p.foodCost <= o.tFood, 'Baik', 'Perlu perhatian'), hint: 'HPP dibagi penjualan bersih; makin kecil makin baik.' },
    { key: 'gaji', label: 'Beban gaji / penjualan bersih', value: p.gajiPct, fmt: 'pct', target: o.tSalary, status: st(none, p.gajiPct <= o.tSalary, 'Baik', 'Perlu perhatian'), hint: 'Gaji dibagi penjualan bersih.' },
    { key: 'mb', label: 'Margin laba bersih', value: p.marginBersih, fmt: 'pct', target: o.tMargin, status: st(none, p.marginBersih >= o.tMargin, 'Baik', 'Perlu perhatian'), hint: 'Laba bersih dibagi penjualan bersih; makin besar makin baik.' },
    { key: 'be', label: 'Titik impas penjualan bersih / bulan', value: p.breakEven, fmt: 'rp', status: st(none, p.bersih >= p.breakEven, 'Di atas titik impas', 'Di bawah titik impas'), hint: 'Penjualan minimum agar tidak rugi.' },
    { key: 'ak', label: 'Arus kas bersih', value: b.cash.in - b.cash.out, fmt: 'rp', status: st(!b.cash.in && !b.cash.out, b.cash.in - b.cash.out >= 0, 'Positif', 'Negatif'), hint: 'Kas masuk dikurangi kas keluar bulan itu.' },
    { key: 'saldo', label: 'Saldo kas & bank saat ini', value: b.saldoNow, fmt: 'rp', status: st(false, b.saldoNow >= 0, 'Positif', 'Negatif'), hint: 'Cocokkan dengan uang fisik + rekening.' },
    { key: 'stok', label: 'Nilai stok produk', value: b.nilaiStok, fmt: 'rp', status: '-', hint: 'Stok produk dikali HPP satuan (Kelola Produk).' },
    { key: 'hutang', label: 'Sisa hutang supplier', value: b.sisaHutang, fmt: 'rp', status: b.sisaHutang > 0 ? 'Ada hutang' : 'Bebas hutang', hint: 'Dari menu Hutang & Piutang.' },
    { key: 'piutang', label: 'Piutang + kasbon', value: b.sisaPiutang, fmt: 'rp', status: b.sisaPiutang > 0 ? 'Ada piutang' : 'Tidak ada', hint: 'Dari menu Hutang & Piutang.' },
  ];
  return { ym, rows, b };
}

// ---------- tambahan: stok produk & SKU ----------
export function findProductBySku(products, sku) {
  const k = normSku(sku);
  return k ? (products || []).find(p => normSku(p.sku) === k) || null : null;
}
export function skuTaken(products, sku, exceptId) {
  const k = normSku(sku);
  return !!k && (products || []).some(p => p.id !== exceptId && normSku(p.sku) === k);
}
export function nextSku(products, prefix = 'P') {
  const used = new Set((products || []).map(p => normSku(p.sku)));
  let i = (products || []).length + 1;
  while (used.has(`${prefix}${String(i).padStart(3, '0')}`)) i++;
  return `${prefix}${String(i).padStart(3, '0')}`;
}
