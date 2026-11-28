// Izin akses perangkat tambahan (diatur di Perangkat Utama). Aturan tabel = cerminan SyncPerms.java;
// server sudah menyaring data, modul ini menyembunyikan menu, kotak, tombol, dan angka di layar.

export const PAGE_LABELS = {
  transaction: 'Transaksi Baru (kasir)',
  history: 'Riwayat transaksi',
  customers: 'Pelanggan',
  products: 'Kelola Produk',
  inventory: 'Kontrol Persediaan',
  bahan: 'Stok Bahan Baku (termasuk harga beli bahan)',
  hpp: 'HPP Menu',
  expenses: 'Pengeluaran',
  debts: 'Hutang & Piutang',
  assets: 'Aset & Penyusutan',
  neraca: 'Neraca Awal',
  pembukuan: 'Pembukuan (laba rugi & kas)',
  evaluasi: 'Evaluasi Usaha',
  settings: 'Pengaturan toko (profil, kasir, struk, PIN, pemeriksaan data)'
};
export const FEATURE_LABELS = {
  cost: 'Lihat HPP / harga modal & laba',
  txEdit: 'Edit & hapus transaksi tersimpan',
  salary: 'Data & pembayaran gaji karyawan',
  data: 'Cadangkan, pulihkan, ekspor & hapus data'
};
export const PAGES = Object.keys(PAGE_LABELS);
export const FEATURES = Object.keys(FEATURE_LABELS);
export const PRESETS = {
  kasir: { label: 'Kasir', keys: ['transaction', 'history', 'customers'] },
  pelayan: { label: 'Pelayan', keys: ['transaction', 'history'] },
  dapur: { label: 'Dapur', keys: ['inventory', 'bahan'] },
  penuh: { label: 'Penuh (owner)', keys: [...PAGES, ...FEATURES] }
};
/** Menu yang memperlihatkan laba/HPP otomatis membuka izin "cost". */
const IMPLIES_COST = ['hpp', 'pembukuan', 'evaluasi', 'neraca'];
const ALWAYS = new Set(['products', 'categories', 'settings', 'customers', 'transactions', 'receivables', 'cashiers', 'tables', 'orders', 'stockMovements']);
const READ = {
  openingBalance: ['neraca', 'pembukuan', 'evaluasi'],
  assets: ['assets', 'neraca', 'pembukuan', 'evaluasi'],
  liabilities: ['debts', 'pembukuan', 'evaluasi'],
  expenses: ['expenses', 'bahan', 'pembukuan', 'evaluasi'],
  expenseTypes: ['expenses', 'bahan', 'pembukuan', 'evaluasi'],
  expenseItems: ['expenses', 'bahan', 'pembukuan', 'evaluasi'],
  employees: ['salary'],
  salaryPayments: ['salary'],
  invItems: ['inventory', 'bahan'],
  invEntries: ['inventory', 'bahan'],
  materials: ['bahan', 'hpp'],
  hppMenus: ['bahan', 'hpp'],
  materialEntries: ['bahan', 'hpp']
};

export function normalize(keys) {
  if (typeof keys === 'string') { try { keys = JSON.parse(keys); } catch { keys = []; } }
  if (!Array.isArray(keys)) keys = [];
  const s = new Set(keys.filter(k => PAGES.includes(k) || FEATURES.includes(k)));
  if (IMPLIES_COST.some(k => s.has(k))) s.add('cost');
  return [...s].sort();
}

/** keys = null -> akses penuh (Perangkat Utama / mode Mandiri). */
export function makePerms(keys) {
  const full = keys === null || keys === undefined;
  const set = new Set(full ? [] : normalize(keys));
  const has = k => full || set.has(k);
  const canRead = store => {
    if (full || ALWAYS.has(store)) return true;
    const need = READ[store];
    if (!need) return false;
    return need.some(k => (k.endsWith('+cost') ? has(k.slice(0, -5)) && has('cost') : has(k)));
  };
  return {
    full, keys: full ? null : [...set].sort(), has, canRead,
    canPage: p => p === 'dashboard' || p === 'settings' || p === 'reports' || has(p) // Laporan penjualan terbuka untuk semua; Pengaturan untuk Perangkat & printer
  };
}

// ---------------- status berjalan ----------------
const LS = 'kasirPerms';
let current = makePerms(readStored());
const listeners = new Set();

function readStored() {
  try { const v = typeof localStorage !== 'undefined' ? localStorage.getItem(LS) : null; return v ? JSON.parse(v) : null; } catch { return null; }
}

export function setPermKeys(keys) {
  const next = makePerms(keys);
  const same = JSON.stringify(next.keys) === JSON.stringify(current.keys);
  current = next;
  try { if (typeof localStorage !== 'undefined') { if (keys === null || keys === undefined) localStorage.removeItem(LS); else localStorage.setItem(LS, JSON.stringify(next.keys)); } } catch { /* abaikan */ }
  if (!same) for (const fn of listeners) { try { fn(current); } catch (e) { console.warn(e); } }
  applyPerms();
}
export const perms = () => current;
export const onPerms = fn => { listeners.add(fn); return () => listeners.delete(fn); };

// ---------------- penerapan di layar ----------------
const SETTINGS_SECTIONS = { 'Profil toko': 'settings', 'Kasir': 'settings', 'Aplikasi': 'settings', 'Data & perangkat': 'data' };
const DATA_BUTTONS = ['backupData', 'clearData', 'exportReport', 'exportExpenses', 'bahanExport', 'hppExport', 'exportAssets', 'exportDebts', 'exportCustomers', 'customerTemplate'];

export function applyPerms() {
  if (typeof document === 'undefined') return;
  const P = current, body = document.body;
  if (!body) return;
  body.classList.toggle('perm-limited', !P.full);
  for (const k of [...PAGES, ...FEATURES]) body.classList.toggle('no-' + k, !P.has(k));
  // menu samping & kotak Menu Utama
  document.querySelectorAll('.nav[data-page]').forEach(el => { el.hidden = !P.canPage(el.dataset.page); });
  document.querySelectorAll('.dashboard-menu-card').forEach(el => {
    const m = /showPage\('([a-z]+)'\)/.exec(el.getAttribute('onclick') || '');
    if (m) el.hidden = !P.canPage(m[1]);
  });
  const bt = document.getElementById('bottomTransaction');
  if (bt) bt.hidden = !P.has('transaction');
  // kartu beranda
  const hideCard = (id, ok) => { const a = document.getElementById(id)?.closest('article, .panel'); if (a) a.hidden = !ok; };
  hideCard('todayProfit', P.has('cost'));
  hideCard('rProfit', P.has('pembukuan')); // laba bersih = hasil Pembukuan
  hideCard('todayExpense', P.has('expenses'));
  const inv = document.getElementById('invDashPanel');
  if (inv) inv.hidden = !P.has('inventory');
  // Pengaturan: bagian per izin (Perangkat/sinkronisasi & printer selalu tampil)
  document.querySelectorAll('#settings .settings-grid > div').forEach(div => {
    const h = div.querySelector('h2')?.textContent.trim();
    const need = SETTINGS_SECTIONS[h];
    if (need) div.hidden = !P.has(need);
  });
  for (const id of ['receiptSettings', 'auditPanel', 'payAccPanel']) { const el = document.getElementById(id); if (el) el.hidden = !P.has('settings'); }
  for (const id of DATA_BUTTONS) { const el = document.getElementById(id); if (el) el.hidden = !P.has('data'); }
  const restore = document.getElementById('restoreFile')?.closest('label');
  if (restore) restore.hidden = !P.has('data');
  const pCost = document.getElementById('pCost')?.closest('label');
  if (pCost) pCost.hidden = !P.has('cost');
  const edit = document.getElementById('editTransaction');
  if (edit) edit.hidden = !P.has('txEdit');
}

/** Dipakai sebelum membuka halaman / menjalankan aksi; menampilkan pesan bila ditolak. */
export function guard(key, what) {
  const ok = key.startsWith('page:') ? current.canPage(key.slice(5)) : current.has(key);
  if (!ok) (globalThis.toast || (m => alert(m)))(`${what || 'Fitur ini'} tidak diizinkan untuk perangkat ini. Minta owner mengubah akses di Perangkat Utama.`);
  return ok;
}

if (typeof window !== 'undefined') {
  window.kasirPerms = { perms, guard, can: k => current.has(k), canPage: p => current.canPage(p), apply: applyPerms };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', applyPerms); else applyPerms();
}
