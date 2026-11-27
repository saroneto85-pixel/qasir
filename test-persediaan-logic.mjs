// Uji kesetaraan: logika aplikasi harus menghasilkan angka yang sama dengan Dashboard Excel "Kontrol_Stok_revisi.xlsx".
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { summarize, balanceAt, firstMinus, monthRange, kindsFor } from './persediaan-logic.js';

const fx = JSON.parse(fs.readFileSync(new URL('./test-fixtures/kontrol-stok-parity.json', import.meta.url)));
const { from, to } = monthRange(fx.month);
let id = 0, fail = 0, ok = 0;
const mk = (itemId, list) => list.map(e => ({ ...e, itemId, id: 'e' + ++id, createdAt: id }));
const eq = (label, got, want) => { const g = Math.round(got * 100) / 100, w = Math.round(want * 100) / 100; if (g === w) ok++; else { fail++; console.log('  ✗', label, 'aplikasi =', g, '| Excel =', w); } };

for (const c of fx.cards) {
  const item = { id: c.name, name: c.name, hasDepan: c.hasDepan };
  const r = summarize(item, mk(item.id, c.entries), from, to, 2), x = c.expect;
  console.log(`• ${c.name}`);
  eq('stok awal', r.awal, x.awal); eq('masuk', r.dMasuk, x.masuk); eq('terjual/dipakai', r.used, x.terjual);
  eq('rusak dapur', r.dRusak, x.rusakD); if (c.hasDepan) eq('rusak depan', r.fRusak, x.rusakF);
  eq('sisa dapur', r.dSisa, x.sisaD); if (c.hasDepan) eq('sisa depan', r.fSisa, x.sisaF);
  eq('total sisa', r.total, x.total); eq('selisih kroscek', r.selisih, 0);
  assert.equal(r.kroscek, 'OK', c.name + ' kroscek');
}

// Dencis: 4 item (segar, goreng, sambal, bakar)
const d = fx.dencis, ex = d.expect;
const S = { id: 'segar', hasDepan: false }, G = { id: 'goreng', hasDepan: false }, SA = { id: 'sambal', hasDepan: true }, B = { id: 'bakar', hasDepan: true };
const rs = summarize(S, mk('segar', d.segar), from, to), rg = summarize(G, mk('goreng', d.goreng), from, to);
const rsa = summarize(SA, mk('sambal', d.sambal), from, to), rb = summarize(B, mk('bakar', d.bakar), from, to);
console.log('• Dencis (segar → goreng → sambal / bakar)');
eq('sisa ikan segar', rs.dSisa, ex.sisaSegar); eq('sisa ikan goreng', rg.dSisa, ex.sisaGoreng);
eq('sisa sambal depan', rsa.fSisa, ex.sisaSambal); eq('sisa bakar depan', rb.fSisa, ex.sisaBakar);
eq('terjual sambal', rsa.fJual, ex.jualSambal); eq('terjual bakar', rb.fJual, ex.jualBakar);
eq('rusak sambal', rsa.fRusak, ex.rusakSambal); eq('rusak bakar', rb.fRusak, ex.rusakBakar);
for (const r of [rs, rg, rsa, rb]) assert.equal(r.kroscek, 'OK');

// Perilaku tambahan
const it = { id: 'x', hasDepan: true };
const ev = [
  { id: 'a', itemId: 'x', area: 'dapur', kind: 'masuk', qty: 10, date: '2026-11-01', createdAt: 1 },
  { id: 'b', itemId: 'x', area: 'dapur', kind: 'naik', qty: 6, date: '2026-11-01', createdAt: 2 },
  { id: 'c', itemId: 'x', area: 'depan', kind: 'jual', qty: 4, date: '2026-11-01', createdAt: 3 },
];
assert.deepEqual(balanceAt(it, ev, '2026-11-01'), { dapur: 4, depan: 2 }, 'naik: dapur berkurang, depan bertambah; sisa sore jadi stok awal besok');
assert.equal(firstMinus(it, ev), null);
assert.equal(firstMinus(it, [...ev, { id: 'd', itemId: 'x', area: 'depan', kind: 'jual', qty: 5, date: '2026-11-02', createdAt: 4 }]), '2026-11-02', 'jual melebihi stok depan terdeteksi minus');
ok += 3;

console.log(`\n${ok} pemeriksaan cocok dengan Excel${fail ? `, ${fail} BERBEDA` : ''}`);
// --- satu item terhubung ke beberapa produk (rendang: nasi bungkus, paket, topping)
{
  const { itemLinks, posSalesForItem } = await import('./persediaan-logic.js');
  const prods = [{ id: 'a', sku: 'NBR-01', name: 'Nasi bungkus rendang' }, { id: 'b', sku: 'PKR-01', name: 'Paket rendang' }, { id: 'c', sku: 'TPR-01', name: 'Topping rendang' }, { id: 'd', sku: 'EST-01', name: 'Es teh' }];
  const item = { id: 'r', name: 'Rendang', sku: 'NBR-01', links: [{ productId: 'a', mult: 1 }, { productId: 'b', mult: 2 }, { productId: 'c', mult: 1 }] };
  const tx = [{ date: '2026-11-25', items: [{ productId: 'a', sku: 'NBR-01', qty: 3 }, { productId: 'b', sku: 'PKR-01', qty: 2 }, { productId: 'c', sku: 'TPR-01', qty: 4 }, { productId: 'd', sku: 'EST-01', qty: 9 }] }, { date: '2026-11-24', items: [{ productId: 'a', qty: 50 }] }];
  const eq = (a, b, m) => { if (a !== b) { console.error('GAGAL', m, a, b); process.exit(1); } };
  eq(itemLinks(item, prods).length, 3, 'SKU item = produk a tidak boleh ganda');
  eq(posSalesForItem(tx, prods, item, '2026-11-25'), 3 + 2 * 2 + 4, '3 produk terhubung (paket x2), es teh tidak ikut');
  eq(posSalesForItem(tx, prods, item, '2026-11-24'), 50, 'tanggal lain terpisah');
  eq(posSalesForItem([{ date: '2026-11-25', items: [{ productId: 'b', sku: 'LAMA', qty: 1 }] }], [{ id: 'b', sku: 'PKR-02' }], { links: [{ productId: 'b', mult: 2 }] }, '2026-11-25'), 2, 'SKU produk diganti: tetap cocok lewat productId');
  eq(posSalesForItem(tx, prods, { id: 'x', productId: 'd' }, '2026-11-25'), 9, 'data lama (productId tunggal) tetap terbaca');
  eq(posSalesForItem(tx, prods, { id: 'y', name: 'Tanpa tautan' }, '2026-11-25'), 0, 'tanpa tautan = 0');
  console.log('✓ item terhubung ke banyak produk: 6 pemeriksaan');
}
{
  // 2.12: bahan masuk tidak diketik manual untuk item terhubung kode bahan / menu (lewat Olah jadi menu)
  const k = (it, a, l) => kindsFor(it, a, l).join(',');
  const okK = (c, m) => { if (!c) { fail++; console.log('GAGAL:', m); } };
  okK(k({ hasDepan: true }, 'dapur', false) === 'naik,rusak,awal', 'menu: tanpa bahan masuk manual');
  okK(k({ hasDepan: false }, 'dapur', true) === 'pakai,rusak,awal', 'bahan terhubung: tanpa bahan masuk manual');
  okK(k({ hasDepan: false }, 'dapur', false) === 'masuk,pakai,rusak,awal', 'bahan belum terhubung: masih boleh manual');
  okK(k({ hasDepan: true }, 'depan', false) === 'rusak,awal', 'depan tetap');
  console.log('✓ jenis catatan manual 2.12: 4 pemeriksaan');
}
process.exit(fail ? 1 : 0);
