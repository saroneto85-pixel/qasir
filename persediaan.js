// Kontrol Persediaan — bagian DAPUR dan DEPAN.
// Dapur: stok awal / bahan masuk → dipakai (diolah jadi menu) → naik ke depan → sisa.
// Depan: kiriman dari dapur (= stok awal depan) → penjualan → sisa.
// Memakai database, PIN, dan toast dari app.js (lewat window), seperti modul resto.
import { all, put, del } from './db.js';
import { materialForItem, AUTO_INV_SOURCES } from './bahan-logic.js';
import { AREA, KIND_LABEL, kindsFor, summarizeAll, summarize, dailyCard, itemLinks, posSalesForItem, firstMinus, balanceAt, monthRange, localToday, SEED_ITEMS } from './persediaan-logic.js';

const $ = id => document.getElementById(id);
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const toast = s => window.toast?.(s);
const askPin = r => (window.requirePin ? window.requirePin(r) : Promise.resolve(false));
const num = v => new Intl.NumberFormat('id-ID', { maximumFractionDigits: 2 }).format(Number(v) || 0);
const dmy = d => { const p = String(d || '').split('-'); return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : '—'; };
const unitOf = it => (it && it.unit) || '';
const skuTxt = it => (it && it.sku ? ` · SKU: ${esc(it.sku)}` : '');
const normSku = v => String(v ?? '').trim().toUpperCase();
// Produk 'utama' item: yang ber-SKU sama dengan item, bila tidak ada maka produk pertama yang dihubungkan.
// Dipakai untuk menambah stok produk saat 'Naik ke depan'. Penjualan memakai SEMUA produk yang terhubung.
const prodFor = it => (!it ? null : products.find(p => normSku(p.sku) && normSku(p.sku) === normSku(it.sku)) || itemLinks(it, products).find(l => l.product)?.product || null);
const linksOf = it => itemLinks(it, products);
// Stok produk (Kelola Produk) bergerak SERENTAK dengan stok DEPAN item, memakai pengali (x) tiap produk:
//   Naik ke depan (+), Stok awal depan (+), Rusak depan (-)  => stok produk berubah qty / pengali
//   Penjualan kasir mengurangi stok tiap produk yang terjual (diatur di kasir). Hasilnya stok produk = sisa depan / pengali.
function stockTargets(it, area, kind, qty) {
  if (!it || !it.hasDepan) return [];
  const sign = area === 'dapur' && kind === 'naik' ? 1 : area === 'depan' && kind === 'awal' ? 1 : area === 'depan' && kind === 'rusak' ? -1 : 0;
  return sign ? linksOf(it).filter(l => l.product).map(l => ({ productId: l.product.id, name: l.product.name, delta: sign * qty / l.mult })) : [];
}
const appliedOf = x => (Array.isArray(x.stockApplied) ? x.stockApplied : x.stockApplied ? [{ productId: x.stockApplied.productId, delta: x.stockApplied.qty }] : []);
async function revertApplied(x) { for (const a of appliedOf(x)) await adjustStock(a.productId, -a.delta); }
const linkText = it => linksOf(it).map(l => `${l.product ? esc(l.product.name) : esc(l.sku)}${l.sku ? ` [${esc(l.sku)}]` : ''}${l.mult !== 1 ? ` ×${num(l.mult)}` : ''}`).join(', ');
// Ubah stok produk (Kelola Produk). Stok yang belum dilacak dianggap 0 saat pertama kali terisi.
async function adjustStock(productId, delta) {
  const p = (await all('products')).find(x => x.id === productId);
  if (!p) return null;
  const cur = p.stock === null || p.stock === undefined || p.stock === '' ? 0 : Number(p.stock);
  const next = Math.max(0, Math.round((cur + delta) * 1000) / 1000);
  await put('products', { ...p, stock: next });
  return { p, next };
}

let tab = 'dash', items = [], entries = [], products = [], materials = [], low = 2, month = localToday().slice(0, 7), cardItem = '', loaded = false, unmatchedSold = [], lastSync = '';

// ---------- data ----------
async function load() {
  await window.bahanSyncInv?.({ quiet: true }); // bahan masuk otomatis dari Stok Bahan Baku (item terhubung kode bahan)
  const P = window.kasirPerms?.perms?.();
  materials = !P || P.canRead('materials') ? await all('materials') : [];
  items = (await all('invItems')).sort((a, b) => String(a.name).localeCompare(String(b.name), 'id'));
  entries = await all('invEntries');
  products = await all('products');
  const s = (await all('settings')).find(x => x.id === 'main') || {};
  low = s.invLowDays === undefined || s.invLowDays === null || s.invLowDays === '' ? 2 : Number(s.invLowDays);
  loaded = true;
  await autoSync();
}
const itemById = id => items.find(i => i.id === id);
// Bahan terhubung (kode bahan dipilih di Kelola item). Perangkat tanpa akses bahan tetap tahu item terhubung dari kodenya.
const matOf = it => materialForItem(it, materials, items);
const matCode = it => (it && it.materialCode) || matOf(it)?.code || '';
const isAuto = e => AUTO_INV_SOURCES.has(e?.source);
const pageActive = () => $('inventory')?.classList.contains('active');

export async function renderInventory() {
  try {
    await load();
    renderDashPanel();
    if (pageActive()) renderPage();
  } catch (err) {
    console.error('Kontrol Persediaan gagal dimuat', err);
  }
}

// ---------- potongan tampilan ----------
const PILL = { AMAN: ['s-aman', 'AMAN'], MENIPIS: ['s-tipis', 'MENIPIS'], HABIS: ['s-habis', 'HABIS'], KOSONG: ['s-kosong', 'BELUM ADA DATA'] };
const pill = s => `<span class="spill ${PILL[s][0]}">${PILL[s][1]}</span>`;
const krosTag = k => (k === 'OK' ? '' : `<span class="spill s-habis">${esc(k)}</span>`);
const cukupText = r => (r.status === 'KOSONG' ? '—' : r.total <= 0 ? '0 hari' : r.cukup === null ? '—' : `${num(r.cukup)} hari`);
function mix(r) {
  if (!r.base) return '<div class="mix"></div>';
  const used = Math.min(100, r.used / r.base * 100), bad = Math.min(100 - used, r.rusak / r.base * 100), left = Math.max(0, 100 - used - bad);
  return `<div class="mix" title="Terjual/dipakai ${used.toFixed(0)}% · rusak ${bad.toFixed(1)}% · sisa ${left.toFixed(0)}%"><i class="m-used" style="width:${used}%"></i><i class="m-bad" style="width:${bad}%"></i><i class="m-left" style="width:${left}%"></i></div>`;
}
function simpleTable(rows, heads, cls = '') {
  if (!rows.length) return '<div class="empty">Belum ada data.</div>';
  return `<div class="table-wrap"><table class="${cls}"><thead><tr>${heads.map(h => `<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table></div>`;
}
const emptyItems = () => `<div class="empty-state inv-empty"><b>Belum ada item persediaan</b><span>Tambahkan bahan dan menu yang ingin dikontrol. Anda bisa mulai dari daftar contoh (Rendang, Ayam, Nila, Dencis, Beras, Minyak, Telur — dari file Kontrol Stok) lalu mengubahnya.</span><div class="inv-empty-actions"><button class="btn" onclick="invSeed()">Isi daftar item contoh</button><button class="outline" onclick="invManageItems()">Tambah item sendiri</button></div></div>`;

// ---------- halaman ----------
function renderPage() {
  document.querySelectorAll('[data-inv-tab]').forEach(b => b.classList.toggle('active', b.dataset.invTab === tab));
  if ($('invMonth').value !== month) $('invMonth').value = month;
  $('invLowWrap').hidden = tab !== 'dash';
  if (document.activeElement !== $('invLow')) $('invLow').value = low;
  const html = { dash: dashHTML, dapur: dapurHTML, depan: depanHTML, kartu: kartuHTML }[tab]();
  $('invBody').innerHTML = html;
  if (tab === 'kartu') {
    const sel = $('invCardItem');
    if (sel) sel.onchange = () => { cardItem = sel.value; renderPage(); };
  }
}

function dashHTML() {
  const { from, to } = monthRange(month);
  const flow = '<div class="inv-flow" aria-label="Alur persediaan"><span class="fl dapur">Dapur</span><span>Bahan masuk (otomatis dari Stok Bahan Baku)</span><i>→</i><span>Dipakai / diolah jadi menu</span><i>→</i><span>Naik ke depan</span><i>→</i><span class="fl depan">Depan</span><span>Stok awal depan</span><i>→</i><span>Terjual</span><i>→</i><span>Sisa</span></div>';
  if (!items.length) return flow + emptyItems();
  const { rows, count } = summarizeAll(items, entries, from, to, low);
  const stats = `<div class="stats inv-stats">
    <article><small>Item dipantau</small><strong>${count.items}</strong><span>bahan &amp; menu</span></article>
    <article class="c-aman"><small>Stok aman</small><strong>${count.aman}</strong><span>item</span></article>
    <article class="c-tipis"><small>Menipis / habis</small><strong>${count.perlu}</strong><span>perlu belanja / masak</span></article>
    <article class="c-kros"><small>Kroscek bermasalah</small><strong>${count.kroscek}</strong><span>item perlu dicek</span></article>
    <article><small>Data terakhir</small><strong>${count.last ? dmy(count.last) : '—'}</strong><span>tanggal input</span></article></div>`;
  const dash = n => n === undefined ? '—' : num(n);
  const tr = rows.map(r => {
    const hasF = r.item.hasDepan;
    return `<tr><td class="stick"><b>${esc(r.item.name)}</b><small>${esc(unitOf(r.item) || '—')}${skuTxt(r.item)} · ${hasF ? 'Dapur + Depan' : 'Dapur saja'}</small>${mix(r)}</td>
      <td class="num">${num(r.awal)}</td>
      <td class="num g-dapur">${num(r.dMasuk)}</td><td class="num g-dapur">${num(r.dKeluar)}</td><td class="num g-dapur"><b>${num(r.dSisa)}</b></td>
      <td class="num g-depan">${hasF ? num(r.fMasuk) : '—'}</td><td class="num g-depan">${hasF ? num(r.fJual) : '—'}</td><td class="num g-depan"><b>${hasF ? num(r.fSisa) : '—'}</b></td>
      <td class="num">${num(r.rusak)}</td><td class="num"><b>${num(r.total)}</b></td><td class="num">${cukupText(r)}</td><td>${pill(r.status)}${krosTag(r.kroscek)}</td></tr>`;
  }).join('');
  const table = `<div class="table-wrap inv-dash-table"><table class="inv-table"><thead>
    <tr class="grp"><th rowspan="2" class="stick">Item</th><th rowspan="2">Stok awal</th><th colspan="3" class="g-dapur">DAPUR</th><th colspan="3" class="g-depan">DEPAN</th><th rowspan="2">Rusak</th><th rowspan="2">Total sisa</th><th rowspan="2">Cukup</th><th rowspan="2">Status</th></tr>
    <tr class="grp2"><th class="g-dapur">Masuk</th><th class="g-dapur">Dipakai / naik</th><th class="g-dapur">Sisa</th><th class="g-depan">Masuk dari dapur</th><th class="g-depan">Terjual</th><th class="g-depan">Sisa</th></tr></thead><tbody>${tr}</tbody></table></div>`;
  const cards = rows.map(r => {
    const hasF = r.item.hasDepan;
    return `<article class="exp-card inv-card"><div class="exp-card-top"><div><b>${esc(r.item.name)}</b><small>${esc(unitOf(r.item) || '—')}${skuTxt(r.item)} · stok awal ${num(r.awal)}</small></div><div>${pill(r.status)}</div></div>${mix(r)}
      <div class="inv-two"><div class="inv-box g-dapur"><h4>Dapur</h4><dl><dt>Masuk</dt><dd>${num(r.dMasuk)}</dd><dt>Dipakai / naik</dt><dd>${num(r.dKeluar)}</dd><dt>Sisa</dt><dd><b>${num(r.dSisa)}</b></dd></dl></div>
      <div class="inv-box g-depan ${hasF ? '' : 'off'}"><h4>Depan</h4>${hasF ? `<dl><dt>Masuk dari dapur</dt><dd>${num(r.fMasuk)}</dd><dt>Terjual</dt><dd>${num(r.fJual)}</dd><dt>Sisa</dt><dd><b>${num(r.fSisa)}</b></dd></dl>` : '<p>Tidak ada bagian depan</p>'}</div></div>
      <div class="exp-card-meta"><span>Total sisa <b>${num(r.total)}</b></span><span>Rusak ${num(r.rusak)}</span><span>Cukup ${cukupText(r)}</span>${krosTag(r.kroscek)}</div></article>`;
  }).join('');
  const note = '<p class="inv-note">Cukup (hari) = total sisa ÷ rata-rata terjual/dipakai per hari yang tercatat. Status MENIPIS bila Cukup kurang dari batas hari di atas; HABIS bila total sisa ≤ 0. Angka antar item tidak dijumlahkan karena satuannya berbeda.</p>';
  return flow + stats + `<div class="panel exp-panel inv-panel"><div class="panel-head"><h2>Ringkasan per item</h2><small>${dmy(from)} – ${dmy(to)}</small></div><div class="exp-desktop inv-desktop">${table}</div><div class="exp-cards inv-cards">${cards}</div></div>` + note;
}

function entryRows(list, withNaikInfo = false) {
  return list.map(e => {
    const it = itemById(e.itemId);
    const label = e.area === 'depan' ? KIND_LABEL.depan[e.kind] : KIND_LABEL.dapur[e.kind];
    const info = e.refId ? ' <span class="chip">olahan</span>' : e.source === 'kasir' ? ' <span class="chip">dari kasir</span>' : isAuto(e) ? ' <span class="chip">otomatis</span>' : '';
    const readonly = withNaikInfo && e.area === 'dapur';
    return `<tr><td>${dmy(e.date)}</td><td><b>${esc(it?.name || '(item dihapus)')}</b>${it?.sku ? `<small class="sku">SKU: ${esc(it.sku)}</small>` : ''}</td><td>${readonly ? 'Masuk dari dapur' : esc(label || e.kind)}${info}</td><td class="num"><b>${num(e.qty)}</b> ${esc(unitOf(it))}</td><td>${esc(e.note || '')}</td><td class="act">${readonly ? '<small>diubah di tab Dapur</small>' : isAuto(e) ? `<small>${e.source === 'pengeluaran' ? 'diubah di Pengeluaran' : 'diubah di Stok Bahan Baku'}</small>` : `<button class="link" onclick="invEdit('${e.id}')">Edit</button><button class="link danger-link" onclick="invDelete('${e.id}')">Hapus</button>`}</td></tr>`;
  });
}
function entryList(list, withNaikInfo = false) {
  if (!list.length) return '<div class="empty">Belum ada data.</div>';
  const table = simpleTable(entryRows(list, withNaikInfo), ['Tanggal', 'Item', 'Jenis', 'Jumlah', 'Catatan', 'Aksi']);
  const cards = list.map(e => {
    const it = itemById(e.itemId);
    const label = e.area === 'depan' ? KIND_LABEL.depan[e.kind] : KIND_LABEL.dapur[e.kind];
    const ro = withNaikInfo && e.area === 'dapur';
    const tag = e.refId ? ' <span class="chip">olahan</span>' : e.source === 'kasir' ? ' <span class="chip">dari kasir</span>' : isAuto(e) ? ' <span class="chip">otomatis</span>' : '';
    return `<article class="exp-card"><div class="exp-card-top"><div><b>${esc(it?.name || '(item dihapus)')}</b>${it?.sku ? `<small class="sku">SKU: ${esc(it.sku)}</small>` : ''}<small>${dmy(e.date)} · ${ro ? 'Masuk dari dapur' : esc(label || e.kind)}${tag}</small></div><strong>${num(e.qty)} ${esc(unitOf(it))}</strong></div>${e.note ? `<p>${esc(e.note)}</p>` : ''}${ro ? '<p>Diubah di tab Dapur</p>' : isAuto(e) ? `<p class="muted">Otomatis — ${e.source === 'pengeluaran' ? 'ubah di Pengeluaran' : 'ubah di Stok Bahan Baku'}</p>` : `<div class="exp-card-actions"><button class="outline" onclick="invEdit('${e.id}')">Edit</button><button class="outline danger" onclick="invDelete('${e.id}')">Hapus</button></div>`}</article>`;
  }).join('');
  return `<div class="exp-desktop">${table}</div><div class="exp-cards">${cards}</div>`;
}
const withData = rows => { const d = rows.filter(r => r.hasData); return d.length ? d : rows; };
const hiddenNote = (rows, shown) => rows.length > shown.length ? `<p class="inv-note">${rows.length - shown.length} item belum punya catatan dan disembunyikan. Catat persediaan untuk menampilkannya.</p>` : '';
const sortDesc = (a, b) => String(b.date).localeCompare(String(a.date)) || (b.createdAt || 0) - (a.createdAt || 0);

function dapurHTML() {
  if (!items.length) return emptyItems();
  const { from, to } = monthRange(month);
  const { rows } = summarizeAll(items, entries, from, to, low);
  const shownD = withData(rows);
  const pos = simpleTable(shownD.map(r => `<tr><td class="stick"><b>${esc(r.item.name)}</b><small>${esc(unitOf(r.item) || '—')}${skuTxt(r.item)}</small></td><td class="num">${num(r.awalD)}</td><td class="num">${num(r.dMasuk)}</td><td class="num">${num(r.dPakai)}</td><td class="num">${r.item.hasDepan ? num(r.dNaik) : '—'}</td><td class="num">${num(r.dRusak)}</td><td class="num"><b>${num(r.dSisa)}</b></td></tr>`), ['Item', 'Awal', 'Masuk', 'Dipakai', 'Naik', 'Rusak', 'Sisa'], 'inv-table');
  const list = entries.filter(e => e.area === 'dapur' && e.date >= from && e.date <= to).sort(sortDesc);
  const linked = items.filter(i => matCode(i)).length;
  const autoNote = `<p class="inv-note">Bahan masuk tercatat <b>otomatis</b> dari Stok Bahan Baku (belanja di Pengeluaran &amp; “Masuk lain”) untuk item yang diberi kode bahan${linked ? ` — ${linked} item terhubung` : ''}. Atur di <button type="button" class="link" onclick="invManageItems()">Kelola item</button>.</p>`;
  const actions = autoNote + `<div class="inv-actions"><button class="btn" onclick="invOlah()">Olah jadi menu</button><button class="outline" onclick="invOpen({area:'dapur',kind:'naik'})">Naik ke depan</button><button class="outline" onclick="invOpen({area:'dapur',kind:'pakai'})">Dipakai</button><button class="outline" onclick="invOpen({area:'dapur',kind:'rusak'})">Rusak</button></div>`;
  return actions + `<div class="panel exp-panel inv-panel"><div class="panel-head"><h2>Posisi stok dapur</h2><small>${dmy(from)} – ${dmy(to)}</small></div><div class="pad">${pos}${hiddenNote(rows, shownD)}</div></div>
    <div class="panel exp-panel inv-panel"><div class="panel-head"><h2>Catatan dapur</h2><small>${list.length} catatan</small></div><div class="pad">${entryList(list)}</div></div>`;
}

function depanHTML() {
  const fi = items.filter(i => i.hasDepan);
  if (!items.length) return emptyItems();
  const { from, to } = monthRange(month);
  const { rows } = summarizeAll(fi, entries, from, to, low);
  const shownF = withData(rows);
  const pos = simpleTable(shownF.map(r => `<tr><td class="stick"><b>${esc(r.item.name)}</b><small>${esc(unitOf(r.item) || '—')}${skuTxt(r.item)}</small></td><td class="num">${num(r.awalF)}</td><td class="num">${num(r.fMasuk)}</td><td class="num">${num(r.fJual)}</td><td class="num">${num(r.fRusak)}</td><td class="num"><b>${num(r.fSisa)}</b></td></tr>`), ['Item', 'Awal', 'Dari dapur', 'Terjual', 'Rusak', 'Sisa'], 'inv-table');
  const ids = new Set(fi.map(i => i.id));
  const list = entries.filter(e => ids.has(e.itemId) && e.date >= from && e.date <= to && (e.area === 'depan' || e.kind === 'naik')).sort(sortDesc);
    const actions = `<div class="inv-actions"><button class="outline" onclick="invOpen({area:'depan',kind:'rusak'})">Rusak</button><button class="outline" onclick="invOpen({area:'depan',kind:'awal'})">Stok awal depan</button></div>`;
  const noSku = fi.filter(i => !linksOf(i).length);
  const status = `<div class="inv-sync-box"><b>✔ Penjualan tersinkron otomatis dari kasir</b><small>Setiap transaksi dicocokkan lewat SKU/kode (satu item bisa terhubung ke beberapa produk) dan langsung mengisi kolom Terjual serta mengurangi stok.${lastSync ? ' Diperbarui ' + lastSync + '.' : ''}</small>${noSku.length ? `<small class="warn-text">⚠ Belum terhubung ke produk/SKU (tidak tersinkron): ${noSku.map(i => esc(i.name)).join(', ')}. Hubungkan di Kelola item.</small>` : ''}${unmatchedSold.length ? `<small class="warn-text">ℹ Produk terjual yang belum terhubung ke item persediaan: ${unmatchedSold.slice(0, 6).map(esc).join(', ')}${unmatchedSold.length > 6 ? ' dll.' : ''}.</small>` : ''}</div>`;
  const hint = '<p class="inv-note">Naik dari dapur otomatis menjadi stok depan dan menambah stok produk (dicocokkan lewat SKU). Terjual diambil otomatis dari kasir lewat SKU dan mengurangi stok produk. Sisa sore otomatis menjadi stok awal hari berikutnya.</p>';
  return actions + status + `<div class="panel exp-panel inv-panel"><div class="panel-head"><h2>Posisi stok depan</h2><small>${dmy(from)} – ${dmy(to)}</small></div><div class="pad">${fi.length ? pos + hiddenNote(rows, shownF) : '<div class="empty">Belum ada item yang punya bagian depan. Centang “Ada bagian depan” saat menambah item.</div>'}</div></div>
    <div class="panel exp-panel inv-panel"><div class="panel-head"><h2>Catatan depan</h2><small>${list.length} catatan</small></div><div class="pad">${entryList(list, true)}</div></div>` + hint;
}

function kartuHTML() {
  if (!items.length) return emptyItems();
  if (!itemById(cardItem)) cardItem = (items.find(i => entries.some(x => x.itemId === i.id)) || items[0]).id;
  const it = itemById(cardItem), { from, to } = monthRange(month);
  const today = localToday();
  const limit = today >= from && today <= to ? today : to;
  const rows = dailyCard(it, entries, from, limit).map(r => {
    const f = it.hasDepan;
    return `<tr class="${r.has ? '' : 'idle'}"><td>${Number(r.date.slice(8))}</td><td class="num">${num(r.dAwal)}</td><td class="num">${r.dMasuk ? num(r.dMasuk) : ''}</td><td class="num">${r.dPakai ? num(r.dPakai) : ''}</td><td class="num">${f && r.dNaik ? num(r.dNaik) : ''}</td><td class="num">${r.dRusak ? num(r.dRusak) : ''}</td><td class="num"><b>${num(r.dSisa)}</b></td>${f ? `<td class="num">${num(r.fAwal)}</td><td class="num">${r.fMasuk ? num(r.fMasuk) : ''}</td><td class="num">${r.fJual ? num(r.fJual) : ''}</td><td class="num">${r.fRusak ? num(r.fRusak) : ''}</td><td class="num"><b>${num(r.fSisa)}</b></td>` : ''}</tr>`;
  }).join('');
  const f = it.hasDepan;
  const head = `<thead><tr class="grp"><th rowspan="2">Tgl</th><th colspan="6" class="g-dapur">DAPUR</th>${f ? '<th colspan="5" class="g-depan">DEPAN</th>' : ''}</tr><tr class="grp2"><th class="g-dapur">Stok awal</th><th class="g-dapur">Masuk</th><th class="g-dapur">Dipakai</th><th class="g-dapur">Naik</th><th class="g-dapur">Rusak</th><th class="g-dapur">Sisa</th>${f ? '<th class="g-depan">Stok awal</th><th class="g-depan">Dari dapur</th><th class="g-depan">Terjual</th><th class="g-depan">Rusak</th><th class="g-depan">Sisa</th>' : ''}</tr></thead>`;
  return `<div class="inv-actions"><label class="inv-pick">Item<select id="invCardItem">${items.map(i => `<option value="${esc(i.id)}"${i.id === cardItem ? ' selected' : ''}>${esc(i.name)}</option>`).join('')}</select></label></div>
    <div class="panel exp-panel inv-panel"><div class="panel-head"><h2>Kartu persediaan: ${esc(it.name)}${it.sku ? ` <small>(SKU: ${esc(it.sku)})</small>` : ''}</h2><small>${esc(unitOf(it) || 'satuan belum diisi')} · ${dmy(from)} – ${dmy(limit)}</small></div><div class="pad"><div class="table-wrap"><table class="inv-table inv-card-table">${head}<tbody>${rows}</tbody></table></div></div></div>`;
}

// ---------- panel di Dashboard utama ----------
function dashSection(cls, title, sub, heads, rows) {
  const body = rows.length ? `<div class="table-wrap"><table class="inv-mini-table"><thead><tr><th>Item</th>${heads.map(h => `<th class="num">${h}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table></div>` : '<div class="empty">Belum ada catatan.</div>';
  return `<section class="inv-dash-col ${cls}"><h3><span class="fl ${cls === 'g-dapur' ? 'dapur' : 'depan'}">${title}</span><small>${sub}</small></h3>${body}</section>`;
}
function renderDashPanel() {
  const box = $('invDashPanel');
  if (!box) return;
  const { from, to } = monthRange(localToday().slice(0, 7));
  const open = "showPage('inventory')";
  const head = `<div class="panel-head"><div><h2>Kontrol Persediaan</h2><small>Bulan ini · ${dmy(from)} – ${dmy(to)}</small></div><button class="link" onclick="${open}">Buka detail →</button></div>`;
  if (!items.length) {
    box.innerHTML = `<div class="panel inv-dash">${head}<div class="empty">Belum ada item persediaan. <button class="link" onclick="${open}">Mulai kontrol persediaan</button></div></div>`;
    return;
  }
  const { rows, count } = summarizeAll(items, entries, from, to, low);
  const flag = r => (r.status === 'MENIPIS' || r.status === 'HABIS' ? ` <span class="spill ${PILL[r.status][0]}">${PILL[r.status][1]}</span>` : '');
  const name = r => `<td class="stick"><b>${esc(r.item.name)}</b><small>${esc(unitOf(r.item) || '—')}${skuTxt(r.item)}${flag(r)}</small></td>`;
  const dapurRows = rows.filter(r => r.hasData).map(r => `<tr class="st-${r.status.toLowerCase()}">${name(r)}<td class="num">${num(r.awalD + r.dMasuk)}</td><td class="num">${num(r.dPakai + r.dNaik)}</td><td class="num">${num(r.dRusak)}</td><td class="num"><b>${num(r.dSisa)}</b></td></tr>`);
  const depanRows = rows.filter(r => r.hasData && r.item.hasDepan).map(r => `<tr class="st-${r.status.toLowerCase()}">${name(r)}<td class="num">${num(r.awalF + r.fMasuk)}</td><td class="num">${num(r.fJual)}</td><td class="num">${num(r.fRusak)}</td><td class="num"><b>${num(r.fSisa)}</b></td></tr>`);
  box.innerHTML = `<div class="panel inv-dash">${head}
    <div class="inv-mini"><div><strong>${count.items}</strong><small>Item dipantau</small></div><div class="c-aman"><strong>${count.aman}</strong><small>Stok aman</small></div><div class="c-tipis"><strong>${count.perlu}</strong><small>Menipis / habis</small></div><div class="c-kros"><strong>${count.kroscek}</strong><small>Kroscek bermasalah</small></div></div>
    <div class="inv-dash-grid">${dashSection('g-dapur', 'DAPUR', 'bahan → diolah → naik ke depan', ['Masuk', 'Dipakai / naik', 'Rusak', 'Sisa'], dapurRows)}${dashSection('g-depan', 'DEPAN', 'dari dapur → dijual', ['Masuk', 'Terjual', 'Rusak', 'Sisa'], depanRows)}</div>
    <p class="inv-note">Masuk = stok awal periode + masuk/olahan/kiriman. Masuk − dipakai − rusak = sisa.</p></div>`;
}

// ---------- catat (masuk / dipakai / dijual / rusak) ----------
function fillEntryItems(keep) {
  const area = $('ieArea').value;
  const list = items.filter(i => area === 'dapur' || i.hasDepan);
  $('ieItem').innerHTML = list.map(i => `<option value="${esc(i.id)}">${esc(i.name)}${unitOf(i) ? ` (${esc(unitOf(i))})` : ''}${i.sku ? ` [${esc(i.sku)}]` : ''}</option>`).join('');
  if (keep && list.some(i => i.id === keep)) $('ieItem').value = keep;
}
function fillKinds(keep) {
  const area = $('ieArea').value, it = itemById($('ieItem').value);
  let ks = it ? kindsFor(it, area, !!matCode(it)) : [];
  if (keep && !ks.includes(keep) && KIND_LABEL[area][keep]) ks = [...ks, keep];
  $('ieKind').innerHTML = ks.map(k => `<option value="${k}">${k === 'masuk' && area === 'dapur' ? 'Bahan masuk manual (item belum diberi kode bahan)' : KIND_LABEL[area][k]}</option>`).join('');
  if (keep && ks.includes(keep)) $('ieKind').value = keep;
  fillHint();
}
function fillHint() {
  const it = itemById($('ieItem').value), date = $('ieDate').value;
  if ($('ieSku')) { const ls = linksOf(it), mc = matCode(it); $('ieSku').textContent = it ? (ls.length ? `Terhubung ke: ${ls.map(l => (l.product?.name || l.sku) + (l.sku ? ' [' + l.sku + ']' : '') + (l.mult !== 1 ? ' ×' + num(l.mult) : '')).join(', ')}` : 'Belum terhubung ke produk (isi di Kelola item)') + (mc ? ` · Bahan ${mc}: bahan masuk otomatis dari Stok Bahan Baku` : '') : ''; }
  if (!it || !date) { $('ieHint').textContent = ''; return; }
  const b = balanceAt(it, entries.filter(e => e.id !== $('ieId').value), date), u = unitOf(it);
  const kind = $('ieKind').value;
  $('ieHint').textContent = `Sisa per ${dmy(date)} — Dapur: ${num(b.dapur)}${it.hasDepan ? ` · Depan: ${num(b.depan)}` : ''} ${u}` + (kind === 'naik' ? ' · Jumlah ini otomatis menjadi stok depan dan menambah stok produk yang terhubung (qty ÷ pengali).' : '');
}
function openEntry(opts = {}) {
  if (!items.length) { toast('Tambahkan item persediaan dulu'); invManageItems(); return; }
  const old = opts.id ? entries.find(e => e.id === opts.id) : null;
  if (isAuto(old)) return toast(old.source === 'pengeluaran' ? 'Catatan otomatis dari belanja — ubah di menu Pengeluaran' : 'Catatan otomatis dari Stok Bahan Baku — ubah di sana');
  $('invEntryForm').reset();
  $('ieId').value = old?.id || '';
  $('ieTitle').textContent = old ? 'Edit catatan persediaan' : 'Catat persediaan';
  $('ieArea').value = old?.area || opts.area || 'dapur';
  fillEntryItems(old?.itemId || opts.itemId);
  fillKinds(old?.kind || opts.kind);
  $('ieQty').value = old?.qty ?? '';
  $('ieDate').value = old?.date || localToday();
  $('ieNote').value = old?.note || '';
  fillHint();
  $('invEntryDialog').showModal();
}
async function saveEntry(e) {
  e.preventDefault();
  const area = $('ieArea').value, itemId = $('ieItem').value, kind = $('ieKind').value, qty = Number($('ieQty').value), date = $('ieDate').value;
  const it = itemById(itemId);
  if (!it) return toast('Pilih item');
  if (!date) return toast('Isi tanggal');
  if (!(qty > 0)) return toast('Jumlah harus lebih dari nol');
  const id = $('ieId').value, old = id ? entries.find(x => x.id === id) : null;
  if (area === 'dapur' && kind === 'masuk' && !old && matCode(it)) return toast(`${it.name} terhubung ke bahan ${matCode(it)}: bahan masuk dicatat otomatis dari belanja / Stok Bahan Baku`);
  const rec = { id: id || uid(), date, itemId, area, kind, qty, note: $('ieNote').value.trim(), createdAt: old?.createdAt || Date.now() };
  if (old?.refId) rec.refId = old.refId;
  const next = entries.filter(x => x.id !== rec.id).concat(rec);
  if (!firstMinus(it, entries) && firstMinus(it, next) && !confirm(`Saldo ${it.name} akan menjadi MINUS pada ${dmy(firstMinus(it, next))}. Biasanya ini tanda catatan kurang atau salah input. Tetap simpan?`)) return;
  products = await all('products');
  if (old) await revertApplied(old);
  let msg = 'Catatan persediaan disimpan';
  const targets = stockTargets(it, area, kind, qty);
  if (targets.length) {
    rec.stockApplied = [];
    for (const t of targets) { const r = await adjustStock(t.productId, t.delta); if (r) rec.stockApplied.push({ productId: t.productId, delta: t.delta }); }
    msg = `Dicatat. Stok produk ${targets.map(t => `${t.name} ${t.delta >= 0 ? '+' : ''}${num(t.delta)}`).join(', ')}`;
  } else if ((area === 'dapur' && kind === 'naik') || (area === 'depan' && (kind === 'awal' || kind === 'rusak'))) {
    msg = 'Dicatat, tetapi item belum terhubung ke produk (SKU) — stok produk tidak berubah';
  }
  await put('invEntries', rec);
  $('invEntryDialog').close();
  await renderInventory();
  window.renderProducts?.();
  toast(msg);
}

// ---------- olah bahan menjadi menu ----------
function olahOptions(sel, withNone, keep) {
  sel.innerHTML = (withNone ? '<option value="">— Tanpa bahan sumber —</option>' : '') + items.map(i => `<option value="${esc(i.id)}">${esc(i.name)}${unitOf(i) ? ` (${esc(unitOf(i))})` : ''}${i.sku ? ` [${esc(i.sku)}]` : ''}</option>`).join('');
  if (keep !== undefined) sel.value = keep;
}
function showOlahSku() { const it = itemById($('ioOut').value); if ($('ioSku')) $('ioSku').textContent = it ? (it.sku ? `SKU/kode: ${it.sku}` : 'SKU belum diisi') : ''; }
function openOlah(refId) {
  if (!items.length) { toast('Tambahkan item persediaan dulu'); invManageItems(); return; }
  $('invOlahForm').reset();
  $('ioRef').value = refId || '';
  $('ioTitle').textContent = refId ? 'Edit olahan' : 'Olah bahan jadi menu';
  const pair = refId ? entries.filter(x => x.refId === refId) : [];
  const src = pair.find(x => x.kind === 'pakai'), out = pair.find(x => x.kind === 'hasil');
  olahOptions($('ioSrc'), true, src?.itemId || '');
  olahOptions($('ioOut'), false, out?.itemId || (items.find(i => i.hasDepan)?.id ?? items[0].id));
  $('ioSrcQty').value = src?.qty ?? '';
  $('ioOutQty').value = out?.qty ?? '';
  $('ioDate').value = out?.date || src?.date || localToday();
  $('ioNote').value = out?.note || src?.note || '';
  showOlahSku();
  $('invOlahDialog').showModal();
}
async function saveOlah(e) {
  e.preventDefault();
  const srcId = $('ioSrc').value, outId = $('ioOut').value, srcQty = Number($('ioSrcQty').value), outQty = Number($('ioOutQty').value), date = $('ioDate').value, note = $('ioNote').value.trim();
  if (!outId || !(outQty > 0)) return toast('Isi menu hasil dan jumlahnya');
  if (srcId && !(srcQty > 0)) return toast('Isi jumlah bahan yang dipakai');
  if (srcId && srcId === outId) return toast('Bahan sumber dan menu hasil harus berbeda');
  if (!date) return toast('Isi tanggal');
  const ref = $('ioRef').value || uid();
  const prev = entries.filter(x => x.refId === ref);
  const keepAt = k => prev.find(x => x.kind === k);
  const recs = [];
  if (srcId) recs.push({ id: keepAt('pakai')?.id || uid(), refId: ref, date, itemId: srcId, area: 'dapur', kind: 'pakai', qty: srcQty, note, createdAt: keepAt('pakai')?.createdAt || Date.now() });
  recs.push({ id: keepAt('hasil')?.id || uid(), refId: ref, date, itemId: outId, area: 'dapur', kind: 'hasil', qty: outQty, note, createdAt: keepAt('hasil')?.createdAt || Date.now() });
  const next = entries.filter(x => x.refId !== ref).concat(recs);
  for (const r of recs) { const it = itemById(r.itemId); if (it && !firstMinus(it, entries) && firstMinus(it, next) && !confirm(`Saldo ${it.name} akan menjadi MINUS (${dmy(firstMinus(it, next))}). Tetap simpan?`)) return; }
  for (const x of prev) if (!recs.some(r => r.id === x.id)) await del('invEntries', x.id);
  for (const r of recs) await put('invEntries', r);
  $('invOlahDialog').close();
  await renderInventory();
  toast('Olahan dicatat: bahan berkurang, menu masuk ke stok dapur');
}

// ---------- edit / hapus catatan ----------
async function editEntry(id) {
  const e = entries.find(x => x.id === id);
  if (!e) return;
  if (!isAuto(e) && !await askPin('mengubah catatan persediaan')) return;
  if (isAuto(e)) return toast(e.source === 'pengeluaran' ? 'Catatan otomatis dari belanja — ubah di menu Pengeluaran' : 'Catatan otomatis dari Stok Bahan Baku — ubah di sana');
  if (e.refId) openOlah(e.refId); else openEntry({ id });
}
async function deleteEntry(id) {
  const e = entries.find(x => x.id === id);
  if (!e) return;
  if (!isAuto(e) && !await askPin('menghapus catatan persediaan')) return;
  if (isAuto(e)) return toast(e.source === 'pengeluaran' ? 'Catatan otomatis dari belanja — hapus/ubah di menu Pengeluaran' : 'Catatan otomatis dari Stok Bahan Baku — hapus/ubah di sana');
  const group = e.refId ? entries.filter(x => x.refId === e.refId) : [e];
  if (!confirm(e.refId ? 'Catatan ini bagian dari olahan (bahan dipakai + menu hasil). Hapus keduanya?' : 'Hapus catatan ini?')) return;
  for (const x of group) { await revertApplied(x); await del('invEntries', x.id); }
  await renderInventory();
  window.renderProducts?.();
  toast('Catatan dihapus');
}

// ---------- kelola item ----------
// ---------- pilih beberapa produk kasir untuk satu item ----------
let linkSel = new Map(); // productId -> mult
function renderLinkPicker() {
  const q = ($('iiLinkSearch')?.value || '').trim().toLowerCase();
  const list = products.filter(p => !q || p.name.toLowerCase().includes(q) || normSku(p.sku).toLowerCase().includes(q));
  $('iiLinks').innerHTML = list.length ? list.map(p => { const on = linkSel.has(p.id); return `<div class="ii-link${on ? ' on' : ''}"><label><input type="checkbox" data-pid="${esc(p.id)}"${on ? ' checked' : ''}><span><b>${esc(p.name)}</b><small>SKU: ${esc(p.sku || '—')}</small></span></label><span class="ii-mult"${on ? '' : ' hidden'}>×<input type="number" min="0.01" step="any" inputmode="decimal" value="${linkSel.get(p.id) ?? 1}" data-mult="${esc(p.id)}" aria-label="Stok terpakai per 1 ${esc(p.name)}"></span></div>`; }).join('') : '<div class="empty">Produk tidak ditemukan.</div>';
  $('iiLinkCount').textContent = linkSel.size ? `${linkSel.size} produk dipilih` : 'Belum ada produk dipilih';
}
function bindLinkPicker() {
  $('iiLinkSearch').oninput = renderLinkPicker;
  $('iiLinks').addEventListener('change', e => {
    const cb = e.target.closest('[data-pid]'), mu = e.target.closest('[data-mult]');
    if (cb) {
      const id = cb.dataset.pid, p = products.find(x => x.id === id);
      if (cb.checked) { linkSel.set(id, 1); if (p && linkSel.size === 1) { if (!$('iiName').value.trim()) $('iiName').value = p.name; if (!$('iiSku').value.trim()) $('iiSku').value = p.sku || ''; } } else linkSel.delete(id);
      renderLinkPicker();
    } else if (mu) { const v = Number(mu.value); linkSel.set(mu.dataset.mult, v > 0 ? v : 1); }
  });
}
async function renderItemList() {
  products = await all('products');
  renderLinkPicker();
  $('iiList').innerHTML = items.length ? items.map(i => `<div class="master-expense-row"><div class="mrow-head"><b>${esc(i.name)}</b><span class="chip">SKU: ${esc(i.sku || '—')}</span><span class="chip">${esc(unitOf(i) || 'satuan —')}</span><span class="gbadge ${i.hasDepan ? 'g-oper' : 'g-bahan'}">${i.hasDepan ? 'Dapur + Depan' : 'Dapur saja'}</span>${matCode(i) ? `<span class="chip">Bahan: ${esc(matCode(i))}</span>` : ''}<button type="button" class="link" onclick="invEditItem('${i.id}')">Edit</button><button type="button" class="link danger-link" onclick="invDelItem('${i.id}')">Hapus</button></div><small>${linksOf(i).length ? 'Terhubung ke ' + linksOf(i).length + ' produk: ' + linkText(i) : 'Belum terhubung ke produk kasir (penjualan tidak tersinkron)'}</small></div>`).join('') : '<div class="empty">Belum ada item.</div>';
}
function fillMaterialSelect(keep, selfId) {
  const sel = $('iiMaterial'); if (!sel) return;
  const usedBy = new Map();
  for (const it of items) if (it.id !== selfId) { const c = normSku(matCode(it)); if (c) usedBy.set(c, it.name); }
  const list = [...materials].sort((a, b) => String(a.code).localeCompare(String(b.code), 'id', { numeric: true }));
  const k = normSku(keep);
  const extra = k && !list.some(m => normSku(m.code) === k) ? `<option value="${esc(keep)}">${esc(keep)} · (kode tidak ditemukan)</option>` : '';
  sel.innerHTML = '<option value="">— Tidak terhubung —</option>' + extra + list.map(m => { const u = usedBy.get(normSku(m.code)); return `<option value="${esc(m.code)}"${u ? ' disabled' : ''}>${esc(m.code)} · ${esc(m.name)}${m.buyUnit ? ` (${esc(m.buyUnit)})` : ''}${u ? ` — sudah dipakai “${esc(u)}”` : ''}</option>`; }).join('');
  sel.disabled = !materials.length && !k;
  sel.value = k ? (list.find(m => normSku(m.code) === k)?.code || keep) : '';
  materialHint();
}
function materialHint() {
  const h = $('iiMaterialHint'); if (!h) return;
  const m = materials.find(x => normSku(x.code) === normSku($('iiMaterial').value));
  if (!materials.length) { h.textContent = 'Belum ada bahan di Stok Bahan Baku (atau perangkat ini tidak punya akses Stok Bahan Baku).'; return; }
  if (!m) { h.textContent = 'Pilih bahan agar setiap belanja (Pengeluaran) dan “Masuk lain” (Stok Bahan Baku) bahan ini otomatis tercatat sebagai Bahan masuk di dapur.'; return; }
  const u = ($('iiUnit').value || '').trim().toLowerCase(), bu = String(m.buyUnit || '').trim().toLowerCase(), su = String(m.stockUnit || '').trim().toLowerCase();
  const unit = u && u === bu && u !== su ? m.buyUnit : (m.stockUnit || m.buyUnit || '');
  h.innerHTML = `Bahan masuk otomatis dicatat dalam <b>${esc(unit || 'satuan stok')}</b>` + (m.perBuy && Number(m.perBuy) !== 1 && bu !== su ? ` (1 ${esc(m.buyUnit)} = ${num(m.perBuy)} ${esc(m.stockUnit)})` : '') + '. Samakan satuan item dengan satuan beli atau satuan stok bahan.';
}
async function openItems() {
  await load();
  $('iiId').value = ''; $('iiName').value = ''; $('iiSku').value = ''; $('iiUnit').value = ''; $('iiDepan').checked = true; $('iiSave').textContent = 'Tambah item';
  fillMaterialSelect('', '');
  linkSel = new Map(); $('iiLinkSearch').value = '';
  await renderItemList();
  if (!$('invItemDialog').open) $('invItemDialog').showModal();
}
async function saveItem(e) {
  e.preventDefault();
  const name = $('iiName').value.trim();
  if (!name) return toast('Isi nama item');
  const id = $('iiId').value;
  if (items.some(i => i.id !== id && i.name.toLowerCase() === name.toLowerCase())) return toast('Nama item sudah ada');
  const old = id ? itemById(id) : null;
  let sku = $('iiSku').value.trim();
  products = await all('products');
  const links = [...linkSel].map(([productId, mult]) => ({ productId, sku: products.find(p => p.id === productId)?.sku || '', mult: Number(mult) > 0 ? Number(mult) : 1 }));
  if (sku && items.some(i => i.id !== id && normSku(i.sku) === normSku(sku))) return toast('SKU sudah dipakai item persediaan lain');
  // Perangkat tanpa akses Stok Bahan Baku tidak melihat daftar bahan: kode lama dipertahankan.
  const materialCode = materials.length || !old ? ($('iiMaterial')?.value || '').trim() : old.materialCode;
  const taken = materialCode && items.find(i => i.id !== id && normSku(matCode(i)) === normSku(materialCode));
  if (taken) return toast(`Kode bahan ${materialCode} sudah dipakai item “${taken.name}”`);
  if (!sku && links.length) { const cand = links[0].sku; if (cand && !items.some(i => i.id !== id && normSku(i.sku) === normSku(cand))) sku = cand; }
  await put('invItems', { ...(old || {}), id: id || uid(), name, sku, unit: $('iiUnit').value.trim(), hasDepan: $('iiDepan').checked, productId: '', links, ...(materialCode === undefined ? {} : { materialCode }), createdAt: old?.createdAt || Date.now() });
  await window.bahanSyncInv?.({ quiet: true });
  await openItems();
  await renderInventory();
  toast((id ? 'Item diperbarui' : 'Item ditambahkan') + (materialCode ? ` · bahan masuk ${materialCode} tercatat otomatis` : ''));
}
async function editItem(id) {
  if (!await askPin('mengubah item persediaan')) return;
  const i = itemById(id);
  if (!i) return;
  $('iiId').value = i.id; $('iiName').value = i.name; $('iiSku').value = i.sku || ''; $('iiUnit').value = i.unit || ''; $('iiDepan').checked = !!i.hasDepan; fillMaterialSelect(matCode(i), i.id); linkSel = new Map(itemLinks(i, products).filter(l => l.productId).map(l => [l.productId, l.mult])); $('iiLinkSearch').value = ''; renderLinkPicker(); $('iiSave').textContent = 'Simpan perubahan';
  $('iiName').focus();
}
async function deleteItem(id) {
  if (!await askPin('menghapus item persediaan')) return;
  const i = itemById(id);
  if (!i) return;
  const mine = entries.filter(x => x.itemId === id);
  if (!confirm(mine.length ? `Hapus “${i.name}” beserta ${mine.length} catatannya? Tindakan ini tidak bisa dibatalkan.` : `Hapus item “${i.name}”?`)) return;
  for (const x of mine) { await revertApplied(x); await del('invEntries', x.id); }
  await del('invItems', id);
  await openItems();
  await renderInventory();
  toast('Item dihapus');
}
async function seedItems() {
  if (items.length && !confirm('Item sudah ada. Tambahkan daftar contoh yang namanya belum ada?')) return;
  const have = new Set(items.map(i => i.name.toLowerCase()));
  let n = 0;
  for (const s of SEED_ITEMS) if (!have.has(s.name.toLowerCase())) { await put('invItems', { ...s, id: uid(), productId: '', createdAt: Date.now() + n }); n++; }
  await renderInventory();
  if ($('invItemDialog').open) await renderItemList();
  toast(n ? `${n} item contoh ditambahkan` : 'Semua item contoh sudah ada');
}

// ---------- penjualan dari kasir: sinkron OTOMATIS lewat SKU ----------
// Setiap penjualan di kasir menghasilkan catatan 'jual' depan per item per hari (id kasir-<item>-<tanggal>).
// Disinkronkan saat transaksi tersimpan, saat Persediaan dibuka/dimuat ulang, dan saat SKU berubah.
async function writeSales(dates, txs) {
  txs = txs || await all('transactions'); products = await all('products');
  let n = 0;
  for (const it of items.filter(i => i.hasDepan)) {
    const linked = linksOf(it).length > 0;
    for (const date of dates) {
      const id = `kasir-${it.id}-${date}`, ex = entries.find(x => x.id === id), q = linked ? posSalesForItem(txs, products, it, date) : 0;
      if (q > 0) { if (!ex || ex.qty !== q) { await put('invEntries', { id, date, itemId: it.id, area: 'depan', kind: 'jual', qty: q, note: 'Dari transaksi kasir (SKU, ' + (linksOf(it).length > 1 ? linksOf(it).length + ' produk terhubung' : 'terhubung') + ')', source: 'kasir', createdAt: ex?.createdAt || Date.now() }); n++; } }
      else if (ex) { await del('invEntries', id); n++; }
    }
  }
  // catatan kasir milik item yang sudah dihapus / bukan menu depan lagi
  for (const e of entries.filter(x => x.source === 'kasir' && dates.includes(x.date) && !items.some(i => i.id === x.itemId && i.hasDepan))) { await del('invEntries', e.id); n++; }
  return n;
}
async function autoSync() {
  try {
    if (!items.length) { unmatchedSold = []; return; }
    const txs = await all('transactions'); products = await all('products');
    const monthTx = txs.filter(t => String(t.date).startsWith(month));
    const dates = [...new Set([...monthTx.map(t => t.date), ...entries.filter(e => e.source === 'kasir' && String(e.date).startsWith(month)).map(e => e.date)])];
    if (await writeSales(dates, txs)) entries = await all('invEntries');
    const ids = new Set(), keys = new Set();
    for (const it of items.filter(i => i.hasDepan)) for (const l of linksOf(it)) { if (l.productId) ids.add(l.productId); if (l.key) keys.add(l.key); }
    const un = new Set();
    for (const t of monthTx) for (const l of t.items || []) { const p = products.find(x => x.id === l.productId); if (!(ids.has(l.productId) || keys.has(normSku(l.sku)) || (p && keys.has(normSku(p.sku))))) un.add(l.name); }
    unmatchedSold = [...un];
    lastSync = new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
  } catch (err) { console.warn('Sinkron penjualan gagal', err); }
}
async function syncSale(date) {
  await load();
  if (date && !String(date).startsWith(month) && (await writeSales([date]))) entries = await all('invEntries');
  await renderInventory();
}

// ---------- pasang ----------
function bind() {
  if (!$('inventory')) return;
  document.querySelectorAll('[data-inv-tab]').forEach(b => { b.onclick = () => { tab = b.dataset.invTab; renderPage(); }; });
  $('invMonth').value = month;
  $('invMonth').onchange = () => { month = $('invMonth').value || month; renderPage(); };
  $('invThisMonth').onclick = () => { month = localToday().slice(0, 7); renderPage(); };
  $('invLow').onchange = async () => {
    const v = $('invLow').value === '' ? 2 : Math.max(0, Number($('invLow').value) || 0);
    const s = (await all('settings')).find(x => x.id === 'main') || {};
    await put('settings', { ...s, id: 'main', invLowDays: v });
    await renderInventory();
  };
  bindLinkPicker();
  $('ioOut').onchange = showOlahSku;
  $('invManage').onclick = openItems;
  $('invEntryForm').addEventListener('submit', e => e.preventDefault());
  $('ieSave').onclick = saveEntry;
  $('ieArea').onchange = () => { fillEntryItems(); fillKinds(); };
  $('ieItem').onchange = () => fillKinds();
  $('ieKind').onchange = fillHint;
  $('ieDate').onchange = fillHint;
  $('ioSave').onclick = saveOlah;
  $('iiSave').onclick = saveItem;
  $('iiReset').onclick = () => { $('iiId').value = ''; $('iiSku').value = ''; $('iiName').value = ''; $('iiUnit').value = ''; $('iiDepan').checked = true; fillMaterialSelect('', ''); linkSel = new Map(); renderLinkPicker(); $('iiSave').textContent = 'Tambah item'; };
  $('iiMaterial').onchange = () => { const m = materials.find(x => normSku(x.code) === normSku($('iiMaterial').value)); if (m) { if (!$('iiName').value.trim()) $('iiName').value = m.name; if (!$('iiUnit').value.trim()) $('iiUnit').value = m.buyUnit || m.stockUnit || ''; } materialHint(); };
  $('iiUnit').addEventListener('input', materialHint);
  $('iiSeed').onclick = seedItems;
}
bind();
Object.assign(window, {
  renderInventory,
  invOpen: openEntry, invOlah: () => openOlah(), invEdit: editEntry, invDelete: deleteEntry,
  invSyncSale: syncSale, invManageItems: openItems, invEditItem: editItem, invDelItem: deleteItem, invSeed: seedItems,
});
