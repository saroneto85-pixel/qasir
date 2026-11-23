// Logika murni alur rumah makan (tanpa DOM/database) agar mudah diuji.
export const STATUS = { baru: 'Baru', proses: 'Diproses', siap: 'Siap', saji: 'Disajikan' };
export const NEXT = { baru: 'proses', proses: 'siap', siap: 'saji' };
export const ACTION = { baru: 'Mulai masak', proses: 'Tandai siap', siap: 'Sudah disajikan' };

export const lineTotal = i => (Number(i.price) || 0) * (Number(i.qty) || 0);
export const orderSubtotal = o => o.items.reduce((a, i) => a + lineTotal(i), 0);
export const orderQty = o => o.items.reduce((a, i) => a + (Number(i.qty) || 0), 0);

// Item yang sama (produk + catatan sama) digabung; catatan berbeda jadi baris terpisah.
export function addItem(order, p, note = '') {
  const line = order.items.find(i => i.productId === p.id && (i.note || '') === note);
  if (line) line.qty++;
  else order.items.push({ productId: p.id, name: p.name, price: Number(p.price) || 0, costPrice: Number(p.costPrice) || 0, sku: p.sku || '', category: p.category || 'Umum', qty: 1, sentQty: 0, note });
}

// Item yang belum dikirim ke dapur (qty > sentQty).
export const pendingItems = o => o.items.filter(i => i.qty > (i.sentQty || 0)).map(i => ({ name: i.name, qty: i.qty - (i.sentQty || 0), note: i.note || '' }));

// Membuat tiket dapur dari item baru, lalu menandai item tersebut sudah terkirim.
export function makeTicket(order, now = Date.now(), id = now.toString(36)) {
  const items = pendingItems(order);
  if (!items.length) return null;
  const ticket = { id, at: now, status: 'baru', items };
  (order.tickets ||= []).push(ticket);
  order.items.forEach(i => { i.sentQty = i.qty; });
  return ticket;
}

// Kurangi/tambah qty. Mengembalikan false bila baris dihapus.
export function changeQty(order, idx, n) {
  const l = order.items[idx];
  if (!l) return true;
  l.qty += n;
  if (l.qty <= 0) { order.items.splice(idx, 1); return false; }
  l.sentQty = Math.min(l.sentQty || 0, l.qty);
  return true;
}

// Mengurangi qty di bawah jumlah yang sudah dikirim ke dapur butuh otorisasi PIN.
export const needsPinToReduce = (order, idx) => { const l = order.items[idx]; return !!l && l.qty - 1 < (l.sentQty || 0); };

export const minutesSince = (t, now = Date.now()) => Math.max(0, Math.floor((now - t) / 60000));
export const hasActiveTickets = o => (o.tickets || []).some(t => t.status !== 'saji');

// Total yang harus dibayar; null bila diskon tidak valid.
export function payable(order, discount) {
  const sub = orderSubtotal(order), d = Math.max(0, Number(discount) || 0);
  return d > sub ? null : { sub, discount: d, total: sub - d };
}

// Nama otomatis meja: "Meja 1".."Meja N" yang belum ada.
export function missingTableNames(existing, count) {
  const have = new Set(existing.map(t => t.name.toLowerCase()));
  const out = [];
  for (let i = 1; i <= count; i++) if (!have.has(`meja ${i}`)) out.push(`Meja ${i}`);
  return out;
}
