// UI menu Neraca Awal, Pembukuan dan Evaluasi Usaha. Rumus ada di pembukuan-logic.js.
import { all, put } from './db.js';
import * as BK from './pembukuan-logic.js';

const $ = id => document.getElementById(id);
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const rp = v => 'Rp' + Math.round(Number(v) || 0).toLocaleString('id-ID');
const pc = v => ((Number(v) || 0) * 100).toLocaleString('id-ID', { maximumFractionDigits: 1 }) + '%';
const num = v => (Number(v) || 0).toLocaleString('id-ID', { maximumFractionDigits: 2 });
const toast = s => window.toast?.(s);
const dmy = d => { const p = String(d || '').split('-'); return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : '—'; };
const label = ym => window.monthLabel(ym);
let bkTab = 'ringkas', nrLoaded = false;
const thisYm = () => BK.localToday().slice(0, 7);
const data = () => window.bookData();

// ---------- Neraca Awal ----------
const F = { nrDate: 'date', nrKas: 'kas', nrPersediaan: 'persediaan', nrPeralatan: 'peralatan', nrAkum: 'akum', nrHutang: 'hutang', nrNote: 'note', nrRentYear: 'rentYear', nrRentStart: 'rentStart', nrLife: 'life', nrTSales: 'tSales' };
const PCT = { nrResidual: 'residualPct', nrTax: 'taxPct', nrTFood: 'tFood', nrTSalary: 'tSalary', nrTMargin: 'tMargin' }; // tampil sebagai %, simpan: residual/tax dalam %, target dalam pecahan
const FRAC = new Set(['tFood', 'tSalary', 'tMargin']);

function readForm() {
  const o = {};
  for (const [id, k] of Object.entries(F)) o[k] = ['date', 'note', 'rentStart'].includes(k) ? $(id).value : Number($(id).value) || 0;
  for (const [id, k] of Object.entries(PCT)) { const v = Number($(id).value) || 0; o[k] = FRAC.has(k) ? v / 100 : v; }
  return o;
}
async function fillForm() {
  const d = await data(), o = BK.normOpening(d.opening), nr = BK.neraca(d);
  const x = { ...o, peralatan: nr.peralatan, akum: nr.akum };
  if (!x.date) x.date = BK.localToday().slice(0, 8) + '01';
  for (const [id, k] of Object.entries(F)) $(id).value = x[k] ?? '';
  for (const [id, k] of Object.entries(PCT)) $(id).value = FRAC.has(k) ? Math.round(o[k] * 10000) / 100 : o[k];
  const auto = nr.peralatanAuto;
  $('nrPeralatan').disabled = auto; $('nrAkum').disabled = auto;
  $('nrAsetHint').textContent = auto ? 'Otomatis dari menu Aset & Penyusutan (aset dibeli sebelum tanggal mulai pembukuan).' : 'Belum ada aset terdaftar: isi manual, atau rinci per alat di menu Aset & Penyusutan.';
  const sv = BK.stockValue(d.products);
  $('nrStokHint').textContent = 'Nilai stok sisa hasil hitung fisik saat mulai pembukuan.' + (sv ? ` Nilai stok produk saat ini: ${rp(sv)}.` : '');
  nrLoaded = true;
  await liveResult();
}
async function liveResult() {
  const d = await data();
  const form = readForm(), nr = BK.neraca({ ...d, opening: { ...d.opening, ...form, rentYear: form.rentYear } });
  const r = (a, b, c = '') => `<div class="kv ${c}"><span>${a}</span><b>${b}</b></div>`;
  $('nrResult').innerHTML = `<h2>Hasil perhitungan</h2>${r('Kas & tabungan usaha', rp(form.kas))}${r('Persediaan bahan baku', rp(form.persediaan))}${r('Peralatan (harga perolehan)', rp(nr.peralatan))}${r('Akumulasi penyusutan', '− ' + rp(nr.akum))}${r('<span>Sewa dibayar dimuka<small>Otomatis: sisa bulan sewa yang belum terpakai</small></span>', rp(nr.sewaDimuka))}${r('Total Aset', rp(nr.totalAset), 'total')}${r('Hutang awal', '− ' + rp(form.hutang))}${r('Modal Awal (estimasi)', rp(nr.modal), 'total')}${nr.jatuhTempo ? r('<span>Jatuh tempo perpanjangan sewa<small>Siapkan dana &amp; negosiasi 2–3 bulan sebelumnya</small></span>', `${dmy(nr.jatuhTempo)}<br><small>${nr.sisaHari >= 0 ? nr.sisaHari + ' hari lagi' : 'sudah lewat ' + -nr.sisaHari + ' hari'}</small>`) : ''}`;
}
async function saveNeraca() {
  const form = readForm();
  if (!form.date) return toast('Isi tanggal mulai pembukuan');
  if (form.life <= 0) return toast('Umur ekonomis harus lebih dari 0');
  const old = (await all('openingBalance')).find(x => x.id === 'main') || {};
  const nr = BK.neraca({ ...(await data()), opening: { ...old, ...form } });
  const rec = { ...old, ...form, id: 'main' };
  if (nr.peralatanAuto) { rec.peralatan = old.peralatan ?? 0; rec.akum = old.akum ?? 0; } // nilai otomatis tidak disimpan
  delete rec.cash; delete rec.bank;
  await put('openingBalance', rec);
  toast('Neraca awal tersimpan');
  await fillForm();
  window.refreshAll?.();
}

// ---------- Pembukuan ----------
const R = (a, b, c = '', cls = '') => `<tr class="${cls}"><td>${a}</td><td class="num">${b}</td><td class="muted">${c}</td></tr>`;
async function renderPembukuan() {
  const ym = $('bkMonth').value || thisYm(), d = await data(), o = BK.normOpening(d.opening);
  document.querySelectorAll('[data-bk-tab]').forEach(b => b.classList.toggle('active', b.dataset.bkTab === bkTab));
  const note = !o.date ? '<div class="warn warn">Neraca Awal belum diisi. Isi dulu agar saldo kas dan sewa dihitung benar. <button class="link" onclick="showPage(\'neraca\')">Buka Neraca Awal →</button></div>' : '';
  if (bkTab === 'ringkas') {
    const b = BK.pembukuan(d, ym), p = b.p;
    const rows = [
      R('Penjualan bruto', rp(p.bruto), 'Tunai + non-tunai + tempo sebelum diskon'), R('Penjualan bersih', rp(p.bersih), 'Setelah diskon'),
      R('Jumlah transaksi', num(p.trx), 'Dari menu Transaksi'), R('Rata-rata per transaksi', rp(p.avgTrx), 'Penjualan bersih ÷ transaksi'),
      R('HPP (belanja bahan + operasional)', rp(p.hpp), 'Dari menu Pengeluaran'), R('Laba kotor', rp(p.labaKotor), 'Penjualan bersih − HPP', 'sub'),
      R('Gaji & tunjangan', rp(p.gaji), 'Pengeluaran kelompok Gaji'), R('Total beban operasional', rp(p.beban), 'Gaji, sewa, penyusutan'),
      R('Laba bersih', rp(p.labaBersih), 'Setelah beban & pajak', 'tot'),
      R('Kas masuk bulan ini', rp(b.cash.in), 'Dari Buku Kas'), R('Kas keluar bulan ini', rp(b.cash.out), 'Dari Buku Kas'), R('Arus kas bersih', rp(b.cash.in - b.cash.out), 'Masuk − keluar', 'sub'),
      R('Saldo kas & bank saat ini', rp(b.saldoNow), 'Cocokkan dengan uang fisik + rekening'), R('Nilai stok produk', rp(b.nilaiStok), 'Stok × HPP satuan'),
      R('Sisa hutang supplier', rp(b.sisaHutang), 'Dari Hutang & Piutang'), R('Piutang + kasbon', rp(b.sisaPiutang), 'Dari Hutang & Piutang'),
      R('Sewa jatuh tempo', b.neraca.sisaHari === null ? '—' : b.neraca.sisaHari + ' hari lagi', 'Dari Neraca Awal'),
    ];
    $('bkBody').innerHTML = note + `<div class="bk-grid"><div class="panel"><div class="panel-head"><h2>Indikator ${label(ym)}</h2></div><div class="table-wrap"><table class="bk-table"><thead><tr><th>Indikator</th><th class="num">Nilai</th><th>Keterangan</th></tr></thead><tbody>${rows.join('')}</tbody></table></div></div>
      <div class="panel"><div class="panel-head"><h2>Peringatan otomatis</h2></div><div class="warn-list">${b.warn.map(w => `<div class="warn ${w.level}">${esc(w.text)}</div>`).join('')}</div>
      <p class="muted small">Alur: penjualan → kas &amp; omzet naik; pembelian/gaji → biaya &amp; kas turun; hutang/piutang → kas berubah saat dibayar. Rincian kas ada di Laporan › Buku Kas.</p></div></div>`;
  } else if (bkTab === 'labarugi') {
    const ms = BK.monthlyPnl(d, o.date ? BK.ymOf(o.date) : ym, 12), tot = k => ms.reduce((s, m) => s + m[k], 0);
    const line = (l, k, cls = '', f = rp) => `<tr class="${cls}"><td class="stick">${l}</td>${ms.map(m => `<td class="num">${f(m[k])}</td>`).join('')}<td class="num"><b>${f(tot(k))}</b></td></tr>`;
    $('bkBody').innerHTML = note + `<div class="panel"><div class="panel-head"><h2>Laba Rugi 12 bulan</h2><small>mulai ${label(o.date ? BK.ymOf(o.date) : ym)}</small></div><div class="table-wrap"><table class="bk-table"><thead><tr><th class="stick">Keterangan</th>${ms.map(m => `<th class="num">${label(m.ym)}</th>`).join('')}<th class="num">Total</th></tr></thead><tbody>
      ${line('Penjualan tunai', 'tunai')}${line('Penjualan non-tunai', 'nontunai')}${line('Penjualan tempo', 'tempo')}${line('Penjualan bruto', 'bruto', 'sub')}${line('(–) Diskon', 'diskon')}${line('Penjualan bersih', 'bersih', 'sub')}${line('HPP', 'hpp')}${line('Laba kotor', 'labaKotor', 'sub')}${line('Gaji', 'gaji')}${line('Sewa', 'sewa')}${line('Penyusutan', 'penyusutan')}${line('Total beban', 'beban', 'sub')}${line('Pajak', 'pajak')}${line('LABA BERSIH', 'labaBersih', 'tot')}</tbody></table></div></div>`;
  } else {
    const ms = BK.monthlyCash(d, o.date ? BK.ymOf(o.date) : ym, 12);
    $('bkBody').innerHTML = note + `<div class="panel"><div class="panel-head"><h2>Arus Kas bulanan</h2></div><div class="table-wrap"><table class="bk-table"><thead><tr><th>Bulan</th><th class="num">Kas masuk</th><th class="num">Kas keluar</th><th class="num">Arus kas bersih</th><th class="num">Saldo akhir</th><th class="num">Laba bersih</th><th class="num">Selisih arus kas vs laba</th></tr></thead><tbody>${ms.map(m => `<tr><td>${label(m.ym)}</td><td class="num">${rp(m.masuk)}</td><td class="num">${rp(m.keluar)}</td><td class="num"><b>${rp(m.bersih)}</b></td><td class="num">${rp(m.saldo)}</td><td class="num">${rp(m.laba)}</td><td class="num">${rp(m.selisih)}</td></tr>`).join('')}</tbody></table></div><p class="muted small">Selisih arus kas vs laba wajar terjadi karena penyusutan, sewa, hutang/piutang, dan stok.</p></div>`;
  }
}

// ---------- Evaluasi Usaha ----------
const fmt = (v, f) => (f === 'rp' ? rp(v) : f === 'pct' ? pc(v) : num(v));
const cls = s => (['Baik', 'Positif', 'Di atas titik impas', 'Bebas hutang', 'Tidak ada'].includes(s) ? 'good' : ['Perlu perhatian', 'Negatif', 'Di bawah titik impas', 'Ada hutang', 'Ada piutang'].includes(s) ? 'bad' : '');
async function renderEvaluasi() {
  const ym = $('evMonth').value || thisYm(), ev = BK.evaluasi(await data(), ym);
  const tgt = r => (r.target === null || r.target === undefined ? '—' : (r.key === 'food' || r.key === 'gaji' ? '≤ ' : r.key === 'mb' || r.key === 'bersih' ? '≥ ' : '') + fmt(r.target, r.fmt));
  const st = r => `<span class="status ${cls(r.status)}">${esc(r.status)}</span>`;
  const bad = ev.rows.filter(r => r.status === 'Perlu perhatian' || r.status === 'Di bawah titik impas' || r.status === 'Negatif');
  const sum = bad.length ? `<div class="warn warn">Perlu perhatian (${bad.length}): ${bad.map(r => esc(r.label)).join(', ')}.</div>` : '<div class="warn ok">Semua indikator utama dalam kondisi baik.</div>';
  $('evBody').innerHTML = `${sum}<div class="panel ev-table"><div class="table-wrap"><table class="bk-table"><thead><tr><th>Indikator</th><th class="num">Nilai</th><th class="num">Target</th><th>Status</th><th>Cara membaca</th></tr></thead><tbody>${ev.rows.map(r => `<tr><td>${esc(r.label)}</td><td class="num"><b>${fmt(r.value, r.fmt)}</b></td><td class="num">${tgt(r)}</td><td>${st(r)}</td><td class="muted">${esc(r.hint)}</td></tr>`).join('')}</tbody></table></div></div>
    <div class="ev-cards">${ev.rows.map(r => `<div class="ev-card"><div class="top"><b>${esc(r.label)}</b>${st(r)}</div><div><strong>${fmt(r.value, r.fmt)}</strong> <span class="muted">· target ${tgt(r)}</span></div><small>${esc(r.hint)}</small></div>`).join('')}</div>
    <p class="muted small">Target diatur di Neraca Awal › Asumsi usaha &amp; target.</p>`;
}

export async function renderBookkeeping(page) {
  try {
    const active = page || document.querySelector('.page.active')?.id;
    if (active === 'neraca') { if (!nrLoaded || page) await fillForm(); }
    else if (active === 'pembukuan') { if (!$('bkMonth').value) $('bkMonth').value = thisYm(); await renderPembukuan(); }
    else if (active === 'evaluasi') { if (!$('evMonth').value) $('evMonth').value = thisYm(); await renderEvaluasi(); }
  } catch (err) { console.error('Pembukuan gagal dimuat', err); }
}
function bind() {
  Object.keys({ ...F, ...PCT }).forEach(id => $(id).addEventListener('input', liveResult));
  $('nrSave').onclick = saveNeraca;
  $('bkMonth').onchange = renderPembukuan; $('evMonth').onchange = renderEvaluasi;
  document.querySelectorAll('[data-bk-tab]').forEach(b => { b.onclick = () => { bkTab = b.dataset.bkTab; renderPembukuan(); }; });
}
bind();
window.renderBookkeeping = renderBookkeeping;
