// Uji Stok Bahan Baku & HPP Menu. Jalankan: node test-bahan-logic.mjs
import { readFileSync } from 'node:fs';
import { readXlsx } from './xlsx-read.js';
import { parseHppWorkbook, mergeImport, menuCost, menuStatus, unitCost, stockSummary, movements, runBalance, invItemForMaterial, materialForItem, normCode, invQtyFromExpense, invQtyFromStock, invEntriesFromExpenses, inventoryValue, auditBahan } from './bahan-logic.js';

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

// ---------- 3) Kaitan dengan Kontrol Persediaan (kode bahan) — sejak 2.12 ----------
const invItems = [
  { id: 'iR', name: 'Rendang', hasDepan: true, links: [{ productId: 'P1', mult: 1 }] },              // masakan (tanpa bahan)
  { id: 'iN', name: 'Ikan Nila segar', sku: 'IKN', materialCode: 'b200', unit: 'kg', hasDepan: false }, // terhubung lewat kode bahan
  { id: 'iD', name: 'Daging (lama)', sku: 'B038', hasDepan: false },                                   // data lama: SKU = kode bahan
  { id: 'iX', name: 'Santan', sku: 'B121', materialCode: '', hasDepan: false }                         // sengaja tidak dihubungkan
];
ok(invItemForMaterial(materials[3], invItems)?.id === 'iN', 'B200 terhubung ke item lewat kode bahan (huruf kecil dikenali)');
ok(invItemForMaterial(materials[0], invItems)?.id === 'iD', 'data lama: SKU item = kode bahan tetap dikenali');
ok(invItemForMaterial(materials[1], invItems) === null, 'materialCode kosong = sengaja tidak terhubung walau SKU sama');
eq([materialForItem(invItems[1], materials, invItems)?.code, materialForItem(invItems[2], materials, invItems)?.code, materialForItem(invItems[3], materials, invItems), materialForItem(invItems[0], materials, invItems)],
  ['B200', 'B038', null, null], 'kebalikan: bahan untuk tiap item');
const invEntries = [
  { id: 'ie1', itemId: 'iR', area: 'dapur', kind: 'hasil', qty: 12, date: '2026-11-01' }, // masak 12 porsi rendang (olah jadi menu)
  { id: 'ie2', itemId: 'iR', area: 'dapur', kind: 'naik', qty: 12, date: '2026-11-01' },
  { id: 'ie3', itemId: 'iN', area: 'dapur', kind: 'pakai', qty: 2, date: '2026-11-04' }
];
const withInv = { ...data, invItems, invEntries, expenses: [...expenses, { id: 'e9', date: '2026-11-03', materialCode: 'B200', qty: 5, amount: 200000 }] };
const P = Object.fromEntries(stockSummary(withInv, '2026-11-01', '2026-11-30').map(s => [s.code, s]));
const P0 = Object.fromEntries(stockSummary({ ...withInv, invItems: [], invEntries: [] }, '2026-11-01', '2026-11-30').map(s => [s.code, s]));
eq(['B038', 'B121', 'B200'].map(k => P[k].close), ['B038', 'B121', 'B200'].map(k => P0[k].close), 'Persediaan tidak mengubah stok bahan (hanya memantau, tidak dobel)');
near(P.B038.useSale, S.B038.useSale, 'rendang: bahan tetap dipotong per penjualan sesuai resep');
near(P.B200.close, 5, 'ikan nila: stok bahan = belanja 5 kg (pemakaian dapur di Persediaan tidak memotong)');
eq(P.B200.status, 'aman', 'ikan nila: status normal (tidak lagi "dipantau di Persediaan")');
eq(P.B200.invItem?.id, 'iN', 'ringkasan tetap menunjukkan item Persediaan terhubung');
{
  const ents = [{ id: 'k1', code: 'B200', date: '2026-11-06', kind: 'masuk', qty: 3, note: 'kiriman' }, { id: 'k2', code: 'B200', date: '2026-11-06', kind: 'rusak', qty: 1 }, { id: 'k3', code: 'B999', date: '2026-11-06', kind: 'masuk', qty: 1 }];
  const w = invEntriesFromExpenses(withInv.expenses, materials, invItems, ents);
  eq([...w.keys()].sort(), ['exp-e1', 'exp-e9', 'mat-k1'], 'bahan masuk otomatis: belanja B038 (item lama) & B200 + masuk lain B200; rusak/kode asing/tak terhubung diabaikan');
  eq([w.get('mat-k1').itemId, w.get('mat-k1').qty, w.get('mat-k1').source, w.get('mat-k1').kind], ['iN', 3, 'bahan', 'masuk'], 'masuk lain 3 kg -> Bahan masuk dapur 3 kg');
  eq(w.get('exp-e9').qty, 5, 'belanja 5 kg -> Bahan masuk 5 kg');
  eq(invQtyFromStock(2500, { buyUnit: 'kg', perBuy: 1000, stockUnit: 'g' }, { unit: 'kg' }), 2.5, 'masuk lain 2500 g -> item bersatuan kg: 2,5');
  eq(invQtyFromStock(2500, { buyUnit: 'kg', perBuy: 1000, stockUnit: 'g' }, { unit: 'g' }), 2500, 'masuk lain 2500 g -> item bersatuan g: 2500');
}

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
  const S = stockSummary({ materials: [{ id: 'k', code: 'B038', name: 'Daging', buyUnit: 'kg', buyPrice: 135000, perBuy: 1000, stockUnit: 'g' }], menus: [], products: [], transactions: [], entries: [],
    expenses: [{ id: 'e', date: '2026-11-01', materialCode: 'B038', qty: 2, amount: 270000 }],
    invItems: [{ id: 'I1', materialCode: 'B038', unit: 'kg', hasDepan: false }], invEntries: [{ id: 'exp-e', itemId: 'I1', area: 'dapur', kind: 'masuk', qty: 2, date: '2026-11-01' }, { id: 'p', itemId: 'I1', area: 'dapur', kind: 'pakai', qty: 1, date: '2026-11-02' }] }, '2026-11-01', '2026-11-30')[0];
  eq([S.close, S.unit, S.value], [2000, 'g', 270000], 'bahan terhubung Persediaan: stok & nilai dihitung di Stok Bahan Baku (2000 g = Rp270.000)');
}

// ---------- nilai persediaan untuk Pembukuan (tanpa dobel hitung) ----------
{
  const D = {
    materials: [{ id: 'm1', code: 'B1', name: 'Daging', buyUnit: 'kg', buyPrice: 100000, perBuy: 1000, stockUnit: 'g' }],
    menus: [{ id: 'M1', code: 'M01', sku: 'M01', name: 'Rendang', portions: 10, items: [{ code: 'B1', qty: 1000 }] },
            { id: 'M2', code: 'M02', sku: 'M02', name: 'Gulai', portions: 10, items: [{ code: 'B1', qty: 500 }] }],
    products: [{ id: 'P1', sku: 'M01', name: 'Rendang', stock: 5, costPrice: 10000 },   // resep dipotong per penjualan -> tidak dinilai
               { id: 'P2', sku: 'M02', name: 'Gulai', stock: 4, costPrice: 5000, invItemId: 'I2' }, // ber-resep -> tidak dinilai
               { id: 'P3', sku: 'X1', name: 'Kerupuk', stock: 10, costPrice: 1000 },       // tanpa resep -> dinilai
               { id: 'P4', sku: 'X2', name: 'Es teh', stock: null, costPrice: 2000 }],
    transactions: [], expenses: [{ id: 'e1', date: '2026-11-02', materialCode: 'B1', qty: 2, amount: 200000 }], entries: [],
    invItems: [{ id: 'I2', name: 'Gulai porsi', sku: 'M02', hasDepan: true, links: [{ productId: 'P2', mult: 1 }] }], invEntries: []
  };
  const v = inventoryValue(D, '2026-11-30');
  eq(v.bahan, 200000, 'nilai bahan akhir bulan = 2000 g × Rp100/g');
  eq(v.dikecualikan, 70000, 'produk ber-resep tidak dinilai (bahannya masih di Stok Bahan Baku sampai terjual)');
  eq(v.produk, 10000, 'dinilai: hanya Kerupuk (tanpa resep) 10×1.000');
  eq(v.total, v.bahan + v.produk, 'total = bahan + produk');
  eq(inventoryValue(D, '2026-11-01').bahan, 0, 'sebelum belanja: nilai bahan 0');
}

// ---------- pemeriksaan data bahan & HPP ----------
{
  const base = {
    materials: [{ id: 'a', code: 'B1', name: 'Daging', buyUnit: 'kg', buyPrice: 100000, perBuy: 1000, stockUnit: 'g' },
                { id: 'b', code: 'B2', name: 'Cabai', buyUnit: 'kg', buyPrice: 0, perBuy: 1000, stockUnit: 'g' }],
    menus: [{ id: 'M1', code: 'M01', name: 'Rendang', batch: 10, items: [{ code: 'B1', qty: 1000 }, { code: 'B2', qty: 100 }, { code: 'B9', qty: 5 }] },
            { id: 'M2', code: 'M02', name: 'Sayur', batch: 1, items: [{ code: 'B1', qty: 10 }] }],
    products: [{ id: 'P1', sku: 'M01', name: 'Rendang', price: 30000, costPrice: 5000 }],
    transactions: [{ id: 't', date: '2026-11-03', items: [{ productId: 'P1', sku: 'M01', qty: 20 }] }],
    expenses: [{ id: 'x1', date: '2026-11-02', type: 'Gaji', materialCode: 'B1', qty: 1, amount: 100000 }, { id: 'x2', date: '2026-11-02', type: 'Bahan baku', materialCode: 'B7', qty: 1, amount: 1 }],
    entries: [], invItems: [], invEntries: []
  };
  const A = auditBahan(base, { today: '2026-11-30', groupOf: x => (x.type === 'Gaji' ? 'gaji' : 'bahan') });
  const has = (lvl, re) => A.some(a => a.level === lvl && re.test(a.title));
  ok(has('error', /kode bahan yang tidak ada/), 'audit: resep memakai kode bahan tak dikenal (B9)');
  ok(has('warn', /belum ada harganya/), 'audit: bahan resep tanpa harga (B2)');
  ok(has('warn', /belum terhubung ke produk kasir/), 'audit: menu M02 tanpa produk kasir');
  ok(has('warn', /harga modal berbeda/), 'audit: harga modal produk ≠ HPP resep');
  ok(has('warn', /kode bahan yang sudah tidak ada/), 'audit: belanja berkode B7 yang tidak terdaftar');
  ok(has('warn', /beban di luar HPP/), 'audit: belanja berkode bahan bertipe Gaji');
  ok(has('warn', /stoknya minus/), 'audit: stok bahan minus (terjual 20 porsi, belanja 1 kg)');
  const dup = auditBahan({ ...base, materials: [...base.materials, { id: 'c', code: 'b1', name: 'Daging 2', perBuy: 1, stockUnit: 'g' }] }, { today: '2026-11-30' });
  ok(dup.some(a => a.level === 'error' && /Kode bahan ganda: B1/.test(a.title)), 'audit: kode bahan ganda (huruf besar/kecil)');
  const clean = auditBahan({ materials: [base.materials[0]], menus: [{ id: 'M1', code: 'M01', batch: 10, items: [{ code: 'B1', qty: 1000 }] }],
    products: [{ id: 'P1', sku: 'M01', costPrice: 10000 }], transactions: [], expenses: [{ id: 'y', date: '2026-11-01', type: 'Bahan baku', materialCode: 'B1', qty: 1, amount: 100000 }], entries: [], invItems: [], invEntries: [] },
    { today: '2026-11-30', groupOf: () => 'bahan' });
  eq(clean, [], 'audit: data rapi -> tidak ada temuan');
  const op = auditBahan({ ...base, entries: [{ id: 'e', code: 'B1', kind: 'awal', qty: 5000, date: '2026-11-01' }] }, { today: '2026-11-30', opening: { date: '2026-11-01', persediaan: 100000 } });
  ok(op.some(a => /Neraca Awal berbeda/.test(a.title)), 'audit: persediaan Neraca Awal ≠ nilai stok awal bahan (Rp500.000 vs Rp100.000)');
}

{
  const A = auditBahan({ materials: [{ id: 'a', code: 'B1', name: 'Daging', buyUnit: 'kg', buyPrice: 1, perBuy: 1, stockUnit: 'kg' }], menus: [], products: [], transactions: [], expenses: [], entries: [], invItems: [{ id: 'I', sku: 'B1' }],
    invEntries: [{ id: 'exp-1', itemId: 'I', area: 'dapur', kind: 'masuk', qty: 2, date: '2026-11-05', source: 'pengeluaran' }, { id: 'm', itemId: 'I', area: 'dapur', kind: 'masuk', qty: 2, date: '2026-11-05' }] }, { today: '2026-11-30' });
  ok(A.some(a => /dua kali/.test(a.title)), 'audit: Bahan masuk manual kembar dengan belanja otomatis');
}

{
  const mats = [{ id: 'a', code: 'B1', name: 'Daging', buyUnit: 'kg', buyPrice: 100000, perBuy: 1000, stockUnit: 'g' }];
  const A = auditBahan({ materials: mats, menus: [], products: [], transactions: [], expenses: [], entries: [], invEntries: [],
    invItems: [{ id: 'i1', name: 'Daging dapur', materialCode: 'B1' }, { id: 'i2', name: 'Daging cadangan', materialCode: 'b1' }, { id: 'i3', name: 'Bawang', materialCode: 'B77' }] }, { today: '2026-11-30' });
  ok(A.some(a => /tidak ada/.test(a.title) && a.area === 'Persediaan'), 'audit: item Persediaan berkode bahan tak dikenal');
  ok(A.some(a => /lebih dari satu item/.test(a.title)), 'audit: satu kode bahan dihubungkan ke dua item');
}

console.log(`test-bahan-logic: ${pass} lulus, ${fail} gagal`);
process.exit(fail ? 1 : 0);
