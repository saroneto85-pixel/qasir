// Kartu "Pemeriksaan data" di Pengaturan: jalankan audit konsistensi & perbaiki otomatis yang aman.
import { all, put, del } from './db.js';
import { auditData } from './audit.js';
import { balanceAt, itemLinks } from './persediaan-logic.js';
import { localToday, remainOf } from './pembukuan-logic.js';

const $ = id => document.getElementById(id);
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const FIXES = {
  'sync-debts': 'Sinkronkan piutang & hutang otomatis',
  'sync-stock': 'Samakan stok produk dengan sisa depan',
  'sync-sales': 'Sinkronkan "Terjual" dengan kasir',
};
export async function runAudit() {
  const d = await window.bookData();
  d.invItems = await all('invItems'); d.invEntries = await all('invEntries');
  const list = auditData(d, localToday());
  const box = $('auditResult');
  const lvl = { error: ['Perlu diperbaiki', 'bad'], warn: ['Perhatian', 'mid'], info: ['Info', ''] };
  const fixes = [...new Set(list.map(i => i.fix).filter(Boolean))];
  box.innerHTML = (list.length ? '' : '<div class="warn ok">✔ Tidak ditemukan pertentangan data. Alur Neraca Awal → Persediaan → Kasir → Pengeluaran → Pembukuan konsisten.</div>')
    + list.map(i => `<div class="audit-item ${lvl[i.level][1]}"><div class="top"><b>${esc(i.title)}</b><span class="status ${lvl[i.level][1]}">${lvl[i.level][0]}</span></div><small>${esc(i.area)}${i.detail ? ' · ' + esc(i.detail) : ''}</small></div>`).join('')
    + (fixes.length ? `<div class="audit-fixes">${fixes.map(f => `<button class="outline" data-fix="${f}">${FIXES[f]}</button>`).join('')}</div>` : '')
    + `<small class="muted">Diperiksa ${new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })} · ${list.filter(i => i.level === 'error').length} perlu diperbaiki, ${list.filter(i => i.level === 'warn').length} perhatian, ${list.filter(i => i.level === 'info').length} info</small>`;
}
async function doFix(code) {
  const T = await all('transactions'), X = await all('expenses');
  if (code === 'sync-debts') {
    const api = window.KSfix;
    for (const t of T) await api.syncTxReceivable(t);
    for (const e of X) await api.syncExpenseDebt(e);
    for (const r of await all('receivables')) if (r.auto && r.txId && !T.some(t => t.id === r.txId) && !(r.payments || []).length) await del('receivables', r.id);
    for (const l of await all('liabilities')) if (l.auto && l.expenseId && !X.some(e => e.id === l.expenseId) && !(l.payments || []).length) await del('liabilities', l.id);
  } else if (code === 'sync-stock') {
    const P = await all('products'), I = await all('invItems'), E = await all('invEntries'), today = localToday();
    for (const it of I.filter(i => i.hasDepan)) {
      const depan = balanceAt(it, E, today).depan;
      for (const l of itemLinks(it, P).filter(x => x.product)) {
        const p = (await all('products')).find(x => x.id === l.product.id);
        if (p && p.stock !== null && p.stock !== undefined && p.stock !== '') await put('products', { ...p, stock: Math.max(0, Math.round(depan / l.mult * 1000) / 1000) });
      }
    }
  } else if (code === 'sync-sales') {
    for (const dt of [...new Set(T.map(t => t.date))].sort()) await window.invSyncSale?.(dt);
  }
  await window.refreshAll?.();
  window.toast?.('Perbaikan selesai');
  await runAudit();
}
if ($('auditPanel')) {
  $('auditRun').onclick = runAudit;
  $('auditResult').addEventListener('click', async e => { const b = e.target.closest('[data-fix]'); if (!b) return; if (confirm(`${FIXES[b.dataset.fix]}?\nPerubahan ini menimpa nilai yang tersimpan agar sesuai sumber datanya.`)) await doFix(b.dataset.fix); });
}
