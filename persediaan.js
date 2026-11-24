// Kontrol Persediaan — bagian DAPUR dan DEPAN.
// Dapur: stok awal / bahan masuk → dipakai (diolah jadi menu) → naik ke depan → sisa.
// Depan: kiriman dari dapur (= stok awal depan) → penjualan → sisa.
// Memakai database, PIN, dan toast dari app.js (lewat window), seperti modul resto.
import { all, put, del } from './db.js';
import { AREA, KIND_LABEL, kindsFor, summarizeAll, summarize, dailyCard, posSalesBySku, firstMinus, balanceAt, monthRange, localToday, SEED_ITEMS } from './persediaan-logic.js';

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
const prodFor = it => (!it ? null : products.find(p => normSku(p.sku) && normSku(p.sku) === normSku(it.sku)) || (it.productId ? products.find(p => p.id === it.productId) : null) || null);
// Ubah stok produk (Kelola Produk). Stok yang belum dilacak dianggap 0 saat pertama kali terisi.
async function adjustStock(productId, delta) {
  const p = (await all('products')).find(x => x.id === productId);
  if (!p) return null;
  const cur = p.stock === null || p.stock === undefined || p.stock === '' ? 0 : Number(p.stock);
  const next = Math.max(0, Math.round((cur + delta) * 1000) / 1000);
  await put('products', { ...p, stock: next });
  return { p, next };
}

let tab = 'dash', items = [], entries = [], products = [], low = 2, month = localToday().slice(0, 7), cardItem = '', loaded = false;

// ---------- data ----------
async function load() {
  items = (await all('invItems')).sort((a, b) => String(a.name).localeCompare(String(b.name), 'id'));
  entries = await all('invEntries');
  products = await all('products');
  const s = (await all('settings')).find(x => x.id === 'main') || {};
  low = s.invLowDays === undefined || s.invLowDays === null || s.invLowDays === '' ? 2 : Number(s.invLowDays);
  loaded = true;
}
const itemById = id => items.find(i => i.id === id);
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
  const flow = '<div class="inv-flow" aria-label="Alur persediaan"><span class="fl dapur">Dapur</span><span>Bahan masuk</span><i>→</i><span>Dipakai / diolah jadi menu</span><i>→</i><span>Naik ke depan</span><i>→</i><span class="fl depan">Depan</span><span>Stok awal depan</span><i>→</i><span>Terjual</span><i>→</i><span>Sisa</span></div>';
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
    const info = e.refId ? ' <span class="chip">olahan</span>' : e.source === 'kasir' ? ' <span class="chip">dari kasir</span>' : '';
    const readonly = withNaikInfo && e.area === 'dapur';
    return `<tr><td>${dmy(e.date)}</td><td><b>${esc(it?.name || '(item dihapus)')}</b>${it?.sku ? `<small class="sku">SKU: ${esc(it.sku)}</small>` : ''}</td><td>${readonly ? 'Masuk dari dapur' : esc(label || e.kind)}${info}</td><td class="num"><b>${num(e.qty)}</b> ${esc(unitOf(it))}</td><td>${esc(e.note || '')}</td><td class="act">${readonly ? '<small>diubah di tab Dapur</small>' : `<button class="link" onclick="invEdit('${e.id}')">Edit</button><button class="link danger-link" onclick="invDelete('${e.id}')">Hapus</button>`}</td></tr>`;
  });
}
function entryList(list, withNaikInfo = false) {
  if (!list.length) return '<div class="empty">Belum ada data.</div>';
  const table = simpleTable(entryRows(list, withNaikInfo), ['Tanggal', 'Item', 'Jenis', 'Jumlah', 'Catatan', 'Aksi']);
  const cards = list.map(e => {
    const it = itemById(e.itemId);
    const label = e.area === 'depan' ? KIND_LABEL.depan[e.kind] : KIND_LABEL.dapur[e.kind];
    const ro = withNaikInfo && e.area === 'dapur';
    const tag = e.refId ? ' <span class="chip">olahan</span>' : e.source === 'kasir' ? ' <span class="chip">dari kasir</span>' : '';
    return `<article class="exp-card"><div class="exp-card-top"><div><b>${esc(it?.name || '(item dihapus)')}</b>${it?.sku ? `<small class="sku">SKU: ${esc(it.sku)}</small>` : ''}<small>${dmy(e.date)} · ${ro ? 'Masuk dari dapur' : esc(label || e.kind)}${tag}</small></div><strong>${num(e.qty)} ${esc(unitOf(it))}</strong></div>${e.note ? `<p>${esc(e.note)}</p>` : ''}${ro ? '<p>Diubah di tab Dapur</p>' : `<div class="exp-card-actions"><button class="outline" onclick="invEdit('${e.id}')">Edit</button><button class="outline danger" onclick="invDelete('${e.id}')">Hapus</button></div>`}</article>`;
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
  const actions = `<div class="inv-actions"><button class="btn" onclick="invOpen({area:'dapur',kind:'masuk'})">＋ Bahan masuk</button><button class="outline" onclick="invOlah()">Olah jadi menu</button><button class="outline" onclick="invOpen({area:'dapur',kind:'naik'})">Naik ke depan</button><button class="outline" onclick="invOpen({area:'dapur',kind:'pakai'})">Dipakai</button><button class="outline" onclick="invOpen({area:'dapur',kind:'rusak'})">Rusak</button></div>`;
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
    const actions = `<div class="inv-actions"><button class="btn" onclick="invSalesOpen()">＋ Penjualan</button><button class="outline" onclick="invOpen({area:'depan',kind:'rusak'})">Rusak</button><button class="outline" onclick="invOpen({area:'depan',kind:'awal'})">Stok awal depan</button></div>`;
  const hint = '<p class="inv-note">Naik dari dapur otomatis menjadi stok depan dan menambah stok produk (dicocokkan lewat SKU). Terjual diambil otomatis dari kasir lewat SKU dan mengurangi stok produk. Sisa sore otomatis menjadi stok awal hari berikutnya.</p>';
  return actions + `<div class="panel exp-panel inv-panel"><div class="panel-head"><h2>Posisi stok depan</h2><small>${dmy(from)} – ${dmy(to)}</small></div><div class="pad">${fi.length ? pos + hiddenNote(rows, shownF) : '<div class="empty">Belum ada item yang punya bagian depan. Centang “Ada bagian depan” saat menambah item.</div>'}</div></div>
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
  let ks = it ? kindsFor(it, area) : [];
  if (keep && !ks.includes(keep) && KIND_LABEL[area][keep]) ks = [...ks, keep];
  $('ieKind').innerHTML = ks.map(k => `<option value="${k}">${KIND_LABEL[area][k]}</option>`).join('');
  if (keep && ks.includes(keep)) $('ieKind').value = keep;
  fillHint();
}
function fillHint() {
  const it = itemById($('ieItem').value), date = $('ieDate').value;
  if ($('ieSku')) { const pr = prodFor(it); $('ieSku').textContent = it ? (it.sku ? `SKU/kode: ${it.sku}` + (pr ? ` → produk ${pr.name} (stok ${pr.stock ?? 'tidak dilacak'})` : ' (belum cocok dengan produk)') : 'SKU belum diisi di Kelola item') : ''; }
  if (!it || !date) { $('ieHint').textContent = ''; return; }
  const b = balanceAt(it, entries.filter(e => e.id !== $('ieId').value), date), u = unitOf(it);
  const kind = $('ieKind').value;
  $('ieHint').textContent = `Sisa per ${dmy(date)} — Dapur: ${num(b.dapur)}${it.hasDepan ? ` · Depan: ${num(b.depan)}` : ''} ${u}` + (kind === 'naik' ? ' · Jumlah ini otomatis menjadi stok awal depan dan menambah stok produk (via SKU).' : '');
}
function openEntry(opts = {}) {
  if (!items.length) { toast('Tambahkan item persediaan dulu'); invManageItems(); return; }
  const old = opts.id ? entries.find(e => e.id === opts.id) : null;
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
  const rec = { id: id || uid(), date, itemId, area, kind, qty, note: $('ieNote').value.trim(), createdAt: old?.createdAt || Date.now() };
  if (old?.refId) rec.refId = old.refId;
  const next = entries.filter(x => x.id !== rec.id).concat(rec);
  if (!firstMinus(it, entries) && firstMinus(it, next) && !confirm(`Saldo ${it.name} akan menjadi MINUS pada ${dmy(firstMinus(it, next))}. Biasanya ini tanda catatan kurang atau salah input. Tetap simpan?`)) return;
  products = await all('products');
  if (old?.stockApplied) await adjustStock(old.stockApplied.productId, -old.stockApplied.qty);
  let msg = 'Catatan persediaan disimpan';
  if (area === 'dapur' && kind === 'naik') {
    const prod = prodFor(it);
    if (prod) { const r = await adjustStock(prod.id, qty); rec.stockApplied = { productId: prod.id, qty }; msg = `Naik ke depan dicatat. Stok ${prod.name} +${num(qty)} → ${num(r.next)}`; }
    else msg = 'Dicatat, tetapi SKU item belum cocok dengan produk — stok produk tidak berubah';
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
  if (!await askPin('mengubah catatan persediaan')) return;
  const e = entries.find(x => x.id === id);
  if (!e) return;
  if (e.refId) openOlah(e.refId); else openEntry({ id });
}
async function deleteEntry(id) {
  if (!await askPin('menghapus catatan persediaan')) return;
  const e = entries.find(x => x.id === id);
  if (!e) return;
  const group = e.refId ? entries.filter(x => x.refId === e.refId) : [e];
  if (!confirm(e.refId ? 'Catatan ini bagian dari olahan (bahan dipakai + menu hasil). Hapus keduanya?' : 'Hapus catatan ini?')) return;
  for (const x of group) { if (x.stockApplied) await adjustStock(x.stockApplied.productId, -x.stockApplied.qty); await del('invEntries', x.id); }
  await renderInventory();
  window.renderProducts?.();
  toast('Catatan dihapus');
}

// ---------- kelola item ----------
async function renderItemList() {
  const plist = await all('products');
  $('iiProduct').innerHTML = '<option value="">— Tidak terhubung —</option>' + plist.map(p => `<option value="${esc(p.id)}">${esc(p.name)}${p.sku ? ` [${esc(p.sku)}]` : ''}</option>`).join('');
  $('iiList').innerHTML = items.length ? items.map(i => `<div class="master-expense-row"><div class="mrow-head"><b>${esc(i.name)}</b><span class="chip">SKU: ${esc(i.sku || '—')}</span><span class="chip">${esc(unitOf(i) || 'satuan —')}</span><span class="gbadge ${i.hasDepan ? 'g-oper' : 'g-bahan'}">${i.hasDepan ? 'Dapur + Depan' : 'Dapur saja'}</span><button type="button" class="link" onclick="invEditItem('${i.id}')">Edit</button><button type="button" class="link danger-link" onclick="invDelItem('${i.id}')">Hapus</button></div>${(() => { const pr = prodFor(i); return `<small>${pr ? 'Terhubung ke produk: ' + esc(pr.name) : 'SKU belum cocok dengan produk di Kelola Produk'}</small>`; })()}</div>`).join('') : '<div class="empty">Belum ada item.</div>';
}
async function openItems() {
  await load();
  $('iiId').value = ''; $('iiName').value = ''; $('iiSku').value = ''; $('iiUnit').value = ''; $('iiDepan').checked = true; $('iiSave').textContent = 'Tambah item';
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
  let sku = $('iiSku').value.trim(); const pid = $('iiProduct').value || '';
  if (!sku && pid) sku = (await all('products')).find(p => p.id === pid)?.sku || '';
  if (sku && items.some(i => i.id !== id && normSku(i.sku) === normSku(sku))) return toast('SKU sudah dipakai item persediaan lain');
  await put('invItems', { ...(old || {}), id: id || uid(), name, sku, unit: $('iiUnit').value.trim(), hasDepan: $('iiDepan').checked, productId: pid, createdAt: old?.createdAt || Date.now() });
  await openItems();
  await renderInventory();
  toast(id ? 'Item diperbarui' : 'Item ditambahkan');
}
async function editItem(id) {
  if (!await askPin('mengubah item persediaan')) return;
  const i = itemById(id);
  if (!i) return;
  $('iiId').value = i.id; $('iiName').value = i.name; $('iiSku').value = i.sku || ''; $('iiUnit').value = i.unit || ''; $('iiDepan').checked = !!i.hasDepan; $('iiProduct').value = i.productId || ''; $('iiSave').textContent = 'Simpan perubahan';
  $('iiName').focus();
}
async function deleteItem(id) {
  if (!await askPin('menghapus item persediaan')) return;
  const i = itemById(id);
  if (!i) return;
  const mine = entries.filter(x => x.itemId === id);
  if (!confirm(mine.length ? `Hapus “${i.name}” beserta ${mine.length} catatannya? Tindakan ini tidak bisa dibatalkan.` : `Hapus item “${i.name}”?`)) return;
  for (const x of mine) { if (x.stockApplied) await adjustStock(x.stockApplied.productId, -x.stockApplied.qty); await del('invEntries', x.id); }
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

// ---------- penjualan dari kasir (dicocokkan lewat SKU) ----------
function datesOf(date, scope) {
  if (scope !== 'month') return [date];
  const { days } = monthRange(date.slice(0, 7));
  return Array.from({ length: days }, (_, k) => `${date.slice(0, 7)}-${String(k + 1).padStart(2, '0')}`);
}
async function writeSales(dates) {
  const txs = await all('transactions'); products = await all('products');
  let n = 0;
  for (const it of items.filter(i => i.hasDepan)) {
    const sku = it.sku || prodFor(it)?.sku; if (!sku) continue;
    for (const date of dates) {
      const q = posSalesBySku(txs, products, sku, date), id = `kasir-${it.id}-${date}`, ex = entries.find(x => x.id === id);
      if (q > 0) { if (!ex || ex.qty !== q) { await put('invEntries', { id, date, itemId: it.id, area: 'depan', kind: 'jual', qty: q, note: 'Dari transaksi kasir (SKU)', source: 'kasir', createdAt: ex?.createdAt || Date.now() }); n++; } }
      else if (ex) { await del('invEntries', id); n++; }
    }
  }
  return n;
}
async function syncSale(date) { await load(); if (await writeSales([date])) await renderInventory(); }
async function openSales() {
  if (!items.length) { toast('Tambahkan item persediaan dulu'); invManageItems(); return; }
  $('isDate').value = localToday(); $('isScope').value = 'day';
  await salesPreview(); $('invSalesDialog').showModal();
}
async function salesPreview() {
  const dates = datesOf($('isDate').value || localToday(), $('isScope').value), txs = await all('transactions'); products = await all('products');
  const rows = items.filter(i => i.hasDepan).map(it => {
    const sku = it.sku || prodFor(it)?.sku;
    const q = sku ? dates.reduce((t, d) => t + posSalesBySku(txs, products, sku, d), 0) : null;
    return `<tr><td><b>${esc(it.name)}</b><small class="sku">SKU: ${esc(sku || '—')}</small></td><td class="num">${q === null ? '<small>SKU belum diisi</small>' : `<b>${num(q)}</b> ${esc(unitOf(it))}`}</td></tr>`;
  });
  $('isPreview').innerHTML = rows.length ? simpleTable(rows, ['Item (menu depan)', 'Terjual (kasir)']) : '<div class="empty">Belum ada item dengan bagian depan.</div>';
}
async function saveSales(e) {
  e.preventDefault();
  const n = await writeSales(datesOf($('isDate').value || localToday(), $('isScope').value));
  $('invSalesDialog').close(); await renderInventory();
  toast(n ? `${n} catatan penjualan diperbarui dari kasir` : 'Tidak ada perubahan penjualan dari kasir');
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
  $('iiProduct').onchange = async () => { const p = (await all('products')).find(x => x.id === $('iiProduct').value); if (p) { $('iiSku').value = p.sku || ''; if (!$('iiName').value.trim()) $('iiName').value = p.name; } };
  $('ioOut').onchange = showOlahSku;
  $('isSave').onclick = saveSales; $('isDate').onchange = $('isScope').onchange = salesPreview;
  $('invManage').onclick = openItems;
  $('invEntryForm').addEventListener('submit', e => e.preventDefault());
  $('ieSave').onclick = saveEntry;
  $('ieArea').onchange = () => { fillEntryItems(); fillKinds(); };
  $('ieItem').onchange = () => fillKinds();
  $('ieKind').onchange = fillHint;
  $('ieDate').onchange = fillHint;
  $('ioSave').onclick = saveOlah;
  $('iiSave').onclick = saveItem;
  $('iiReset').onclick = () => { $('iiId').value = ''; $('iiSku').value = ''; $('iiName').value = ''; $('iiUnit').value = ''; $('iiDepan').checked = true; $('iiProduct').value = ''; $('iiSave').textContent = 'Tambah item'; };
  $('iiSeed').onclick = seedItems;
}
bind();
Object.assign(window, {
  renderInventory,
  invOpen: openEntry, invOlah: () => openOlah(), invEdit: editEntry, invDelete: deleteEntry,
  invSalesOpen: openSales, invSyncSale: syncSale, invManageItems: openItems, invEditItem: editItem, invDelItem: deleteItem, invSeed: seedItems,
});
