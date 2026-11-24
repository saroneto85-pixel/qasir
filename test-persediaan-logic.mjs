// Uji kesetaraan: logika aplikasi harus menghasilkan angka yang sama dengan Dashboard Excel "Kontrol_Stok_revisi.xlsx".
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { summarize, balanceAt, firstMinus, monthRange } from './persediaan-logic.js';

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
process.exit(fail ? 1 : 0);
