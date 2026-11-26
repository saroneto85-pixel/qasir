import assert from 'node:assert/strict';
import { auditData } from './audit.js';
let ok = 0; const t = (c, m) => { assert.ok(c, m); ok++; };
const today = '2026-11-25';
const clean = () => ({
  opening: { date: '2026-11-01', kas: 5000000, persediaan: 0, rentYear: 0, stockEnd: { '2026-10': 0 } },
  products: [{ id: 'a', sku: 'A-1', name: 'Nasi', price: 15000, costPrice: 6000, stock: 40 }, { id: 'b', sku: 'B-1', name: 'Paket', price: 45000, costPrice: 17000, stock: 20 }],
  invItems: [{ id: 'r', name: 'Rendang', sku: 'A-1', hasDepan: true, links: [{ productId: 'a', mult: 1 }, { productId: 'b', mult: 2 }] }],
  invEntries: [{ id: 'm', date: '2026-11-02', itemId: 'r', area: 'dapur', kind: 'masuk', qty: 100, createdAt: 1 }, { id: 'n', date: '2026-11-02', itemId: 'r', area: 'dapur', kind: 'naik', qty: 50, createdAt: 2 },
    { id: 'kasir-r-2026-11-03', date: '2026-11-03', itemId: 'r', area: 'depan', kind: 'jual', qty: 14, source: 'kasir', createdAt: 3 }],
  transactions: [{ id: 't1', invoice: 'INV-1', date: '2026-11-03', items: [{ productId: 'a', sku: 'A-1', price: 15000, qty: 10 }, { productId: 'b', sku: 'B-1', price: 45000, qty: 2 }], subtotal: 240000, discount: 0, total: 240000, payment: 'Tunai' }],
  expenses: [], liabilities: [], receivables: [],
});
// depan = 50 - 14 = 36 => nasi 36 (x1), paket 18 (x2); stok produk di data bersih = sinkron
const d0 = clean(); d0.products[0].stock = 36; d0.products[1].stock = 18;
const r0 = auditData(d0, today); t(!r0.some(i => i.level === 'error' || i.level === 'warn'), 'data konsisten: tanpa error/peringatan ' + JSON.stringify(r0.filter(i => i.level !== 'info').map(i => i.title)));
// stok tidak sinkron
const d1 = clean(); d1.products[0].stock = 40; d1.products[1].stock = 18; t(auditData(d1, today).some(i => i.fix === 'sync-stock' && /Nasi/.test(i.title)), 'stok produk tidak sama dengan sisa depan terdeteksi');
// SKU ganda
const d2 = clean(); d2.products[1].sku = 'a-1'; t(auditData(d2, today).some(i => i.level === 'error' && /SKU ganda/.test(i.title)), 'SKU ganda');
// tempo tanpa piutang, hutang tanpa catatan
const d3 = clean(); d3.products[0].stock = 36; d3.products[1].stock = 18; d3.transactions[0].payment = 'Tempo / Kasbon'; d3.expenses = [{ id: 'e1', name: 'Beras', type: 'Bahan baku', amount: 100000, payment: 'Hutang', date: '2026-11-04' }];
const r3 = auditData(d3, today); t(r3.some(i => /Tempo/.test(i.title) && i.fix === 'sync-debts') && r3.some(i => /status Hutang/.test(i.title)), 'tempo/hutang tanpa catatan terdeteksi');
// total transaksi tidak cocok
const d4 = clean(); d4.products[0].stock = 36; d4.products[1].stock = 18; d4.transactions[0].total = 200000; t(auditData(d4, today).some(i => i.level === 'error' && /totalnya tidak cocok/.test(i.title)), 'total tidak cocok');
// saldo minus & kas negatif
const d5 = clean(); d5.invEntries.push({ id: 'x', date: '2026-11-04', itemId: 'r', area: 'depan', kind: 'rusak', qty: 99, createdAt: 9 }); t(auditData(d5, today).some(i => /minus/.test(i.title)), 'saldo minus');
const d6 = clean(); d6.opening.kas = 0; d6.expenses = [{ id: 'e', name: 'X', type: 'Operasional', amount: 900000, payment: 'Tunai', date: '2026-11-05' }]; t(auditData(d6, today).some(i => /kas negatif/i.test(i.title)), 'kas negatif');
// catatan terjual tidak sama dengan kasir
const d7 = clean(); d7.products[0].stock = 36; d7.products[1].stock = 18; d7.invEntries.pop(); t(auditData(d7, today).some(i => i.fix === 'sync-sales'), 'terjual belum sinkron');
// pembayaran berlebih
const d8 = clean(); d8.receivables = [{ id: 'r1', name: 'Bu Ani', amount: 100, payments: [{ amount: 150 }] }]; t(auditData(d8, today).some(i => /melebihi nominal/.test(i.title)), 'pembayaran berlebih');
console.log(`✓ ${ok} pemeriksaan audit data lulus`);
