// Uji Stok Bahan Baku & HPP Menu. Jalankan: node test-bahan-logic.mjs
import { readFileSync } from 'node:fs';
import { readXlsx } from './xlsx-read.js';
import { parseHppWorkbook, mergeImport, menuCost, menuStatus, unitCost, stockSummary, movements, runBalance, productionMenus, invItemForMaterial, normCode, invQtyFromExpense, invEntriesFromExpenses } from './bahan-logic.js';

let pass = 0, fail = 0;
const ok = (c, name) => { if (c) pass++; else { fail++; console.log('GAGAL:', name); } };
const near = (a, b, name, eps = 1e-6) => { const c = Math.abs(a - b) <= eps * Math.max(1, Math.abs(b)); if (!c) console.log('  diperoleh', a, 'diharapkan', b); ok(c, name); };
const eq = (a, b, name) => { const c = JSON.stringify(a) === JSON.stringify(b); if (!c) console.log('  diperoleh', JSON.stringify(a), '\n  diharapkan', JSON.stringify(b)); ok(c, name); };

// ---------- 1) Impor file Excel pengguna & HPP harus sama dengan Excel ----------
const book = await readXlsx(readFileSync(new URL('./test-fixtures/format-hpp.xlsx', import.meta.url)));
const parsed = parseHppWorkbook(book);
eq(parsed.materials.length, 140, 'impor: 140 bahan');
eq(parsed.menus.length, 28, 'impor: 28 menu');
eq(parsed.menus.reduce((a, m) => a + m.items.length, 0), 431, 'impor: 431 baris resep');
const b1 = parsed.materials.find(m => m.code === 'B001');
eq([b1.name, b1.buyUnit, b1.buyPrice, b1.perBuy, b1.stockUnit, b1.tracked], ['Adonan', 'kg', 75000, 1000, 'g', true], 'impor: B001 Adonan kg 75.000 isi 1000 g');
eq(parsed.materials.find(m => m.code === 'B002').tracked, false, 'impor: B002 Arang tidak dilacak');
near(unitCost(b1), 75, 'harga per satuan stok = 75/g');
const cache = {}; // nilai rumus tersimpan di Excel (HPP per Porsi, kolom G)
{ const rows = book.Menu, h = rows[0]; const ci = h.indexOf('Kode Menu'), gi = h.indexOf('HPP per Porsi'); for (const r of rows.slice(1)) if (r[ci]) cache[r[ci]] = r[gi]; }
let allMatch = true;
for (const m of parsed.menus) {
  const c = menuCost(m, parsed.materials);
  if (Math.abs(c.perPortion - cache[m.code]) > 1e-6) { allMatch = false; console.log('  beda', m.code, c.perPortion, cache[m.code]); }
}
ok(allMatch, 'HPP per porsi 28 menu = nilai Excel');
const m01 = parsed.menus.find(m => m.code === 'M01'), c01 = menuCost(m01, parsed.materials);
near(c01.perPortion, 35325, 'Rendang Daging HPP Rp35.325');
near(c01.profit, 14675, 'Rendang laba per porsi Rp14.675');
eq(menuStatus(c01), 'Food cost tinggi (>70%)', 'status Rendang sama dengan Excel');
const m28 = menuCost(parsed.menus.find(m => m.code === 'M28'), parsed.materials);
eq(m28.noPrice, 4, 'M28: 4 baris resep tanpa harga (sama dengan Excel)');
ok(parsed.warnings.length === 0, 'impor tanpa peringatan');

// penggabungan dengan data yang sudah ada + penautan produk
let idn = 0; const mk = () => 'id' + (++idn);
const products = [{ id: 'p1', name: 'Rendang Daging', sku: 'RD', price: 50000 }, { id: 'p2', name: 'Sambal Ijo', sku: 'M04', price: 20000 }];
const merged = mergeImport(parsed, { materials: [{ id: 'old1', code: 'B001', name: 'Adonan lama', buyPrice: 1 }], menus: [] }, products, mk);
eq(merged.materials.find(m => m.code === 'B001').id, 'old1', 'impor ulang: id bahan lama dipertahankan');
eq(merged.materials.find(m => m.code === 'B001').buyPrice, 75000, 'impor ulang: harga diperbarui dari file');
eq(merged.menus.find(m => m.code === 'M01').productId, 'p1', 'menu terhubung ke produk lewat nama (Rendang Daging)');
eq(merged.links.sku, 1, 'menu terhubung lewat SKU = kode menu (M04)');
ok(merged.links.none.length === 26, 'menu tanpa produk dilaporkan');

// ---------- 2) Stok bahan: belanja, penjualan, opname, rusak ----------
const materials = [
  { id: 'a', code: 'B038', name: 'Daging Sapi', buyUnit: 'kg', buyPrice: 135000, perBuy: 1000, stockUnit: 'g', tracked: true, minStock: 500 },
  { id: 'b', code: 'B121', name: 'Santan', buyUnit: 'kg', buyPrice: 30000, perBuy: 1000, stockUnit: 'g', tracked: true },
  { id: 'c', code: 'B002', name: 'Arang', buyUnit: 'paket', buyPrice: 20000, perBuy: 1, stockUnit: 'paket', tracked: false },
  { id: 'd', code: 'B200', name: 'Ikan Nila', buyUnit: 'kg', buyPrice: 40000, perBuy: 1, stockUnit: 'kg', tracked: true }
];
const menus = [
  { id: 'mr', code: 'M01', name: 'Rendang', batch: 6, sku: 'M01', items: [{ code: 'B038', qty: 1000 }, { code: 'B121', qty: 750 }, { code: 'B002', qty: 1 }] },
  { id: 'ms', code: 'M09', name: 'Sate', batch: 10, sku: 'M09', items: [{ code: 'B038', qty: 500 }] }
];
const prods = [{ id: 'P1', name: 'Rendang', sku: 'M01' }, { id: 'P2', name: 'Sate', sku: 'M09' }, { id: 'P3', name: 'Ayam B', sku: 'AB' }];
const expenses = [
  { id: 'e1', date: '2026-11-01', materialCode: 'B038', qty: 3, unit: 'kg', amount: 405000 },
  { id: 'e2', date: '2026-11-01', materialCode: 'B121', qty: 2, unit: 'kg', amount: 60000 },
  { id: 'e3', date: '2026-11-02', materialCode: 'b002', qty: 2, amount: 40000 },
  { id: 'e4', date: '2026-11-02', name: 'Gas', qty: 1, amount: 22000 }
];
const transactions = [
  { id: 't1', date: '2026-11-01', items: [{ productId: 'P1', sku: 'M01', qty: 3 }] },
  { id: 't2', date: '2026-11-02', items: [{ productId: 'P1', qty: 2 }, { productId: 'P2', qty: 4 }, { productId: 'X', sku: 'LAIN', qty: 9 }] },
  { id: 't3', date: '2026-11-02', items: [{ productId: 'hapus', sku: 'm09', qty: 1 }] } // produk sudah dihapus: cocok via SKU
];
const entries = [
  { id: 'x1', code: 'B038', date: '2026-10-31', kind: 'awal', qty: 200 },
  { id: 'x2', code: 'B038', date: '2026-11-02', kind: 'rusak', qty: 50 },
  { id: 'x3', code: 'B121', date: '2026-11-02', kind: 'opname', qty: 1000 }
];
const data = { materials, menus, products: prods, transactions, expenses, entries, invItems: [], invEntries: [] };
const S = Object.fromEntries(stockSummary(data, '2026-11-01', '2026-11-30').map(s => [s.code, s]));
// Daging: awal 200 + beli 3000 − jual (3+2)*1000/6 − sate (4+1)*50 − rusak 50
near(S.B038.open, 200, 'daging: saldo awal periode 200 g');
near(S.B038.buy, 3000, 'daging: belanja 3 kg = 3000 g');
near(S.B038.buyValue, 405000, 'daging: nilai belanja');
near(S.B038.useSale, 5 * 1000 / 6 + 5 * 50, 'daging: terpakai dari penjualan (rendang + sate, termasuk SKU produk terhapus)');
near(S.B038.close, 200 + 3000 - 5000 / 6 - 250 - 50, 'daging: sisa akhir');
eq(S.B038.status, 'aman', 'daging: status aman');
// Santan: beli 2000 − hari-1 jual 3*125 = 1625; hari-2: jual 2*125 lalu opname 1000 -> 1000
near(S.B121.close, 1000, 'santan: opname menetapkan sisa (hitung fisik akhir hari)');
near(S.B121.adjust, 1000 - (2000 - 375 - 250), 'santan: selisih opname tercatat sebagai penyesuaian');
eq(S.B002.status, 'tidak', 'arang: tidak dilacak (biaya overhead) ');
near(S.B002.buyValue, 40000, 'arang: belanja tetap tercatat (kode huruf kecil dikenali)');
eq(S.B200.status, 'kosong', 'ikan: belum ada catatan');
// periode berikutnya membawa saldo
const D = Object.fromEntries(stockSummary(data, '2026-12-01', '2026-12-31').map(s => [s.code, s]));
near(D.B038.open, S.B038.close, 'saldo akhir November = saldo awal Desember');
// edit & hapus otomatis membetulkan stok (dihitung ulang dari catatan)
const S2 = Object.fromEntries(stockSummary({ ...data, transactions: transactions.filter(t => t.id !== 't1'), expenses: expenses.map(e => e.id === 'e1' ? { ...e, qty: 4 } : e) }, '2026-11-01', '2026-11-30').map(s => [s.code, s]));
near(S2.B038.close, S.B038.close + 3000 / 6 + 1000, 'hapus transaksi & ubah qty belanja -> stok langsung benar');
// minus & menipis
const S3 = Object.fromEntries(stockSummary({ ...data, expenses: [] }, '2026-11-01', '2026-11-30').map(s => [s.code, s]));
eq(S3.B038.status, 'minus', 'tanpa belanja: stok minus terdeteksi');
const S4 = Object.fromEntries(stockSummary({ ...data, materials: materials.map(m => m.code === 'B038' ? { ...m, minStock: 3000 } : m) }, '2026-11-01', '2026-11-30').map(s => [s.code, s]));
eq(S4.B038.status, 'menipis', 'di bawah stok minimum: menipis');
// kartu stok berjalan
const rows = runBalance(movements(data).get('B038'));
eq(rows.map(r => r.kind), ['awal', 'beli', 'jual', 'jual', 'jual', 'jual', 'rusak'], 'kartu stok urut per tanggal & jenis');

// ---------- 3) Kaitan dengan Kontrol Persediaan (SKU) ----------
const invItems = [
  { id: 'iR', name: 'Rendang', hasDepan: true, links: [{ productId: 'P1', mult: 1 }] },  // masakan: dipantau di Persediaan
  { id: 'iN', name: 'Ikan Nila segar', sku: 'B200', hasDepan: false },                  // bahan: dipantau di Persediaan
  { id: 'iA', name: 'Ayam', hasDepan: true, links: [{ productId: 'P2', mult: 1 }, { productId: 'P3', mult: 1 }] }
];
const prodSet = productionMenus(menus, prods, invItems);
eq([...prodSet.keys()], ['mr'], 'menu Rendang dipotong saat produksi; item Ayam (2 produk) tidak');
ok(invItemForMaterial(materials[3], invItems)?.id === 'iN', 'bahan B200 dikenali dipantau di Persediaan (SKU = kode bahan)');
const invEntries = [
  { id: 'ie1', itemId: 'iR', area: 'dapur', kind: 'masuk', qty: 12, date: '2026-11-01' }, // masak 12 porsi rendang
  { id: 'ie2', itemId: 'iR', area: 'dapur', kind: 'naik', qty: 12, date: '2026-11-01' },
  { id: 'ie3', itemId: 'iR', area: 'depan', kind: 'jual', qty: 5, date: '2026-11-02' }
];
const P = Object.fromEntries(stockSummary({ ...data, invItems, invEntries, expenses: [...expenses, { id: 'e9', date: '2026-11-03', materialCode: 'B200', qty: 5, amount: 200000 }] }, '2026-11-01', '2026-11-30').map(s => [s.code, s]));
near(P.B038.useProd, 12 * 1000 / 6, 'rendang: bahan dipotong dari masakan 12 porsi (bukan dari 5 porsi terjual)');
near(P.B038.useSale, 5 * 50, 'sate (tidak di Persediaan): tetap dipotong per penjualan');
eq(P.B200.status, 'persediaan', 'ikan nila: status dipantau di Persediaan');
near(P.B200.buyValue, 200000, 'ikan nila: belanja tetap terlihat nilainya');
near(P.B200.close, 0, 'ikan nila: tidak dihitung ganda di Stok Bahan Baku');
const P2 = Object.fromEntries(stockSummary({ ...data, invItems, invEntries: [...invEntries, { id: 'exp-e9', itemId: 'iN', area: 'dapur', kind: 'masuk', qty: 5, date: '2026-11-03' }, { id: 'u', itemId: 'iN', area: 'dapur', kind: 'pakai', qty: 2, date: '2026-11-04' }] }, '2026-11-01', '2026-11-30').map(s => [s.code, s]));
near(P2.B200.close, 3, 'ikan nila: sisa dibaca dari saldo dapur Persediaan (masuk 5 − pakai 2)');
// item Persediaan yang dipakai 2 menu ber-resep -> tetap per penjualan
const menus2 = [...menus, { id: 'm3', code: 'M10', name: 'Ayam B', sku: 'AB', items: [{ code: 'B038', qty: 1 }] }];
const prods2 = prods;
ok(!productionMenus(menus2, prods2, invItems).has('ms'), 'item Persediaan untuk 2 menu: tidak bisa dipastikan resepnya -> per penjualan');

// ---------- konversi satuan belanja -> item Persediaan ----------
{
  const mg = { code: 'B038', buyUnit: 'kg', perBuy: 1000, stockUnit: 'g' };
  eq(invQtyFromExpense({ qty: 2 }, mg, { unit: 'kg' }), 2, 'Persediaan bersatuan kg: belanja 2 kg -> 2');
  eq(invQtyFromExpense({ qty: 2 }, mg, { unit: 'g' }), 2000, 'Persediaan bersatuan g: belanja 2 kg -> 2000');
  eq(invQtyFromExpense({ qty: 2 }, mg, { unit: '' }), 2000, 'Persediaan tanpa satuan: pakai satuan stok bahan');
  eq(invQtyFromExpense({ qty: 3 }, { buyUnit: 'ikat', perBuy: 1, stockUnit: 'ikat' }, { unit: 'Ikat' }), 3, 'satuan sama: tanpa konversi');
  const w = invEntriesFromExpenses([{ id: 'x1', date: '2026-11-05', materialCode: 'b038', qty: 2 }, { id: 'x2', date: '2026-11-05', materialCode: 'B999', qty: 1 }, { id: 'x3', date: '2026-11-05', qty: 1 }],
    [{ code: 'B038', buyUnit: 'kg', perBuy: 1000, stockUnit: 'g' }], [{ id: 'I1', sku: 'B038', unit: 'kg' }]);
  eq([...w.keys()], ['exp-x1'], 'hanya belanja berkode bahan yang dipantau Persediaan');
  eq([w.get('exp-x1').itemId, w.get('exp-x1').qty, w.get('exp-x1').kind, w.get('exp-x1').area], ['I1', 2, 'masuk', 'dapur'], 'catatan Bahan masuk dapur 2 kg');
}

{
  const S = stockSummary({ materials: [{ id: 'k', code: 'B038', name: 'Daging', buyUnit: 'kg', buyPrice: 135000, perBuy: 1000, stockUnit: 'g' }], menus: [], products: [], transactions: [], expenses: [], entries: [],
    invItems: [{ id: 'I1', sku: 'B038', unit: 'kg', hasDepan: false }], invEntries: [{ id: 'z', itemId: 'I1', area: 'dapur', kind: 'masuk', qty: 2, date: '2026-11-01' }] }, '2026-11-01', '2026-11-30')[0];
  eq([S.close, S.unit, S.value], [2, 'kg', 270000], 'bahan di Persediaan (kg): sisa 2 kg bernilai Rp270.000');
}

console.log(`test-bahan-logic: ${pass} lulus, ${fail} gagal`);
process.exit(fail ? 1 : 0);
