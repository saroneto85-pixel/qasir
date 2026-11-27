// Menu "Stok Bahan Baku" & "HPP Menu" + kaitannya ke Pengeluaran (belanja bahan) dan Kontrol Persediaan.
// Logika hitung ada di bahan-logic.js; modul ini hanya tampilan & penyimpanan.
import { all, put, del } from './db.js';
import { buildXlsx } from './xlsx.js';
import { readXlsx } from './xlsx-read.js';
import { defaultExpenseGroup } from './pembukuan-logic.js';
import {
  n, normCode, unitCost, indexByCode, menuCost, menuStatus, productForMenu, invItemForMaterial, AUTO_INV_SOURCES,
  stockSummary, movements, runBalance, invEntriesFromExpenses, ENTRY_KINDS, RECIPE_GROUPS, STATUS_LABEL, parseHppWorkbook, mergeImport
} from './bahan-logic.js';

const $ = id => document.getElementById(id);
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const toast = s => window.toast?.(s);
const pin = r => (window.requirePin ? window.requirePin(r) : Promise.resolve(true));
const rp = v => 'Rp' + new Intl.NumberFormat('id-ID', { maximumFractionDigits: 0 }).format(Math.round(n(v)));
const num = (v, d = 2) => new Intl.NumberFormat('id-ID', { maximumFractionDigits: d }).format(n(v));
const pct = v => (v === null || v === undefined ? '—' : num(v * 100, 1) + '%');
const pad = x => String(x).padStart(2, '0');
const localToday = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const dmy = d => { const p = String(d || '').split('-'); return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : '—'; };
const monthEnd = ym => { const [y, m] = ym.split('-').map(Number); return `${ym}-${pad(new Date(y, m, 0).getDate())}`; };

let D = { materials: [], menus: [], entries: [], products: [], transactions: [], expenses: [], invItems: [], invEntries: [], settings: {} };
let month = localToday().slice(0, 7), search = '', statusFilter = 'semua', hppSearch = '';
let importParsed = null;

async function load() {
  const [materials, menus, entries, products, transactions, expenses, invItems, invEntries, settings] = await Promise.all(
    ['materials', 'hppMenus', 'materialEntries', 'products', 'transactions', 'expenses', 'invItems', 'invEntries', 'settings'].map(s => all(s)));
  D = {
    materials: materials.sort((a, b) => String(a.code).localeCompare(String(b.code), 'id', { numeric: true })),
    menus: menus.sort((a, b) => String(a.code).localeCompare(String(b.code), 'id', { numeric: true })),
    entries, products, transactions, expenses, invItems, invEntries, settings: settings.find(x => x.id === 'main') || {}
  };
}
const matByCode = code => D.materials.find(m => normCode(m.code) === normCode(code));
const menuPrice = m => { const p = productForMenu(m, D.products); return p && n(p.price) > 0 ? n(p.price) : n(m.price); };
const costOf = m => menuCost({ ...m, price: menuPrice(m) }, D.materials);
const usedIn = code => D.menus.filter(m => (m.items || []).some(i => normCode(i.code) === normCode(code)));

// =====================================================================
// STOK BAHAN BAKU
// =====================================================================
const STATUS_CLS = { aman: 'ok', menipis: 'warn', habis: 'bad', minus: 'bad', kosong: 'mute', tidak: 'mute', persediaan: 'info' };

export async function renderBahan() {
  if (!$('bahan')) return;
  await load();
  await syncInvFromExpenses();
  const from = month + '-01', to = monthEnd(month);
  const sum = stockSummary(D, from, to);
  const tracked = sum.filter(s => s.status !== 'tidak' && s.status !== 'persediaan');
  const low = sum.filter(s => ['menipis', 'habis', 'minus'].includes(s.status));
  const value = sum.reduce((a, s) => a + s.value, 0), buy = sum.reduce((a, s) => a + s.buyValue, 0);
  $('bahanStats').innerHTML = [
    ['Bahan dilacak', num(tracked.length, 0), `${D.materials.length} bahan terdaftar`],
    ['Perlu belanja', num(low.length, 0), low.slice(0, 3).map(s => s.material.name).join(', ') || 'Semua aman'],
    ['Nilai stok akhir', rp(value), 'sisa × harga per satuan stok'],
    ['Belanja bahan', rp(buy), 'dari Pengeluaran (kode bahan) bulan ini']
  ].map(([a, b, c]) => `<article><small>${a}</small><strong>${esc(b)}</strong><span>${esc(c)}</span></article>`).join('');
  const q = search.trim().toLowerCase();
  const rows = sum.filter(s => (statusFilter === 'semua' || (statusFilter === 'perlu' ? ['menipis', 'habis', 'minus'].includes(s.status) : s.status === statusFilter))
    && (!q || s.code.toLowerCase().includes(q) || String(s.material.name).toLowerCase().includes(q)));
  if (!D.materials.length) {
    $('bahanBody').innerHTML = `<div class="empty-state"><b>Belum ada bahan baku</b><span>Impor file Excel HPP (sheet Bahan_Baku, Menu, Resep) atau tambah bahan satu per satu.</span><div class="bahan-empty-actions"><button class="btn" type="button" onclick="bahanUi.openImport()">⇧ Impor Excel HPP</button><button class="outline" type="button" onclick="bahanUi.editMaterial()">＋ Tambah bahan</button></div></div>`;
    return;
  }
  const unit = s => esc(s.unit ?? s.material.stockUnit ?? '');
  const badge = s => `<span class="st-badge ${STATUS_CLS[s.status]}">${STATUS_LABEL[s.status]}</span>`;
  const qty = (v, s) => (s.status === 'tidak' ? '—' : `${num(v)} <small>${unit(s)}</small>`);
  const tbl = `<div class="table-wrap"><table class="bahan-table"><thead><tr><th>Kode</th><th>Bahan</th><th class="num">Awal</th><th class="num">Belanja</th><th class="num">Terpakai</th><th class="num">Penyesuaian</th><th class="num">Sisa</th><th>Status</th><th class="num">Nilai</th><th></th></tr></thead><tbody>${rows.map(s => `<tr>
    <td><b>${esc(s.code)}</b></td><td><b>${esc(s.material.name)}</b><small>${esc(s.material.buyUnit || '')} ${rp(s.material.buyPrice)} · isi ${num(s.material.perBuy)} ${unit(s)}${s.invItem ? ' · Persediaan: ' + esc(s.invItem.name) : ''}</small></td>
    <td class="num">${s.invItem ? '—' : qty(s.open, s)}</td><td class="num">${s.buy ? qty(s.buy, s) : '—'}${s.buyValue ? `<small>${rp(s.buyValue)}</small>` : ''}</td>
    <td class="num">${s.invItem ? '—' : s.use ? qty(s.use, s) : '—'}${s.useProd ? '<small>termasuk masakan</small>' : ''}</td><td class="num">${s.invItem ? '—' : s.adjust ? qty(s.adjust, s) : '—'}</td>
    <td class="num"><b>${qty(s.close, s)}</b>${n(s.material.minStock) ? `<small>min ${num(s.material.minStock)}</small>` : ''}</td><td>${badge(s)}</td><td class="num">${s.value ? rp(s.value) : '—'}</td>
    <td class="act"><button class="link" type="button" onclick="bahanUi.openEntry('${esc(s.code)}')">Catat</button><button class="link" type="button" onclick="bahanUi.openCard('${esc(s.code)}')">Kartu</button><button class="link" type="button" onclick="bahanUi.editMaterial('${esc(s.material.id)}')">Edit</button></td></tr>`).join('')}</tbody></table></div>`;
  const cards = rows.map(s => `<article class="bahan-card"><div class="bc-top"><div><b>${esc(s.code)} · ${esc(s.material.name)}</b><small>${s.invItem ? 'Dipantau di Persediaan: ' + esc(s.invItem.name) : `${esc(s.material.buyUnit || '')} ${rp(s.material.buyPrice)} · isi ${num(s.material.perBuy)} ${unit(s)}`}</small></div>${badge(s)}</div>
    <div class="bc-nums"><span>Sisa<b>${qty(s.close, s)}</b></span><span>Belanja<b>${s.buy ? qty(s.buy, s) : '—'}</b></span><span>Terpakai<b>${s.invItem ? '—' : s.use ? qty(s.use, s) : '—'}</b></span></div>
    <div class="bc-actions"><button class="outline" type="button" onclick="bahanUi.openEntry('${esc(s.code)}')">Catat</button><button class="outline" type="button" onclick="bahanUi.openCard('${esc(s.code)}')">Kartu stok</button><button class="outline" type="button" onclick="bahanUi.editMaterial('${esc(s.material.id)}')">Edit</button></div></article>`).join('');
  $('bahanBody').innerHTML = rows.length ? `<div class="exp-desktop">${tbl}</div><div class="bahan-cards">${cards}</div><p class="muted small">Stok dihitung otomatis: stok awal/opname + belanja di Pengeluaran (kode bahan) − pemakaian sesuai resep HPP Menu dari penjualan kasir (atau dari masakan yang dicatat di Kontrol Persediaan) − rusak.</p>`
    : '<div class="empty">Tidak ada bahan yang cocok dengan filter.</div>';
}

// ---------- catat stok awal / opname / rusak ----------
function openEntry(code) {
  if (!D.materials.length) return toast('Tambahkan bahan dulu');
  $('meForm').reset();
  $('meMaterial').innerHTML = D.materials.filter(m => m.tracked !== false).map(m => `<option value="${esc(m.code)}">${esc(m.code)} · ${esc(m.name)} (${esc(m.stockUnit || '')})</option>`).join('');
  if (code) $('meMaterial').value = normCode(code);
  if (!$('meMaterial').value) {
    const m = matByCode(code);
    if (m && m.tracked === false) return toast(`${m.name} tidak dilacak stoknya (lihat Edit bahan)`);
  }
  $('meDate').value = localToday();
  $('meKind').innerHTML = Object.entries(ENTRY_KINDS).map(([k, v]) => `<option value="${k}">${v}</option>`).join('');
  $('meKind').value = 'opname';
  entryHint();
  $('materialEntryDialog').showModal();
}
function entryHint() {
  const m = matByCode($('meMaterial').value), u = m?.stockUnit || '';
  $('meUnit').textContent = u ? `dalam ${u}` : '';
  const s = m ? stockSummary(D, '0000-01-01', $('meDate').value || localToday()).find(x => x.code === normCode(m.code)) : null;
  const k = $('meKind').value;
  const inv = m && invItemForMaterial(m, D.invItems);
  $('meHint').textContent = (k === 'opname' ? 'Isi jumlah HASIL HITUNG FISIK di akhir hari; selisihnya dicatat otomatis. ' : k === 'awal' ? 'Stok saat mulai memakai menu ini. ' : '')
    + (s ? `Sisa menurut catatan pada tanggal itu: ${num(s.close)} ${u}.` : '')
    + (inv && k === 'masuk' ? ` Otomatis juga tercatat sebagai Bahan masuk di Persediaan (“${inv.name}”).` : '');
}
async function saveEntry(e) {
  e.preventDefault();
  const code = $('meMaterial').value, qty = Number($('meQty').value), date = $('meDate').value, kind = $('meKind').value;
  if (!code || !date) return toast('Lengkapi bahan dan tanggal');
  if (!(qty >= 0) || $('meQty').value === '' || (kind !== 'opname' && kind !== 'awal' && !(qty > 0))) return toast('Jumlah tidak valid');
  await put('materialEntries', { id: uid(), code, date, kind, qty, note: $('meNote').value.trim(), createdAt: Date.now() });
  $('materialEntryDialog').close();
  toast('Tersimpan');
  await load();
  await syncInvFromExpenses();
  await renderBahan();
}

// ---------- kartu stok ----------
async function openCard(code) {
  $('mcMaterial').innerHTML = D.materials.map(m => `<option value="${esc(m.code)}">${esc(m.code)} · ${esc(m.name)}</option>`).join('');
  $('mcMaterial').value = normCode(code);
  $('mcMonth').value = month;
  renderCard();
  $('materialCardDialog').showModal();
}
function renderCard() {
  const m = matByCode($('mcMaterial').value);
  if (!m) { $('mcBody').innerHTML = ''; return; }
  const ym = $('mcMonth').value || month, from = ym + '-01', to = monthEnd(ym), u = esc(m.stockUnit || '');
  const inv = invItemForMaterial(m, D.invItems);
  const all = runBalance(movements(D).get(normCode(m.code)) || []);
  const before = all.filter(r => r.date < from), rows = all.filter(r => r.date >= from && r.date <= to);
  const open = before.length ? before[before.length - 1].balance : 0;
  const label = { awal: 'Stok awal', beli: 'Belanja', masuk: 'Masuk lain', jual: 'Penjualan', pakai: 'Pemakaian lain', rusak: 'Rusak', opname: 'Opname' };
  const head = (inv ? `<p class="bahan-note">Terhubung ke <b>Kontrol Persediaan</b> (item “${esc(inv.name)}”): setiap belanja dan “Masuk lain” bahan ini otomatis tercatat di sana sebagai Bahan masuk dapur. Stok &amp; nilai bahan tetap dihitung di sini.</p>` : '')
    + (m.tracked === false ? '<p class="bahan-note">Bahan ini tidak dilacak stoknya (biaya overhead). Di bawah riwayat belanjanya.</p>' : '');
  const noBal = m.tracked === false;
  $('mcBody').innerHTML = head + `<div class="table-wrap"><table class="mc-table"><thead><tr><th>Tanggal</th><th>Keterangan</th><th class="num">Masuk / keluar</th>${noBal ? '' : `<th class="num">Saldo (${u})</th>`}</tr></thead><tbody>
    ${noBal ? '' : `<tr class="muted"><td>${dmy(from)}</td><td>Saldo awal bulan</td><td></td><td class="num"><b>${num(open)}</b></td></tr>`}
    ${rows.map(r => `<tr><td>${dmy(r.date)}</td><td><b>${label[r.kind] || r.kind}</b><small>${esc(r.label)}${r.value ? ' · ' + rp(r.value) : ''}</small>${D.entries.some(x => x.id === r.ref) ? `<button class="link danger-link mc-del" type="button" onclick="bahanUi.deleteEntry('${esc(r.ref)}')">Hapus catatan</button>` : ''}</td><td class="num ${r.delta < 0 ? 'mc-out' : 'mc-in'}">${r.kind === 'opname' ? '= ' + num(r.balance) : r.delta > 0 ? '+' + num(r.delta) : r.delta < 0 ? '−' + num(-r.delta) : ''}</td>${noBal ? '' : `<td class="num">${num(r.balance)}</td>`}</tr>`).join('') || `<tr><td colspan="${noBal ? 3 : 4}" class="muted">Belum ada pergerakan di bulan ini.</td></tr>`}
  </tbody></table></div>`;
}
async function deleteEntry(id) {
  if (!await pin('menghapus catatan stok bahan')) return;
  if (!confirm('Hapus catatan ini?')) return;
  await del('materialEntries', id);
  await load();
  await syncInvFromExpenses();
  renderCard();
  renderBahan();
}

// ---------- master bahan ----------
async function editMaterial(id) {
  if (!await pin(id ? 'mengubah data bahan' : 'menambah bahan')) return;
  await load();
  const m = D.materials.find(x => x.id === id) || {};
  $('mmForm').reset();
  $('mmId').value = m.id || '';
  $('mmCode').value = m.code || nextCode(D.materials, 'B', 3);
  $('mmName').value = m.name || '';
  $('mmBuyUnit').value = m.buyUnit || '';
  $('mmBuyPrice').value = m.buyPrice ?? '';
  $('mmPerBuy').value = m.perBuy ?? 1;
  $('mmStockUnit').value = m.stockUnit || '';
  $('mmTracked').checked = m.tracked !== false;
  $('mmMin').value = m.minStock || '';
  $('mmNote').value = m.note || '';
  $('mmTitle').textContent = id ? 'Edit bahan' : 'Tambah bahan';
  $('mmDelete').hidden = !id;
  materialHint();
  $('materialDialog').showModal();
}
function materialHint() {
  const uc = unitCost({ buyPrice: $('mmBuyPrice').value, perBuy: $('mmPerBuy').value });
  const used = $('mmId').value ? usedIn($('mmCode').value) : [];
  const inv = invItemForMaterial({ code: $('mmCode').value }, D.invItems);
  $('mmHint').innerHTML = `Harga per ${esc($('mmStockUnit').value || 'satuan stok')}: <b>${uc ? 'Rp' + num(uc, uc < 10 ? 4 : 2) : '— (harga belum diisi)'}</b>`
    + (used.length ? `<br>Dipakai di ${used.length} menu: ${used.slice(0, 5).map(x => esc(x.code)).join(', ')}${used.length > 5 ? '…' : ''}` : '')
    + (inv ? `<br>Terhubung ke item Persediaan “${esc(inv.name)}” (bahan masuk otomatis).` : '');
}
export function nextCode(list, prefix, width) {
  let max = 0;
  for (const x of list) { const mm = String(x.code || '').match(new RegExp('^' + prefix + '(\\d+)$', 'i')); if (mm) max = Math.max(max, Number(mm[1])); }
  return prefix + String(max + 1).padStart(width, '0');
}
async function saveMaterial(e) {
  e.preventDefault();
  const id = $('mmId').value, code = normCode($('mmCode').value), name = $('mmName').value.trim();
  if (!code || !name) return toast('Kode dan nama bahan wajib diisi');
  if (D.materials.some(m => m.id !== id && normCode(m.code) === code)) return toast('Kode bahan ' + code + ' sudah dipakai');
  const perBuy = Number($('mmPerBuy').value);
  if (!(perBuy > 0)) return toast('Isi per satuan beli harus lebih dari 0');
  if (Number($('mmBuyPrice').value) < 0) return toast('Harga tidak boleh negatif');
  const old = D.materials.find(m => m.id === id) || {};
  const rec = { ...old, id: id || uid(), code, name, buyUnit: $('mmBuyUnit').value.trim(), buyPrice: Number($('mmBuyPrice').value) || 0, perBuy,
    stockUnit: $('mmStockUnit').value.trim() || $('mmBuyUnit').value.trim(), tracked: $('mmTracked').checked, minStock: Number($('mmMin').value) || 0,
    note: $('mmNote').value.trim(), createdAt: old.createdAt || Date.now(), updatedAt: Date.now() };
  if (rec.buyPrice !== n(old.buyPrice)) rec.priceDate = localToday();
  await put('materials', rec);
  if (old.code && normCode(old.code) !== code) await renameMaterialCode(old.code, code);
  $('materialDialog').close();
  toast('Bahan disimpan');
  await refreshBoth();
}
// Kode bahan diganti -> ikutkan di resep, belanja, dan catatan stok.
async function renameMaterialCode(from, to) {
  const f = normCode(from);
  for (const m of D.menus) if ((m.items || []).some(i => normCode(i.code) === f)) await put('hppMenus', { ...m, items: m.items.map(i => normCode(i.code) === f ? { ...i, code: to } : i) });
  for (const x of D.expenses) if (normCode(x.materialCode) === f) await put('expenses', { ...x, materialCode: to });
  for (const x of D.entries) if (normCode(x.code) === f) await put('materialEntries', { ...x, code: to });
  for (const x of D.invItems) if (normCode(x.materialCode) === f) await put('invItems', { ...x, materialCode: to });
}
async function deleteMaterial() {
  const id = $('mmId').value, m = D.materials.find(x => x.id === id);
  if (!m) return;
  const used = usedIn(m.code), bought = D.expenses.filter(x => normCode(x.materialCode) === normCode(m.code)).length;
  if (!confirm(`Hapus bahan ${m.code} ${m.name}?` + (used.length ? `\n\nMasih dipakai di ${used.length} resep menu; baris resep itu akan ditandai "bahan tidak dikenal".` : '') + (bought ? `\n${bought} catatan belanja tetap ada di Pengeluaran.` : ''))) return;
  await del('materials', id);
  for (const x of D.entries.filter(x => normCode(x.code) === normCode(m.code))) await del('materialEntries', x.id);
  for (const x of D.invItems.filter(x => normCode(x.materialCode) === normCode(m.code))) await put('invItems', { ...x, materialCode: '' });
  await load(); await syncInvFromExpenses();
  $('materialDialog').close();
  await refreshBoth();
}

// =====================================================================
// HPP MENU
// =====================================================================
export async function renderHpp() {
  if (!$('hpp')) return;
  await load();
  const list = D.menus.map(m => ({ m, c: costOf(m), p: productForMenu(m, D.products) }));
  const priced = list.filter(x => x.c.pct !== null);
  const avg = priced.length ? priced.reduce((a, x) => a + x.c.pct, 0) / priced.length : null;
  const high = list.filter(x => x.c.pct !== null && x.c.pct > 0.7).length, unlinked = list.filter(x => !x.p).length;
  $('hppStats').innerHTML = [
    ['Menu ber-resep', num(list.length, 0), `${D.materials.length} bahan baku`],
    ['Rata-rata food cost', pct(avg), 'HPP ÷ harga jual'],
    ['Food cost > 70%', num(high, 0), 'perlu cek harga / resep'],
    ['Belum terhubung produk', num(unlinked, 0), unlinked ? 'penjualan belum mengurangi stok bahan' : 'semua terhubung ke kasir']
  ].map(([a, b, c]) => `<article><small>${a}</small><strong>${esc(b)}</strong><span>${esc(c)}</span></article>`).join('');
  const q = hppSearch.trim().toLowerCase();
  const rows = list.filter(x => !q || x.m.code.toLowerCase().includes(q) || String(x.m.name).toLowerCase().includes(q) || String(x.m.category || '').toLowerCase().includes(q));
  if (!D.menus.length) {
    $('hppBody').innerHTML = `<div class="empty-state"><b>Belum ada resep menu</b><span>Impor file Excel HPP atau tambah menu, lalu hubungkan ke produk kasir (SKU produk = kode menu) agar penjualan mengurangi stok bahan baku.</span><div class="bahan-empty-actions"><button class="btn" type="button" onclick="bahanUi.openImport()">⇧ Impor Excel HPP</button><button class="outline" type="button" onclick="bahanUi.editMenu()">＋ Tambah menu</button></div></div>`;
    return;
  }
  const st = x => { const s = menuStatus(x.c); return s ? `<span class="st-badge ${s.startsWith('Food') ? 'bad' : 'warn'}">${esc(s)}</span>` : '<span class="st-badge ok">OK</span>'; };
  const link = x => x.p ? `${esc(x.p.name)}<small>SKU ${esc(x.p.sku || '—')} · bahan dipotong per penjualan</small>` : '<span class="st-badge warn">Belum terhubung</span>';
  const costWarn = x => x.p && Math.round(n(x.p.costPrice)) !== Math.round(x.c.perPortion) ? `<small class="warn-text">modal produk ${rp(x.p.costPrice)}</small>` : '';
  const tbl = `<div class="table-wrap"><table><thead><tr><th>Kode</th><th>Menu</th><th>Produk kasir</th><th class="num">Harga jual</th><th class="num">HPP / porsi</th><th class="num">Laba</th><th class="num">Food cost</th><th>Status</th><th></th></tr></thead><tbody>${rows.map(x => `<tr>
    <td><b>${esc(x.m.code)}</b></td><td><b>${esc(x.m.name)}</b><small>${esc(x.m.category || '')} · ${num(x.m.batch, 2)} porsi/batch · ${(x.m.items || []).length} bahan</small></td><td>${link(x)}</td>
    <td class="num">${rp(menuPrice(x.m))}</td><td class="num"><b>${rp(x.c.perPortion)}</b>${costWarn(x)}</td><td class="num">${rp(x.c.profit)}</td><td class="num">${pct(x.c.pct)}</td><td>${st(x)}</td>
    <td class="act"><button class="link" type="button" onclick="bahanUi.editMenu('${esc(x.m.id)}')">Resep</button></td></tr>`).join('')}</tbody></table></div>`;
  const cards = rows.map(x => `<article class="bahan-card"><div class="bc-top"><div><b>${esc(x.m.code)} · ${esc(x.m.name)}</b><small>${x.p ? 'Produk: ' + esc(x.p.name) : 'Belum terhubung ke produk kasir'}</small></div>${st(x)}</div>
    <div class="bc-nums"><span>Harga<b>${rp(menuPrice(x.m))}</b></span><span>HPP<b>${rp(x.c.perPortion)}</b></span><span>Food cost<b>${pct(x.c.pct)}</b></span></div>
    <div class="bc-actions"><button class="outline" type="button" onclick="bahanUi.editMenu('${esc(x.m.id)}')">Lihat / ubah resep</button></div></article>`).join('');
  const unsold = D.products.filter(p => !D.menus.some(m => productForMenu(m, D.products)?.id === p.id));
  $('hppBody').innerHTML = (rows.length ? `<div class="exp-desktop">${tbl}</div><div class="bahan-cards">${cards}</div>` : '<div class="empty">Tidak ada menu yang cocok.</div>')
    + (unsold.length ? `<details class="bahan-note"><summary>${unsold.length} produk kasir belum punya resep (penjualannya tidak mengurangi stok bahan)</summary><p class="small">${unsold.map(p => esc(p.name) + (p.sku ? ` [${esc(p.sku)}]` : '')).join(', ')}</p></details>` : '');
}

// ---------- dialog resep ----------
let editingItems = [];
async function editMenu(id) {
  if (!await pin(id ? 'mengubah resep menu' : 'menambah menu')) return;
  await load();
  const m = D.menus.find(x => x.id === id) || {};
  $('hmForm').reset();
  $('hmId').value = m.id || '';
  $('hmCode').value = m.code || nextCode(D.menus, 'M', 2);
  $('hmName').value = m.name || '';
  $('hmCategory').value = m.category || '';
  $('hmSellUnit').value = m.sellUnit || 'porsi';
  $('hmPrice').value = m.price ?? '';
  $('hmBatch').value = m.batch || 1;
  $('hmNote').value = m.note || '';
  $('hmProduct').innerHTML = '<option value="">Otomatis: produk ber-SKU sama dengan kode menu</option>' + D.products.slice().sort((a, b) => String(a.name).localeCompare(String(b.name), 'id')).map(p => `<option value="${esc(p.id)}">${esc(p.name)}${p.sku ? ` [${esc(p.sku)}]` : ''}</option>`).join('');
  $('hmProduct').value = m.productId && D.products.some(p => p.id === m.productId) ? m.productId : '';
  $('hmApplyCost').checked = true;
  $('hmMatList').innerHTML = D.materials.map(x => `<option value="${esc(x.code)}">${esc(x.name)} (${esc(x.stockUnit || '')})</option>`).join('');
  $('hmGroupList').innerHTML = RECIPE_GROUPS.map(g => `<option value="${esc(g)}">`).join('');
  editingItems = (m.items || []).map(i => ({ ...i }));
  if (!editingItems.length) editingItems.push({ code: '', group: 'Bahan Utama', qty: '' });
  $('hmTitle').textContent = id ? `Resep ${m.code} · ${m.name}` : 'Tambah menu';
  $('hmDelete').hidden = !id;
  renderRecipe();
  $('hppMenuDialog').showModal();
}
function draftMenu() {
  return { code: normCode($('hmCode').value), name: $('hmName').value, batch: Number($('hmBatch').value) || 1, price: Number($('hmPrice').value) || 0,
    productId: $('hmProduct').value, sku: normCode($('hmCode').value), items: editingItems.filter(i => normCode(i.code)).map(i => ({ code: normCode(i.code), group: i.group || '', qty: Number(i.qty) || 0 })) };
}
function renderRecipe() {
  const d = draftMenu(), p = productForMenu(d, D.products);
  const c = menuCost({ ...d, price: p && n(p.price) > 0 ? n(p.price) : d.price }, D.materials);
  const matOptions = [...D.materials].sort((x, y) => String(x.code).localeCompare(String(y.code), 'id', { numeric: true }))
    .map(m => `<option value="${esc(m.code)}">${esc(m.code)} · ${esc(m.name)}</option>`).join('');
  $('hmLines').innerHTML = editingItems.map((it, i) => {
    const m = matByCode(it.code), uc = unitCost(m), qp = (Number(it.qty) || 0) / (d.batch || 1);
    const opts = (it.code && !m ? `<option value="${esc(it.code)}" selected>${esc(it.code)} · (tidak terdaftar)</option>` : '') + matOptions;
    return `<tr><td><select data-i="${i}" data-f="code" class="hm-code" aria-label="Bahan"><option value="">— pilih bahan —</option>${opts}</select><small class="${m ? '' : 'warn-text'}">${m ? esc((m.buyUnit ? 'beli per ' + m.buyUnit + ' ' + rp(m.buyPrice) : '')) : it.code ? 'kode tidak dikenal' : ''}</small></td>
      <td><input list="hmGroupList" value="${esc(it.group || '')}" data-i="${i}" data-f="group"></td>
      <td><input type="number" min="0" step="any" inputmode="decimal" value="${esc(it.qty)}" data-i="${i}" data-f="qty"><small>${esc(m?.stockUnit || '')}</small></td>
      <td class="num" data-l="Qty/porsi">${num(qp, 3)}</td><td class="num" data-l="Biaya/porsi">${m ? (uc ? rp(qp * uc) : '<span class="warn-text">harga kosong</span>') : '—'}</td>
      <td><button class="link danger-link" type="button" data-del="${i}" aria-label="Hapus baris">✕</button></td></tr>`;
  }).join('');
  $('hmSummary').innerHTML = `HPP per porsi <b>${rp(c.perPortion)}</b> · per batch ${rp(c.perBatch)} · laba ${rp(c.profit)} · food cost <b>${pct(c.pct)}</b>`
    + (p ? `<br><small>Terhubung ke produk kasir: ${esc(p.name)} (harga ${rp(p.price)}, modal sekarang ${rp(p.costPrice)})</small>` : '<br><small class="warn-text">Belum terhubung ke produk kasir: buat produk dengan SKU = kode menu, atau pilih produknya.</small>')
    + (menuStatus(c) ? `<br><small class="warn-text">${esc(menuStatus(c))}</small>` : '');
  $('hmLines').querySelectorAll('select.hm-code').forEach(sel => { sel.value = editingItems[Number(sel.dataset.i)].code || ''; });
  $('hmLines').querySelectorAll('input, select').forEach(inp => {
    inp.onchange = () => { editingItems[Number(inp.dataset.i)][inp.dataset.f] = inp.dataset.f === 'code' ? normCode(inp.value) : inp.value; renderRecipe(); };
  });
  $('hmLines').querySelectorAll('[data-del]').forEach(b => { b.onclick = () => { editingItems.splice(Number(b.dataset.del), 1); renderRecipe(); }; });
}
async function saveMenu(e) {
  e.preventDefault();
  const id = $('hmId').value, d = draftMenu(), name = $('hmName').value.trim();
  if (!d.code || !name) return toast('Kode dan nama menu wajib diisi');
  if (D.menus.some(m => m.id !== id && normCode(m.code) === d.code)) return toast('Kode menu ' + d.code + ' sudah dipakai');
  if (!(Number($('hmBatch').value) > 0)) return toast('Porsi per batch harus lebih dari 0');
  const unknown = d.items.filter(i => !matByCode(i.code)).map(i => i.code);
  if (unknown.length && !confirm('Kode bahan belum terdaftar: ' + unknown.join(', ') + '. Tetap simpan?')) return;
  const old = D.menus.find(m => m.id === id) || {};
  const sku = d.productId ? normCode(D.products.find(p => p.id === d.productId)?.sku || d.code) : d.code;
  const rec = { ...old, id: id || uid(), code: d.code, name, category: $('hmCategory').value.trim(), sellUnit: $('hmSellUnit').value.trim() || 'porsi',
    price: Number($('hmPrice').value) || 0, batch: d.batch, productId: d.productId, sku, note: $('hmNote').value.trim(), items: d.items,
    createdAt: old.createdAt || Date.now(), updatedAt: Date.now() };
  await put('hppMenus', rec);
  if ($('hmApplyCost').checked) await applyCost([rec]);
  $('hppMenuDialog').close();
  toast('Resep disimpan');
  await refreshBoth();
}
async function deleteMenu() {
  const id = $('hmId').value, m = D.menus.find(x => x.id === id);
  if (!m || !confirm(`Hapus menu ${m.code} ${m.name} beserta resepnya? Penjualan produknya tidak lagi mengurangi stok bahan.`)) return;
  await del('hppMenus', id);
  $('hppMenuDialog').close();
  await refreshBoth();
}
/** Isi harga modal produk kasir dengan HPP per porsi (laporan laba memakai harga modal saat transaksi). */
async function applyCost(menus) {
  await load();
  let k = 0;
  for (const m of menus) {
    const p = productForMenu(m, D.products);
    if (!p) continue;
    const c = Math.round(costOf(m).perPortion);
    if (c > 0 && Math.round(n(p.costPrice)) !== c) { await put('products', { ...p, costPrice: c }); k++; }
  }
  return k;
}
async function applyAllCost() {
  if (!await pin('mengubah harga modal produk')) return;
  if (!confirm('Isi harga modal semua produk kasir yang terhubung dengan HPP per porsi dari resep? Transaksi lama tidak berubah; transaksi baru memakai modal ini untuk laporan laba.')) return;
  const k = await applyCost(D.menus);
  toast(k ? `${k} produk diperbarui` : 'Harga modal produk sudah sesuai HPP');
  await refreshBoth();
  await window.renderProducts?.();
}

// =====================================================================
// IMPOR & EKSPOR EXCEL
// =====================================================================
async function openImport() {
  if (!await pin('mengimpor data HPP')) return;
  importParsed = null;
  $('biFile').value = '';
  $('biPreview').innerHTML = '<p class="muted small">Pilih file .xlsx dengan sheet <b>Bahan_Baku</b>, <b>Menu</b>, dan <b>Resep</b> (format "Format HPP untuk suntik aplikasi kasir"). Kolom dikenali dari judulnya.</p>';
  $('biGo').disabled = true;
  $('bahanImportDialog').showModal();
}
async function previewImport() {
  const f = $('biFile').files[0];
  if (!f) return;
  $('biPreview').innerHTML = '<p>Membaca file…</p>';
  try {
    importParsed = parseHppWorkbook(await readXlsx(await f.arrayBuffer()));
    await load();
    const mg = mergeImport(importParsed, { materials: D.materials, menus: D.menus }, D.products, uid);
    const newM = importParsed.materials.filter(m => !matByCode(m.code)).length, newH = importParsed.menus.filter(m => !D.menus.some(x => normCode(x.code) === m.code)).length;
    const lines = importParsed.menus.reduce((a, m) => a + m.items.length, 0);
    $('biPreview').innerHTML = `<ul class="bi-list"><li><b>${importParsed.materials.length}</b> bahan baku (${newM} baru, ${importParsed.materials.length - newM} diperbarui)</li>
      <li><b>${importParsed.menus.length}</b> menu (${newH} baru) dengan <b>${lines}</b> baris resep</li>
      <li>Terhubung ke produk kasir: <b>${mg.links.sku + mg.links.name}</b> menu (${mg.links.sku} lewat SKU, ${mg.links.name} lewat nama produk)</li></ul>
      ${mg.links.none.length ? `<details><summary>${mg.links.none.length} menu belum ada produknya di kasir</summary><p class="small">${mg.links.none.map(esc).join(', ')}</p></details>
        <label class="chk"><input type="checkbox" id="biMakeProducts"> Buat produk kasir untuk menu tersebut (SKU = kode menu, harga jual & modal dari file)</label>` : ''}
      ${importParsed.warnings.length ? `<details open><summary>${importParsed.warnings.length} peringatan</summary><ul class="small">${importParsed.warnings.slice(0, 30).map(w => `<li>${esc(w)}</li>`).join('')}</ul></details>` : ''}
      <p class="muted small">Bahan & menu dengan kode yang sama diperbarui (harga, satuan, resep diganti isi file). Catatan stok, belanja, dan transaksi tidak berubah.</p>`;
    $('biGo').disabled = false;
  } catch (err) {
    importParsed = null;
    $('biPreview').innerHTML = `<p class="warn-text">File tidak bisa dibaca: ${esc(err.message || err)}</p>`;
    $('biGo').disabled = true;
  }
}
/** Kategori produk baru (dari impor) ikut didaftarkan agar muncul di form & kelola kategori. */
let catCache = null;
async function ensureCategory(name) {
  name = String(name || '').trim();
  if (!name) return;
  catCache ||= await all('categories');
  const key = name.toLocaleLowerCase('id-ID');
  if (catCache.some(c => String(c.name || '').toLocaleLowerCase('id-ID') === key)) return;
  const c = { id: key, name, createdAt: Date.now(), updatedAt: Date.now() };
  await put('categories', c);
  catCache.push(c);
}
async function doImport() {
  catCache = null;
  if (!importParsed) return;
  $('biGo').disabled = true;
  try {
    await load();
    const mg = mergeImport(importParsed, { materials: D.materials, menus: D.menus }, D.products, uid);
    for (const m of mg.materials) await put('materials', m);
    let made = 0;
    if ($('biMakeProducts')?.checked) {
      for (const h of mg.menus) {
        if (productForMenu(h, D.products)) continue;
        const cost = Math.round(menuCost(h, mg.materials).perPortion);
        const p = { id: uid(), name: h.name, sku: h.code, category: h.category || 'Umum', price: n(h.price), costPrice: cost, stock: null, photo: '' };
        await put('products', p);
        D.products.push(p);
        await ensureCategory(p.category);
        h.productId = p.id;
        made++;
      }
    }
    for (const h of mg.menus) await put('hppMenus', h);
    $('bahanImportDialog').close();
    toast(`Impor selesai: ${mg.materials.length} bahan, ${mg.menus.length} menu` + (made ? `, ${made} produk baru` : ''));
    await refreshBoth();
    if (made) { await window.renderProducts?.(); await window.renderPOS?.(); }
  } catch (err) {
    toast('Impor gagal: ' + (err.message || err));
    $('biGo').disabled = false;
  }
}
async function exportExcel() {
  await load();
  const from = month + '-01', to = monthEnd(month), sum = stockSummary(D, from, to);
  const recipeRows = [];
  for (const m of D.menus) for (const l of costOf(m).lines) recipeRows.push([m.code, m.name, l.code, l.name, l.group, { n: l.qty }, l.unit, { n: l.qtyPortion }, { rp: l.unitCost }, { rp: l.cost }]);
  const sheets = [
    { name: 'Stok_Bahan', title: `Stok bahan baku ${month}`, widths: [9, 30, 10, 12, 12, 12, 12, 12, 16, 14], rows: [
      ['Kode', 'Bahan', 'Satuan', 'Awal', 'Belanja', 'Terpakai', 'Penyesuaian', 'Sisa', 'Status', 'Nilai sisa'].map(h => ({ h })),
      ...sum.map(s => [s.code, s.material.name, s.material.stockUnit || '', { n: s.open }, { n: s.buy }, { n: s.use }, { n: s.adjust }, { n: s.close }, STATUS_LABEL[s.status], { rp: s.value }]),
      [{ b: 'TOTAL' }, null, null, null, null, null, null, null, null, { brp: sum.reduce((a, s) => a + s.value, 0) }]] },
    { name: 'Bahan_Baku', widths: [10, 30, 10, 14, 10, 10, 14, 10, 10, 30], rows: [
      ['Kode Bahan', 'Nama Bahan', 'Satuan Beli', 'Harga Beli (per Satuan Beli)', 'Isi per Satuan Beli', 'Satuan Stok', 'Harga per Satuan Stok', 'Dilacak Stok?', 'Stok Minimum', 'Catatan'].map(h => ({ h })),
      ...D.materials.map(m => [m.code, m.name, m.buyUnit || '', { rp: m.buyPrice }, { n: m.perBuy }, m.stockUnit || '', { n: unitCost(m) }, m.tracked === false ? 'Tidak' : 'Ya', m.minStock ? { n: m.minStock } : null, m.note || ''])] },
    { name: 'Menu', widths: [10, 28, 18, 10, 14, 10, 14, 14, 10, 28], rows: [
      ['Kode Menu', 'Nama Menu', 'Kategori', 'Satuan Jual', 'Harga Jual', 'Porsi per Batch', 'HPP per Porsi', 'Laba per Porsi', 'HPP % Harga Jual', 'Status'].map(h => ({ h })),
      ...D.menus.map(m => { const c = costOf(m); return [m.code, m.name, m.category || '', m.sellUnit || '', { rp: menuPrice(m) }, { n: m.batch }, { rp: c.perPortion }, { rp: c.profit }, c.pct === null ? null : { pct: c.pct }, menuStatus(c)]; })] },
    { name: 'Resep', widths: [10, 24, 10, 26, 18, 12, 10, 12, 14, 14], rows: [
      ['Kode Menu', 'Nama Menu', 'Kode Bahan', 'Nama Bahan', 'Kelompok', 'Qty per Batch (satuan stok)', 'Satuan Stok', 'Qty per Porsi', 'Harga per Satuan Stok', 'Biaya per Porsi'].map(h => ({ h })),
      ...recipeRows] }
  ];
  await window.download?.(buildXlsx(sheets), `stok-bahan-hpp-${month}.xlsx`);
}

// =====================================================================
// KAITAN KE PENGELUARAN (belanja bahan) & KONTROL PERSEDIAAN
// =====================================================================
function expenseGroupOf(type) { return (D.settings.expenseGroups || {})[type] || defaultExpenseGroup(type); }

/** Dipanggil app.js saat dialog pengeluaran dibuka/jenis diganti. */
async function fillExpenseForm(exp) {
  await load();
  // Dropdown kode bahan: diambil langsung dari daftar Stok Bahan Baku, dikelompokkan per kategori.
  const groups = new Map();
  for (const m of [...D.materials].sort((a, b) => String(a.code).localeCompare(String(b.code), 'id', { numeric: true }))) {
    const g = m.category || 'Lainnya';
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g).push(m);
  }
  const cur = normCode(exp?.materialCode || '');
  const orphan = cur && !matByCode(cur) ? `<option value="${esc(cur)}">${esc(cur)} · (tidak terdaftar lagi)</option>` : '';
  $('eMaterial').innerHTML = '<option value="">— Bukan bahan dari Stok Bahan Baku —</option>' + orphan +
    (() => {
      const opt = m => `<option value="${esc(m.code)}">${esc(m.code)} · ${esc(m.name)}${m.buyUnit ? ' (' + esc(m.buyUnit) + ')' : ''}</option>`;
      return groups.size > 1 ? [...groups].map(([g, list]) => `<optgroup label="${esc(g)}">${list.map(opt).join('')}</optgroup>`).join('') : [...groups.values()].flat().map(opt).join('');
    })();
  $('eMaterial').value = cur;
  lastPicked = cur;
  $('eMaterialPrice').checked = true;
  toggleExpenseMaterial(exp);
  materialInfo();
}
function toggleExpenseMaterial(exp) {
  // Muncul untuk jenis yang masuk HPP di Pembukuan (bahan & operasional, mis. gas/arang/kemasan).
  const g = expenseGroupOf($('eType').value);
  const show = D.materials.length && (g === 'bahan' || g === 'operasional' || (exp && exp.materialCode) || $('eMaterial').value);
  $('eMaterialWrap').hidden = !show;
}
function materialInfo() {
  const code = normCode($('eMaterial').value), m = matByCode(code);
  if (!code) { $('eMaterialInfo').textContent = 'Pilih bahan agar belanja ini otomatis menambah Stok Bahan Baku.'; return; }
  if (!m) { $('eMaterialInfo').innerHTML = '<span class="warn-text">Kode bahan tidak dikenal</span>'; return; }
  const s = stockSummary(D, '0000-01-01', localToday()).find(x => x.code === code);
  const inv = invItemForMaterial(m, D.invItems);
  $('eMaterialInfo').innerHTML = `${esc(m.name)} · 1 ${esc(m.buyUnit || 'satuan')} = ${num(m.perBuy)} ${esc(m.stockUnit || '')}` +
    (m.tracked === false ? ' · tidak dilacak stoknya' : ` · stok sekarang ${num(s?.close)} ${esc(m.stockUnit || '')}`) + (inv ? ` · juga masuk ke Persediaan (“${esc(inv.name)}”)` : '');
}
let lastPicked = '';
function onMaterialPicked() {
  const code = normCode($('eMaterial').value), m = matByCode(code);
  const changed = code !== lastPicked;
  lastPicked = code;
  materialInfo();
  if (!m) return;
  const sel = $('eName');
  if (![...sel.options].some(o => o.value === m.name)) sel.insertAdjacentHTML('afterbegin', `<option value="${esc(m.name)}">${esc(m.name)}</option>`);
  sel.value = m.name;
  $('eUnit').value = m.buyUnit || '';
  // Ganti bahan -> harga satuan ikut harga beli bahan tersebut (masih bisa diubah sesuai nota).
  if ((changed || !Number($('eUnitPrice').value)) && n(m.buyPrice)) {
    $('eUnitPrice').value = m.buyPrice;
    $('eAmount').value = Math.round((Number($('eQty').value) || 1) * n(m.buyPrice) * 100) / 100;
  }
}
/** Memilih Item yang namanya sama dengan bahan berkode -> kode bahan terpilih otomatis. */
function onExpenseItemPicked() {
  if ($('eMaterialWrap').hidden || $('eMaterial').value) return;
  const name = String($('eName').value || '').trim().toLowerCase();
  const m = name && D.materials.find(x => String(x.name || '').trim().toLowerCase() === name);
  if (m) { $('eMaterial').value = m.code; onMaterialPicked(); }
}
/** Kode bahan untuk disimpan; false = batalkan simpan. */
function collectExpenseMaterial() {
  if ($('eMaterialWrap').hidden) return '';
  const code = normCode($('eMaterial').value);
  if (code && !matByCode(code)) { toast('Kode bahan ' + code + ' tidak terdaftar di Stok Bahan Baku'); return false; }
  return code;
}
/** Setelah pengeluaran disimpan: perbarui harga beli bahan & catatan Persediaan. */
async function afterExpenseSaved(exp) {
  await load();
  const m = matByCode(exp.materialCode);
  if (m && $('eMaterialPrice').checked && n(exp.unitPrice) > 0 && n(exp.unitPrice) !== n(m.buyPrice) && String(exp.date) >= String(m.priceDate || '')) {
    await put('materials', { ...m, buyPrice: n(exp.unitPrice), priceDate: exp.date, updatedAt: Date.now() });
  }
  await syncInvFromExpenses();
  refreshBoth();
}
async function afterExpenseDeleted() { await load(); await syncInvFromExpenses(); refreshBoth(); }

/**
 * Belanja bahan yang dipantau di Kontrol Persediaan -> catatan "Bahan masuk" (id 'exp-<idPengeluaran>').
 * Idempoten: membuat yang kurang, membetulkan yang berubah, menghapus yang pengeluarannya sudah tidak ada.
 */
async function syncInvFromExpenses({ quiet = false } = {}) {
  // Butuh data lengkap: perangkat tanpa akses bahan/pengeluaran tidak boleh menghapus catatan otomatis.
  const P = window.kasirPerms?.perms?.();
  if (P && !['materials', 'expenses', 'materialEntries', 'invItems', 'invEntries'].every(st => P.canRead(st))) return false;
  const want = invEntriesFromExpenses(D.expenses, D.materials, D.invItems, D.entries);
  let changed = false;
  for (const e of D.invEntries.filter(e => AUTO_INV_SOURCES.has(e.source))) {
    if (!want.has(e.id)) { await del('invEntries', e.id); changed = true; }
  }
  for (const [id, w] of want) {
    const cur = D.invEntries.find(e => e.id === id);
    if (cur && cur.itemId === w.itemId && n(cur.qty) === w.qty && cur.date === w.date && cur.kind === 'masuk' && cur.area === 'dapur' && cur.note === w.note && cur.source === w.source) continue;
    await put('invEntries', { ...(cur || {}), ...w, createdAt: cur?.createdAt || Date.now() });
    changed = true;
  }
  if (changed) { D.invEntries = await all('invEntries'); if (!quiet) window.renderInventory?.(); }
  return changed;
}
let syncing = null;
/** Dipanggil Kontrol Persediaan sebelum menampilkan data (satu proses dalam satu waktu). */
async function syncInvNow(opts) {
  if (syncing) return syncing;
  syncing = (async () => { try { await load(); return await syncInvFromExpenses(opts); } catch (e) { console.warn('Sinkron bahan masuk gagal', e); return false; } finally { syncing = null; } })();
  return syncing;
}

// =====================================================================
async function refreshBoth() {
  if ($('bahan')?.classList.contains('active')) await renderBahan();
  if ($('hpp')?.classList.contains('active')) await renderHpp();
}

function bind() {
  if (!$('bahan')) return;
  $('bahanMonth').value = month;
  $('bahanMonth').onchange = () => { month = $('bahanMonth').value || month; renderBahan(); };
  $('bahanThisMonth').onclick = () => { month = localToday().slice(0, 7); $('bahanMonth').value = month; renderBahan(); };
  $('bahanSearch').oninput = () => { search = $('bahanSearch').value; renderBahan(); };
  $('bahanStatus').onchange = () => { statusFilter = $('bahanStatus').value; renderBahan(); };
  $('bahanAdd').onclick = () => editMaterial();
  $('bahanEntry').onclick = () => openEntry();
  $('bahanImport').onclick = openImport;
  $('bahanExport').onclick = exportExcel;
  $('hppAdd').onclick = () => editMenu();
  $('hppImport').onclick = openImport;
  $('hppExport').onclick = exportExcel;
  $('hppApplyCost').onclick = applyAllCost;
  $('hppSearch').oninput = () => { hppSearch = $('hppSearch').value; renderHpp(); };
  $('meForm').onsubmit = saveEntry;
  $('meMaterial').onchange = entryHint;
  $('meKind').onchange = entryHint;
  $('meDate').onchange = entryHint;
  $('mcMaterial').onchange = renderCard;
  $('mcMonth').onchange = renderCard;
  $('mmForm').onsubmit = saveMaterial;
  ['mmBuyPrice', 'mmPerBuy', 'mmStockUnit', 'mmCode'].forEach(id => $(id).addEventListener('input', materialHint));
  $('mmDelete').onclick = deleteMaterial;
  $('hmForm').onsubmit = saveMenu;
  ['hmBatch', 'hmPrice', 'hmCode'].forEach(id => $(id).addEventListener('input', renderRecipe));
  $('hmProduct').onchange = renderRecipe;
  $('hmAddLine').onclick = () => { editingItems.push({ code: '', group: editingItems[editingItems.length - 1]?.group || 'Bahan Utama', qty: '' }); renderRecipe(); };
  $('hmDelete').onclick = deleteMenu;
  $('biFile').onchange = previewImport;
  $('biGo').onclick = doImport;
  $('eMaterial').addEventListener('change', onMaterialPicked);
  $('eName').addEventListener('change', onExpenseItemPicked);
  $('eType').addEventListener('change', () => toggleExpenseMaterial());
}

window.bahanUi = { openEntry, openCard, deleteEntry, editMaterial, editMenu, openImport };
window.bahanExpense = { fill: fillExpenseForm, collect: collectExpenseMaterial, afterSave: afterExpenseSaved, afterDelete: afterExpenseDeleted };
window.renderBahan = renderBahan;
window.bahanSyncInv = syncInvNow;
window.renderHpp = renderHpp;
window.bahanRefresh = refreshBoth;
bind();
