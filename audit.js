// Pemeriksaan konsistensi data lintas menu (murni, tanpa DOM, diuji di test-audit.mjs).
// Setiap temuan: { level: 'error'|'warn'|'info', area, title, detail, fix?: kode perbaikan otomatis }.
import { itemLinks, posSalesForItem, balanceAt, firstMinus } from './persediaan-logic.js';
import { normOpening, paidOf, cashBalanceAt, localToday, pnl, ymOf } from './pembukuan-logic.js';

const n = v => Number(v) || 0;
const nk = s => String(s ?? '').trim().toUpperCase();
const rp = v => 'Rp' + Math.round(n(v)).toLocaleString('id-ID');

export function auditData(d, today = localToday()) {
  const out = [], add = (level, area, title, detail, fix) => out.push({ level, area, title, detail, fix });
  const P = d.products || [], I = d.invItems || [], E = d.invEntries || [], T = d.transactions || [], X = d.expenses || [], L = d.liabilities || [], R = d.receivables || [];
  const o = normOpening(d.opening || {});

  // --- Neraca awal
  if (!o.date) add('warn', 'Neraca Awal', 'Neraca Awal belum diisi', 'Tanggal mulai pembukuan kosong: saldo kas, sewa, dan HPP belum akurat.');
  else {
    if (!o.kas) add('info', 'Neraca Awal', 'Kas awal masih Rp0', 'Isi kas & tabungan usaha agar saldo kas sesuai.');
    if (o.rentYear && !o.rentStart) add('warn', 'Neraca Awal', 'Sewa per tahun terisi tetapi tanggal mulai sewa kosong', 'Sewa dibayar dimuka dan jatuh tempo tidak dapat dihitung.');
  }

  // --- Produk
  const bySku = new Map();
  for (const p of P) { const k = nk(p.sku); if (!k) continue; (bySku.get(k) || bySku.set(k, []).get(k)).push(p); }
  for (const [k, ps] of bySku) if (ps.length > 1) add('error', 'Produk', `SKU ganda: ${k}`, `Dipakai oleh ${ps.map(p => p.name).join(', ')}. SKU harus unik agar stok & penjualan tidak tertukar.`);
  const noSku = P.filter(p => !nk(p.sku)); if (noSku.length) add('warn', 'Produk', `${noSku.length} produk tanpa SKU`, noSku.slice(0, 5).map(p => p.name).join(', '));
  const noPrice = P.filter(p => !(n(p.price) > 0)); if (noPrice.length) add('warn', 'Produk', `${noPrice.length} produk berharga Rp0`, noPrice.slice(0, 5).map(p => p.name).join(', '));
  const noCost = P.filter(p => !(n(p.costPrice) > 0)); if (noCost.length) add('info', 'Produk', `${noCost.length} produk belum punya HPP standar`, 'Selisih HPP aktual vs standar baru dinilai bila HPP produk terisi.');

  // --- Persediaan
  const seenItemSku = new Map();
  for (const it of I) { const k = nk(it.sku); if (k) (seenItemSku.get(k) || seenItemSku.set(k, []).get(k)).push(it); }
  for (const [k, its] of seenItemSku) if (its.length > 1) add('error', 'Persediaan', `SKU item ganda: ${k}`, its.map(i => i.name).join(', '));
  for (const it of I.filter(i => i.hasDepan)) {
    const ls = itemLinks(it, P);
    if (!ls.length) add('warn', 'Persediaan', `Item "${it.name}" belum terhubung ke produk kasir`, 'Penjualan tidak akan mengurangi stok item ini.');
    for (const l of (it.links || [])) if (l.productId && !P.some(p => p.id === l.productId)) add('warn', 'Persediaan', `Item "${it.name}" terhubung ke produk yang sudah dihapus`, 'Buka Kelola item dan perbarui tautan produk.');
    const minus = firstMinus(it, E); if (minus) add('error', 'Persediaan', `Saldo "${it.name}" minus sejak ${minus}`, 'Biasanya catatan masuk/naik kurang atau jumlah salah input.');
    // stok produk harus serempak dengan stok depan (qty / pengali)
    const depan = balanceAt(it, E, today).depan;
    for (const l of ls.filter(x => x.product)) {
      const p = l.product, st = p.stock;
      if (st === null || st === undefined || st === '') continue;
      const exp = Math.max(0, Math.round(depan / l.mult * 1000) / 1000); // stok produk tidak pernah negatif
      if (Math.abs(n(st) - exp) > 0.01) add('warn', 'Stok', `Stok "${p.name}" ≠ sisa depan "${it.name}"`, `Stok produk ${n(st)}; sisa depan ${Math.round(depan * 1000) / 1000} ÷ ${l.mult} = ${exp}. Perbedaan wajar bila stok produk diubah manual.`, 'sync-stock');
    }
  }
  // penjualan kasir -> catatan terjual
  let mism = 0;
  const txDates = [...new Set(T.map(t => t.date))];
  for (const it of I.filter(i => i.hasDepan && itemLinks(i, P).length)) for (const dt of txDates) {
    const q = Math.round(posSalesForItem(T, P, it, dt) * 1000) / 1000, e = E.find(x => x.id === `kasir-${it.id}-${dt}`);
    if (Math.abs(q - n(e?.qty)) > 0.0005) mism++;
  }
  if (mism) add('warn', 'Persediaan', `${mism} catatan "Terjual" belum sama dengan transaksi kasir`, 'Dapat terjadi setelah impor/pemulihan data.', 'sync-sales');

  // --- Transaksi
  let bad = 0;
  for (const t of T) {
    const sumItems = (t.items || []).reduce((a, i) => a + n(i.price) * n(i.qty), 0);
    if (!t.date || Math.abs(n(t.subtotal) - sumItems) > 1 || Math.abs(n(t.subtotal) - n(t.discount) - n(t.total)) > 1) bad++;
  }
  if (bad) add('error', 'Transaksi', `${bad} transaksi totalnya tidak cocok dengan rincian item`, 'Buka Riwayat › Edit untuk memperbaiki, lalu simpan ulang.');

  // --- Piutang / hutang otomatis
  const recIds = new Set(R.map(r => r.id)), liaIds = new Set(L.map(l => l.id));
  const tempoNoRec = T.filter(t => t.payment === 'Tempo / Kasbon' && !recIds.has('tx-' + t.id));
  if (tempoNoRec.length) add('error', 'Piutang', `${tempoNoRec.length} transaksi Tempo/Kasbon belum tercatat sebagai piutang`, tempoNoRec.slice(0, 4).map(t => t.invoice).join(', '), 'sync-debts');
  const orphanRec = R.filter(r => r.auto && r.txId && !T.some(t => t.id === r.txId));
  if (orphanRec.length) add('warn', 'Piutang', `${orphanRec.length} piutang otomatis tanpa transaksi`, orphanRec.slice(0, 4).map(r => r.name).join(', '), 'sync-debts');
  const hutangNoRec = X.filter(e => e.payment === 'Hutang' && !liaIds.has('ex-' + e.id));
  if (hutangNoRec.length) add('error', 'Hutang', `${hutangNoRec.length} pengeluaran berstatus Hutang belum tercatat sebagai hutang`, hutangNoRec.slice(0, 4).map(e => e.name).join(', '), 'sync-debts');
  const orphanLia = L.filter(l => l.auto && l.expenseId && !X.some(e => e.id === l.expenseId));
  if (orphanLia.length) add('warn', 'Hutang', `${orphanLia.length} hutang otomatis tanpa pengeluaran`, orphanLia.slice(0, 4).map(l => l.name).join(', '), 'sync-debts');
  for (const x of [...L, ...R]) if (paidOf(x) > n(x.amount) + 0.01) add('error', 'Hutang & Piutang', `Pembayaran melebihi nominal: ${x.name}`, `Dibayar ${rp(paidOf(x))} dari ${rp(x.amount)}.`);
  for (const r of R.filter(r => r.auto && r.txId)) { const t = T.find(t => t.id === r.txId); if (t && Math.abs(n(r.amount) - n(t.total)) > 1) add('warn', 'Piutang', `Nominal piutang ${t.invoice} berbeda dari total transaksi`, `${rp(r.amount)} vs ${rp(t.total)}`, 'sync-debts'); }
  for (const l of L.filter(l => l.auto && l.expenseId)) { const e = X.find(e => e.id === l.expenseId); if (e && Math.abs(n(l.amount) - n(e.amount)) > 1) add('warn', 'Hutang', `Nominal hutang "${l.name}" berbeda dari pengeluarannya`, `${rp(l.amount)} vs ${rp(e.amount)}`, 'sync-debts'); }

  // --- Kas & pembukuan
  if (o.date) {
    const saldo = cashBalanceAt(d, today);
    if (saldo < 0) add('error', 'Kas', `Saldo kas negatif (${rp(saldo)})`, 'Periksa kas awal pada Neraca Awal, pengeluaran, atau pembayaran hutang yang berlebih.');
    const ym = today.slice(0, 7), prev = (() => { const [y, m] = ym.split('-').map(Number); const k = y * 12 + m - 2; return `${Math.floor(k / 12)}-${String((k % 12) + 1).padStart(2, '0')}`; })();
    if (ymOf(o.date) <= prev && !o.stockEnd[prev] && pnl(d, prev + '-01', prev + '-31').hppBeli > 0) add('info', 'Pembukuan', `Persediaan akhir ${prev} belum diisi`, 'HPP bulan itu dianggap sama dengan pembelian. Isi di Pembukuan › Ringkasan.');
  }
  const order = { error: 0, warn: 1, info: 2 };
  return out.sort((a, b) => order[a.level] - order[b.level]);
}
