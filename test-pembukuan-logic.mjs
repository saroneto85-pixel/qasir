// Uji kesetaraan dengan Pembukuan_DBL_revisi.xlsx (bulan Nov 2026) + uji alur kas/hutang/piutang.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { hppVariance, stockOpening, stockClose, defaultExpenseGroup, pnl, neraca, pembukuan, evaluasi, cashBook, cashBalanceAt, monthlyCash, remainOf, debtStatus, rangeMonths, addMonthsDate, normOpening, findProductBySku, skuTaken, nextSku } from './pembukuan-logic.js';

const assets = JSON.parse(fs.readFileSync(new URL('./test-fixtures/pembukuan-assets.json', import.meta.url))).map((a, i) => ({ ...a, id: 'a' + i }));
let ok = 0;
const near = (label, got, want, tol = 0.01) => { assert.ok(Math.abs(got - want) <= tol, `${label}: aplikasi=${got} Excel=${want}`); ok++; };

const tx = (id, date, payment, subtotal, discount = 0) => ({ id, invoice: 'INV' + id, date, payment, subtotal, discount, total: subtotal - discount, items: [] });
const base = {
  opening: { date: '2026-11-01', kas: 20000000, peralatan: 20000000, rentYear: 14000000, rentStart: '2026-05-01', life: 8 },
  transactions: [tx(1, '2026-11-02', 'Tunai', 28902000), tx(2, '2026-11-03', 'QRIS', 4048000)],
  expenses: [
    { id: 'e1', date: '2026-11-12', type: 'Bahan baku', name: 'Beras', amount: 1000000, payment: 'Tunai' },
    { id: 'e2', date: '2026-11-12', type: 'Operasional', name: 'Gas', amount: 1000000, payment: 'Tunai' },
    { id: 'e3', date: '2026-11-12', type: 'Gaji', name: 'Gaji', amount: 10820000, payment: 'Tunai' },
  ],
  assets, liabilities: [], receivables: [], products: [], groups: {},
};

// --- Laba Rugi November 2026 (sheet "Laba Rugi", kolom B)
const p = pnl(base, '2026-11-01', '2026-11-30');
near('penjualan bruto', p.bruto, 32950000); near('penjualan bersih', p.bersih, 32950000);
near('HPP', p.hpp, 2000000); near('laba kotor', p.labaKotor, 30950000);
near('gaji', p.gaji, 10820000); near('sewa/bulan', p.sewa, 1166666.6667); near('penyusutan', p.penyusutan, 332031.25);
near('total beban', p.beban, 12318697.9167); near('laba bersih', p.labaBersih, 18631302.0833);
near('food cost', p.foodCost, 0.06069802731411229, 1e-9); near('beban gaji %', p.gajiPct, 0.3283763277693475, 1e-9);
near('margin bersih', p.marginBersih, 0.565441641375822, 1e-9); near('titik impas', p.breakEven, 13114736.554254174);

// --- Neraca Awal (sheet "Neraca Awal"): tanpa aset terdaftar -> peralatan manual
const nr = neraca({ ...base, assets: [] }, '2026-11-24');
near('sewa dibayar dimuka', nr.sewaDimuka, 7000000); near('total aset', nr.totalAset, 47000000); near('modal awal', nr.modal, 47000000);
assert.equal(nr.jatuhTempo, '2027-05-01'); near('hari sewa', nr.sisaHari, 158); // Excel: 158 hari (24 Nov 2026)
// dengan daftar aset: peralatan & akumulasi otomatis dari menu Aset
const nr2 = neraca(base, '2026-11-24'); assert.equal(nr2.peralatanAuto, true); near('peralatan dari aset', nr2.peralatan, 31875000); ok++;

// --- Kas: tunai+QRIS masuk, bahan+operasional+gaji keluar
const cb = cashBook(base, '2026-11-01', '2026-11-30');
near('kas masuk', cb.in, 32950000); near('kas keluar', cb.out, 12820000); near('saldo akhir', cb.close, 20000000 + 32950000 - 12820000);
near('saldo kas kini', cashBalanceAt(base, '2026-11-24'), 40130000);
const mc = monthlyCash(base, '2026-11', 3); near('saldo kumulatif', mc[2].saldo, 40130000);

// --- Tempo/kasbon: omzet tercatat, kas belum masuk sampai piutang dibayar
const d2 = { ...base, transactions: [...base.transactions, tx(3, '2026-11-05', 'Tempo / Kasbon', 500000)], receivables: [{ id: 'r1', name: 'Bu Ani', amount: 500000, date: '2026-11-05', payments: [{ date: '2026-11-20', amount: 200000, method: 'Tunai' }] }] };
near('bruto incl. tempo', pnl(d2, '2026-11-01', '2026-11-30').bruto, 33450000);
near('kas masuk tempo dibayar sebagian', cashBook(d2, '2026-11-01', '2026-11-30').in, 32950000 + 200000);
near('sisa piutang', remainOf(d2.receivables[0]), 300000); assert.equal(debtStatus(d2.receivables[0], '2026-11-24'), 'Belum lunas');

// --- Belanja dengan metode Hutang: biaya tercatat, kas keluar hanya saat dibayar
const d3 = { ...base, expenses: [...base.expenses, { id: 'e4', date: '2026-11-15', type: 'Bahan baku', name: 'Beras 100kg', amount: 1300000, payment: 'Hutang' }], liabilities: [{ id: 'l1', name: 'Toko Beras', amount: 1300000, due: '2026-11-17', payments: [{ date: '2026-11-18', amount: 500000 }] }] };
near('HPP incl. hutang', pnl(d3, '2026-11-01', '2026-11-30').hpp, 3300000);
near('kas keluar hanya bayar hutang', cashBook(d3, '2026-11-01', '2026-11-30').out, 12820000 + 500000);
assert.equal(debtStatus(d3.liabilities[0], '2026-11-24'), 'Jatuh tempo');

// --- Dashboard Pembukuan & Evaluasi: peringatan sesuai Excel (gaji 32,8% > 25% => perhatian)
const pb = pembukuan(base, '2026-11', '2026-11-24');
assert.ok(pb.warn.some(w => w.level === 'warn' && /beban gaji/.test(w.text))); assert.ok(pb.warn.some(w => w.level === 'ok' && /food cost/.test(w.text))); ok += 2;
const ev = evaluasi(base, '2026-11', '2026-11-24');
assert.equal(ev.rows.find(r => r.key === 'gaji').status, 'Perlu perhatian'); assert.equal(ev.rows.find(r => r.key === 'food').status, 'Baik');
assert.equal(ev.rows.find(r => r.key === 'be').status, 'Di atas titik impas'); ok += 3;

// --- Bulan kosong tidak menghasilkan NaN
const empty = evaluasi({ opening: {}, transactions: [], expenses: [], assets: [], products: [] }, '2026-12', '2026-12-05');
assert.ok(empty.rows.every(r => Number.isFinite(r.value))); ok++;

// --- Rentang parsial memprorata sewa; migrasi data neraca lama; SKU
near('sewa 15 hari Nov', pnl(base, '2026-11-01', '2026-11-15').sewa, 1166666.6667 / 2);
assert.equal(rangeMonths('2026-11-20', '2026-12-10').length, 2); assert.equal(addMonthsDate('2026-01-31', 1), '2026-02-28'); ok += 2;
assert.equal(normOpening({ cash: 5, bank: 7 }).kas, 12); ok++;
const prods = [{ id: '1', sku: ' kb-01 ' }, { id: '2', sku: '' }];
assert.equal(findProductBySku(prods, 'KB-01').id, '1'); assert.ok(skuTaken(prods, 'kb-01', '2') && !skuTaken(prods, 'kb-01', '1')); assert.equal(nextSku(prods), 'P003'); ok += 3;

// --- Opsi 1: Utilitas & Transportasi di luar HPP; HPP aktual disesuaikan persediaan; selisih vs HPP standar (batas 10%)
assert.equal(defaultExpenseGroup('Utilitas'), 'beban'); assert.equal(defaultExpenseGroup('Transportasi'), 'beban'); assert.equal(defaultExpenseGroup('Lainnya'), 'operasional'); ok += 3;
const st = { ...base, opening: { ...base.opening, persediaan: 3000000, tHppVar: 0.10, stockEnd: { '2026-11': 2000000 } },
  expenses: [...base.expenses, { id: 'u', date: '2026-11-13', type: 'Utilitas', name: 'Listrik', amount: 900000, payment: 'Tunai' }, { id: 't', date: '2026-11-14', type: 'Transportasi', name: 'Ojek', amount: 300000, payment: 'Tunai' }],
  transactions: [{ ...tx(1, '2026-11-02', 'Tunai', 32950000), items: [{ price: 25000, qty: 1318, costPrice: 12000 }] }] };
const ps = pnl(st, '2026-11-01', '2026-11-30');
near('HPP pembelian (tanpa utilitas/transport)', ps.hppBeli, 2000000); near('beban lain', ps.bebanLain, 1200000);
near('perubahan persediaan (3jt -> 2jt)', ps.perubahanStok, 1000000); near('HPP aktual', ps.hpp, 3000000);
near('total beban incl. beban lain', ps.beban, 10820000 + 1200000 + 1166666.6667 + 332031.25);
near('HPP standar', ps.hppStandar, 1318 * 12000); near('selisih HPP', ps.selisihHpp, 3000000 - 15816000);
assert.equal(hppVariance(ps, 0.10).status, 'warn'); ok++;                       // aktual jauh di bawah standar -> peringatan
// aktual 11% di atas standar -> peringatan; 8% -> wajar; HPP produk belum lengkap -> tidak dinilai
const mk = (hpp, std, cov = 1) => ({ hppStandar: std, hpp, selisihPct: (hpp - std) / std, hppCoverage: cov });
assert.equal(hppVariance(mk(1110, 1000)).status, 'warn'); assert.equal(hppVariance(mk(1080, 1000)).status, 'ok'); assert.equal(hppVariance(mk(1500, 1000, 0.5)).status, 'na'); assert.equal(hppVariance(mk(5, 0.0001)).status, 'warn'); ok += 4;
assert.equal(hppVariance(mk(1100, 1000)).status, 'ok'); ok++; // tepat 10% masih wajar (peringatan bila LEBIH dari 10%)
// persediaan dibawa ke bulan berikutnya bila belum diisi; bulan sebelum mulai tidak berubah
const oo = normOpening(st.opening); near('awal Des = akhir Nov', stockOpening(oo, '2026-12'), 2000000); near('akhir Des (belum diisi) = awal', stockClose(oo, '2026-12'), 2000000); near('awal Nov = neraca', stockOpening(oo, '2026-11'), 3000000);
near('Des tanpa perubahan stok', pnl(st, '2026-12-01', '2026-12-31').perubahanStok, 0);
const pb2 = pembukuan(st, '2026-11', '2026-11-24'); assert.ok(pb2.warn.some(w => /HPP aktual/.test(w.text))); ok++;
const ev2 = evaluasi(st, '2026-11', '2026-11-24'); assert.equal(ev2.rows.find(r => r.key === 'hppV').status, 'Perlu perhatian'); ok++;
console.log(`✓ ${ok} pemeriksaan pembukuan lulus`);
