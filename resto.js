// Modul rumah makan: meja, pesanan terbuka, tiket dapur, bayar belakangan.
// Memakai database & PIN dari app.js; transaksi akhir disimpan ke store 'transactions'
// sehingga dashboard, laporan, struk, dan printer berjalan tanpa perubahan.
import { initDatabase, all, put, del } from './db.js';
import { STATUS, NEXT, ACTION, lineTotal, orderSubtotal, orderQty, addItem, pendingItems, makeTicket, changeQty, needsPinToReduce, minutesSince, hasActiveTickets, payable, missingTableNames } from './resto-logic.js';

const $ = id => document.getElementById(id);
const rupiah = n => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(Number(n) || 0);
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const today = () => new Date().toISOString().slice(0, 10);
const toast = s => window.toast?.(s);
const pin = reason => window.requirePin ? window.requirePin(reason) : Promise.resolve(false);

let current = null, menu = [], saving = Promise.resolve();

// Simpan berurutan; pesanan kosong yang belum pernah dikirim tidak disimpan.
function persist() {
  const o = current;
  if (!o) return saving;
  saving = saving.then(async () => {
    if (!o.items.length && !(o.tickets || []).length) await del('orders', o.id);
    else await put('orders', o);
  }).catch(e => toast('Gagal menyimpan pesanan: ' + e.message));
  return saving;
}

// ---------- Meja ----------
async function renderTables() {
  if (!$('tableGrid')) return;
  const [tables, orders] = await Promise.all([all('tables'), all('orders')]);
  const open = orders.filter(o => o.status === 'open');
  const byTable = new Map(open.filter(o => o.tableId).map(o => [o.tableId, o]));
  tables.sort((a, b) => a.name.localeCompare(b.name, 'id', { numeric: true }));
  $('tableGrid').innerHTML = tables.map(t => {
    const o = byTable.get(t.id);
    const sub = o ? `${orderQty(o)} item · ${rupiah(orderSubtotal(o))}${pendingItems(o).length ? ' · belum dikirim' : ''}` : 'Kosong';
    return `<div class="table-card ${o ? 'busy' : ''}" role="button" tabindex="0" onclick="restoOpenTable('${t.id}')"><b>${esc(t.name)}</b><small>${sub}</small>${o ? '' : `<span class="table-del" title="Hapus meja" onclick="event.stopPropagation();restoDeleteTable('${t.id}')">×</span>`}</div>`;
  }).join('') || '<div class="empty">Belum ada meja. Tekan “Tambah meja”.</div>';
  const others = open.filter(o => !o.tableId).sort((a, b) => a.createdAt - b.createdAt);
  $('openOrders').innerHTML = others.map(o => `<div class="table-card busy" role="button" tabindex="0" onclick="restoOpenOrder('${o.id}')"><b>${esc(o.label)}</b><small>${esc(o.type)}${o.customer ? ' · ' + esc(o.customer) : ''}<br>${orderQty(o)} item · ${rupiah(orderSubtotal(o))}</small></div>`).join('') || '<div class="empty">Tidak ada pesanan Take Away / Delivery yang berjalan.</div>';
  $('tableStat').textContent = `${byTable.size} / ${tables.length} meja terisi`;
}

$('addTable').onclick = async () => {
  const v = (prompt('Nama meja, atau jumlah meja (mis. 10 untuk Meja 1–10):') || '').trim();
  if (!v) return;
  const tables = await all('tables');
  let names;
  if (/^\d+$/.test(v)) { const n = Number(v); if (n < 1 || n > 100) return toast('Jumlah meja 1–100'); names = missingTableNames(tables, n); }
  else if (tables.some(t => t.name.toLowerCase() === v.toLowerCase())) return toast('Nama meja sudah ada');
  else names = [v.slice(0, 30)];
  for (const name of names) await put('tables', { id: uid(), name });
  await renderTables();
  toast(names.length ? `${names.length} meja ditambahkan` : 'Semua meja sudah ada');
};

async function deleteTable(id) {
  if (!await pin('menghapus meja')) return;
  const busy = (await all('orders')).some(o => o.status === 'open' && o.tableId === id);
  if (busy) return toast('Meja masih punya pesanan terbuka');
  if (confirm('Hapus meja ini?')) { await del('tables', id); await renderTables(); }
}

// ---------- Pesanan ----------
async function openTable(id) {
  const t = (await all('tables')).find(x => x.id === id);
  if (!t) return;
  const old = (await all('orders')).find(o => o.status === 'open' && o.tableId === id);
  showOrder(old || { id: uid(), tableId: t.id, tableName: t.name, label: t.name, type: 'Dine In', items: [], tickets: [], status: 'open', createdAt: Date.now(), date: today(), customer: '' });
}
async function openOrder(id) {
  const o = (await all('orders')).find(x => x.id === id);
  if (o) showOrder(o);
}
async function newOrder(type) {
  const prefix = type === 'Take Away' ? 'TA' : 'DLV';
  const n = (await all('orders')).filter(o => o.date === today() && o.type === type).length + 1;
  showOrder({ id: uid(), tableId: '', tableName: '', label: `${prefix}-${String(n).padStart(2, '0')}`, type, items: [], tickets: [], status: 'open', createdAt: Date.now(), date: today(), customer: '' });
}
$('newTakeAway').onclick = () => newOrder('Take Away');
$('newDelivery').onclick = () => newOrder('Delivery');

async function showOrder(o) {
  current = o;
  menu = await all('products');
  const cats = [...new Set(menu.map(p => p.category || 'Umum'))].sort();
  $('orderCategory').innerHTML = '<option value="">Semua kategori</option>' + cats.map(c => `<option>${esc(c)}</option>`).join('');
  $('orderSearch').value = '';
  $('orderTitle').textContent = `${o.label} · ${o.type}`;
  $('orderCustomer').value = o.customer || '';
  $('orderDiscount').value = o.discount || 0;
  $('orderPayment').value = 'Tunai';
  $('orderPaid').value = '';
  drawMenu(); drawLines();
  if (!$('orderDialog').open) $('orderDialog').showModal();
}

function drawMenu() {
  const q = $('orderSearch').value.toLowerCase(), c = $('orderCategory').value;
  $('orderMenu').innerHTML = menu.filter(p => (p.name + ' ' + (p.sku || '')).toLowerCase().includes(q) && (!c || (p.category || 'Umum') === c))
    .map(p => `<button type="button" class="product-card" onclick="restoAdd('${p.id}')">${p.photo ? `<img src="${p.photo}" alt="">` : ''}<b>${esc(p.name)}</b><small>${esc(p.category || 'Umum')}</small><span>${rupiah(p.price)}</span></button>`).join('')
    || '<div class="empty">Belum ada menu. Tambahkan di Kelola Produk.</div>';
}

function drawLines() {
  const o = current;
  $('orderLines').innerHTML = o.items.length ? o.items.map((l, i) => `<div class="cart-row"><div><b>${esc(l.name)}</b>${l.note ? `<small class="item-note">📝 ${esc(l.note)}</small>` : ''}<small>${rupiah(l.price)} × ${l.qty} = ${rupiah(lineTotal(l))}${l.sentQty ? ` · <span class="sent">✔ ${l.sentQty} terkirim</span>` : ''}</small><button type="button" class="link" onclick="restoNote(${i})">${l.note ? 'Ubah catatan' : '+ Catatan'}</button></div><div class="qty"><button type="button" onclick="restoQty(${i},-1)">−</button><b>${l.qty}</b><button type="button" onclick="restoQty(${i},1)">＋</button></div></div>`).join('')
    : '<div class="empty">Ketuk menu untuk menambah pesanan.</div>';
  const p = payable(o, $('orderDiscount').value);
  const sub = orderSubtotal(o), total = p ? p.total : sub;
  const pend = pendingItems(o).reduce((a, x) => a + x.qty, 0);
  $('orderSub').textContent = rupiah(sub);
  $('orderTotal').textContent = rupiah(total);
  $('orderChange').textContent = rupiah(Math.max(0, (Number($('orderPaid').value) || 0) - total));
  $('orderCashBox').hidden = $('orderPayment').value === 'Tempo / Kasbon';
  $('sendKitchen').textContent = pend ? `🍳 Kirim ke dapur (${pend})` : '🍳 Kirim ke dapur';
  $('sendKitchen').disabled = !pend;
}

function mutate() { current.customer = $('orderCustomer').value.trim(); current.discount = Math.max(0, Number($('orderDiscount').value) || 0); persist(); drawLines(); }
async function add(id) { const p = menu.find(x => x.id === id); if (!p || !current) return; addItem(current, p); mutate(); }
async function qty(i, n) {
  if (n < 0 && needsPinToReduce(current, i) && !await pin('membatalkan item yang sudah dikirim ke dapur')) return;
  changeQty(current, i, n); mutate();
}
function note(i) {
  const l = current.items[i]; if (!l) return;
  const v = prompt('Catatan untuk dapur (mis. tidak pedas, tanpa bawang):', l.note || '');
  if (v === null) return;
  l.note = v.trim().slice(0, 80); mutate();
}

$('orderSearch').oninput = drawMenu; $('orderCategory').onchange = drawMenu;
['orderDiscount', 'orderPaid', 'orderCustomer'].forEach(id => $(id).oninput = mutate);
$('orderPayment').onchange = drawLines;
$('orderDialog').addEventListener('close', async () => { await persist(); current = null; renderTables(); renderKitchen(); });

function sendToKitchen() {
  const t = makeTicket(current, Date.now(), uid());
  if (!t) return toast('Tidak ada pesanan baru untuk dikirim');
  persist(); drawLines(); renderKitchen(); toast('Dikirim ke dapur');
}
$('sendKitchen').onclick = sendToKitchen;
$('saveOrder').onclick = () => $('orderDialog').close();

$('payOrder').onclick = async () => {
  const o = current;
  if (!o.items.length) return toast('Pesanan masih kosong');
  const p = payable(o, $('orderDiscount').value);
  if (!p) return toast('Diskon tidak boleh melebihi subtotal');
  const payment = $('orderPayment').value, kasbon = payment === 'Tempo / Kasbon', paid = kasbon ? 0 : Number($('orderPaid').value) || 0;
  if (!kasbon && paid < p.total) return toast('Uang diterima belum mencukupi');
  if (pendingItems(o).length && confirm('Ada item yang belum dikirim ke dapur. Kirim sekarang?')) makeTicket(o, Date.now(), uid());
  const tx = {
    id: uid(), invoice: 'INV-' + Date.now().toString().slice(-8), createdAt: Date.now(), date: today(), time: new Date().toLocaleTimeString('id-ID'),
    items: o.items.map(({ productId, name, price, costPrice, sku, qty, category }) => ({ productId, name, price, costPrice, sku, qty, category })),
    subtotal: p.sub, discount: p.discount, total: p.total, type: o.type, payment, paid, change: Math.max(0, paid - p.total),
    customer: o.customer || '', note: o.label + (o.items.some(i => i.note) ? ' · ' + o.items.filter(i => i.note).map(i => `${i.name}: ${i.note}`).join('; ') : ''),
    cashier: $('cashier')?.value.trim() || 'Pemilik', table: o.tableName || '', orderId: o.id
  };
  await put('transactions', tx);
  Object.assign(o, { status: 'paid', paidAt: Date.now(), txId: tx.id });
  await persist();
  $('orderDialog').close();
  await window.refreshAll?.();
  toast('Pembayaran tersimpan: ' + tx.invoice);
  window.showDetail?.(tx.id);
};

$('voidOrder').onclick = async () => {
  const o = current;
  if (!o.items.length && !(o.tickets || []).length) return $('orderDialog').close();
  if ((o.tickets || []).length && !await pin('membatalkan pesanan yang sudah dikirim ke dapur')) return;
  if (!confirm(`Batalkan pesanan ${o.label}?`)) return;
  o.status = 'void'; o.voidedAt = Date.now();
  await persist(); $('orderDialog').close(); toast('Pesanan dibatalkan');
};

// ---------- Dapur ----------
async function renderKitchen() {
  if (!$('kBaru')) return;
  const orders = (await all('orders')).filter(o => o.status !== 'void');
  const tickets = orders.flatMap(o => (o.tickets || []).filter(t => t.status !== 'saji').map(t => ({ o, t }))).sort((a, b) => a.t.at - b.t.at);
  for (const [status, el] of [['baru', 'kBaru'], ['proses', 'kProses'], ['siap', 'kSiap']]) {
    const list = tickets.filter(x => x.t.status === status);
    $(el).innerHTML = list.map(({ o, t }) => {
      const m = minutesSince(t.at);
      return `<article class="ticket ${m >= 15 && status !== 'siap' ? 'late' : ''}"><header><b>${esc(o.label)}</b><small>${esc(o.type)} · ${m} mnt</small></header><ul>${t.items.map(i => `<li><b>${i.qty}×</b> ${esc(i.name)}${i.note ? `<small class="item-note">📝 ${esc(i.note)}</small>` : ''}</li>`).join('')}</ul><button class="btn full" onclick="restoAdvance('${o.id}','${t.id}')">${ACTION[status]}</button></article>`;
    }).join('') || '<div class="empty">—</div>';
    $(el).previousElementSibling.textContent = `${STATUS[status]} (${list.length})`;
  }
}
async function advance(orderId, ticketId) {
  const o = (await all('orders')).find(x => x.id === orderId), t = o?.tickets?.find(x => x.id === ticketId);
  if (!t || !NEXT[t.status]) return;
  t.status = NEXT[t.status];
  await put('orders', o);
  await renderKitchen(); await renderTables();
}
$('refreshKitchen').onclick = renderKitchen;
setInterval(() => { if ($('kitchen')?.classList.contains('active')) renderKitchen(); }, 15000);

Object.assign(window, { restoOpenTable: openTable, restoOpenOrder: openOrder, restoDeleteTable: deleteTable, restoAdd: add, restoQty: qty, restoNote: note, restoAdvance: advance, restoRender: renderTables, restoRenderKitchen: renderKitchen });
initDatabase().then(() => { renderTables(); renderKitchen(); }).catch(() => {});
