// Logika murni Stok Bahan Baku & HPP Menu (tanpa DOM / database; diuji di test-bahan-logic.mjs).
//
// Data:
//   materials       { id, code:'B001', name, buyUnit, buyPrice, perBuy, stockUnit, tracked, minStock, note }
//   hppMenus        { id, code:'M01', name, category, sellUnit, price, batch, sku, productId, note,
//                     items:[{ code:'B038', group, qty }] }   qty = per batch, dalam satuan stok bahan
//   materialEntries { id, code, date, kind:'awal'|'masuk'|'pakai'|'rusak'|'opname', qty, note, createdAt }
//   expenses        { ..., materialCode:'B001', qty (satuan beli), amount }   -> belanja bahan
//   transactions    { date, items:[{ productId, sku, qty }] }                  -> pemakaian bahan (resep)
//
// Kaitan dengan Kontrol Persediaan (melalui SKU):
//   - Bahan yang kodenya sama dengan SKU item Persediaan -> stoknya dipantau di Persediaan
//     (belanja dicatat otomatis sebagai "Bahan masuk" di Persediaan; tidak dihitung ganda di sini).
//   - Menu yang produknya terhubung ke SATU item Persediaan bagian depan (masakan) -> bahan dipotong saat
//     dapur mencatat masakan ("Bahan masuk / masak" & "Hasil olahan"), bukan per penjualan.
//   - Selebihnya: belanja menambah stok bahan, penjualan mengurangi stok bahan sesuai resep.
//
// Stok tidak pernah diketik manual: selalu dihitung ulang dari catatan di atas, sehingga mengedit/menghapus
// transaksi atau pengeluaran langsung membetulkan stok (dan aman untuk sinkronisasi antar perangkat).

export const n = v => { const x = Number(v); return Number.isFinite(x) ? x : 0; };
export const normCode = v => String(v ?? '').trim().toUpperCase();
const r6 = v => Math.round(v * 1e6) / 1e6;

export const ENTRY_KINDS = {
  awal: 'Stok awal',
  masuk: 'Masuk lain (tanpa belanja)',
  pakai: 'Pemakaian lain',
  rusak: 'Rusak / terbuang',
  opname: 'Stok opname (hitung fisik)'
};
export const RECIPE_GROUPS = ['Bahan Utama', 'Bumbu', 'Minyak & Lemak', 'Pelengkap', 'Kemasan & Pendukung', 'Lainnya'];

// ---------------- harga & HPP ----------------

/** Harga per satuan stok (mis. Rp75.000/kg, isi 1000 g -> Rp75/g). 0 bila harga belum diisi. */
export function unitCost(m) {
  if (!m) return 0;
  const price = n(m.buyPrice), per = n(m.perBuy) > 0 ? n(m.perBuy) : 1;
  return price > 0 ? price / per : 0;
}

export function indexByCode(list) {
  const map = new Map();
  for (const x of list || []) if (x && normCode(x.code)) map.set(normCode(x.code), x);
  return map;
}

/** HPP satu menu per porsi + rincian baris resep. */
export function menuCost(menu, materials) {
  const mats = materials instanceof Map ? materials : indexByCode(materials);
  const batch = n(menu?.batch) > 0 ? n(menu.batch) : 1;
  const lines = (menu?.items || []).map(it => {
    const m = mats.get(normCode(it.code));
    const qtyPortion = n(it.qty) / batch;
    const uc = unitCost(m);
    return {
      code: normCode(it.code), name: m?.name || '(bahan tidak dikenal)', group: it.group || '', qty: n(it.qty),
      qtyPortion, unit: m?.stockUnit || '', unitCost: uc, cost: qtyPortion * uc, unknown: !m, noPrice: !!m && !(uc > 0)
    };
  });
  const perPortion = lines.reduce((a, l) => a + l.cost, 0);
  const price = n(menu?.price);
  return {
    perPortion,
    perBatch: perPortion * batch,
    profit: price - perPortion,
    pct: price > 0 ? perPortion / price : null,
    lines,
    unknown: lines.filter(l => l.unknown).length,
    noPrice: lines.filter(l => l.noPrice).length
  };
}

/** Status ringkas seperti kolom "Status" di Excel. */
export function menuStatus(cost) {
  if (cost.unknown) return 'Ada kode bahan tidak dikenal';
  if (cost.noPrice) return `${cost.noPrice} bahan belum ada harga`;
  if (cost.pct === null) return 'Harga jual kosong';
  if (cost.pct < 0.15) return 'Cek satuan jual / porsi per batch';
  if (cost.pct > 0.7) return 'Food cost tinggi (>70%)';
  return '';
}

// ---------------- keterhubungan ----------------

/** Produk kasir untuk sebuah menu: productId, lalu SKU produk = sku menu (bawaan: kode menu). */
export function productForMenu(menu, products) {
  if (!menu) return null;
  if (menu.productId) { const p = (products || []).find(x => x.id === menu.productId); if (p) return p; }
  const key = normCode(menu.sku || menu.code);
  return key ? (products || []).find(p => normCode(p.sku) === key) || null : null;
}

/** Peta productId -> menu dan SKU -> menu (untuk mencocokkan baris transaksi). */
export function menuLookup(menus, products) {
  const byProduct = new Map(), bySku = new Map();
  for (const m of menus || []) {
    const p = productForMenu(m, products);
    if (p) byProduct.set(p.id, m);
    const k = normCode(m.sku || m.code);
    if (k) bySku.set(k, m);
    if (p && normCode(p.sku)) bySku.set(normCode(p.sku), m);
  }
  return {
    forItem(it) {
      if (it.productId && byProduct.has(it.productId)) return byProduct.get(it.productId);
      const k = normCode(it.sku);
      return k ? bySku.get(k) || null : null;
    }
  };
}

const linksOfItem = (item, products) => {
  // Sama dengan persediaan-logic.itemLinks (disalin ringkas agar modul ini mandiri).
  const out = [], seen = new Set();
  const push = (p, sku, mult) => {
    const id = p?.id || '', key = normCode(p?.sku || sku);
    const sig = id ? 'id:' + id : 'sku:' + key;
    if ((!id && !key) || seen.has(sig) || (key && seen.has('sku:' + key))) return;
    seen.add(sig); if (key) seen.add('sku:' + key);
    out.push({ productId: id, key, mult: n(mult) > 0 ? n(mult) : 1 });
  };
  for (const l of item.links || []) push((products || []).find(p => p.id === l.productId) || (products || []).find(p => normCode(p.sku) && normCode(p.sku) === normCode(l.sku)) || null, l.sku, l.mult);
  if (!(item.links || []).length && item.productId) push((products || []).find(p => p.id === item.productId) || null, '', 1);
  if (item.sku) push((products || []).find(p => normCode(p.sku) === normCode(item.sku)) || null, item.sku, 1);
  return out;
};

/** Item Persediaan yang memantau sebuah bahan (SKU item = kode bahan, atau material.invItemId). */
export function invItemForMaterial(material, invItems) {
  if (!material) return null;
  if (material.invItemId) { const it = (invItems || []).find(x => x.id === material.invItemId); if (it) return it; }
  const code = normCode(material.code);
  return code ? (invItems || []).find(it => normCode(it.sku) === code) || null : null;
}

const unitKey = u => String(u ?? '').trim().toLowerCase();

/**
 * Jumlah belanja dalam satuan item Persediaan.
 * Item bersatuan sama dengan satuan beli (mis. kg) -> qty belanja apa adanya;
 * selain itu -> dikonversi ke satuan stok bahan (qty × isi per satuan beli).
 */
export function invQtyFromExpense(expense, material, item) {
  const q = n(expense?.qty || 1), per = n(material?.perBuy) > 0 ? n(material.perBuy) : 1;
  const iu = unitKey(item?.unit), bu = unitKey(material?.buyUnit), su = unitKey(material?.stockUnit);
  const qty = iu && iu === bu && iu !== su ? q : q * per;
  return r6(qty);
}

/**
 * Catatan "Bahan masuk" Persediaan yang seharusnya ada untuk belanja bahan yang dipantau di Persediaan.
 * id 'exp-<idPengeluaran>' agar idempoten (dan aman saat beberapa perangkat menghitungnya bersamaan).
 */
export function invEntriesFromExpenses(expenses, materials, invItems) {
  const mats = indexByCode(materials), out = new Map();
  for (const x of expenses || []) {
    const m = mats.get(normCode(x.materialCode)), it = m && invItemForMaterial(m, invItems);
    if (!it || !x.date) continue;
    out.set('exp-' + x.id, { id: 'exp-' + x.id, itemId: it.id, area: 'dapur', kind: 'masuk', qty: invQtyFromExpense(x, m, it), date: x.date,
      note: `Belanja ${m.code} (Pengeluaran)`, source: 'pengeluaran', expenseId: x.id });
  }
  return out;
}

/**
 * Menu yang bahan bakunya dipotong saat produksi di Persediaan.
 * Syarat: produk menu terhubung ke item Persediaan bagian depan, dan item itu hanya mewakili satu menu
 * ber-resep (bila satu item dipakai beberapa menu, tidak bisa dipastikan resep mana -> tetap per penjualan).
 * Hasil: Map menuId -> { item, mult }
 */
export function productionMenus(menus, products, invItems) {
  const out = new Map();
  const withRecipe = (menus || []).filter(m => (m.items || []).length);
  for (const it of (invItems || []).filter(i => i.hasDepan)) {
    const L = linksOfItem(it, products);
    const hits = [];
    for (const m of withRecipe) {
      const p = productForMenu(m, products);
      const key = normCode(p?.sku || m.sku || m.code);
      const l = L.find(x => (p && x.productId === p.id) || (key && x.key === key));
      if (l) hits.push({ m, l });
    }
    // Hanya bila item mewakili tepat satu produk (item untuk banyak produk tidak bisa dipastikan resepnya).
    if (hits.length === 1 && L.length === 1) out.set(hits[0].m.id, { item: it, mult: hits[0].l.mult });
  }
  return out;
}

// ---------------- pergerakan stok ----------------

/**
 * Semua pergerakan stok bahan dari seluruh sumber.
 * Hasil: Map kodeBahan -> [{ date, kind, qty, value?, ref, label, order }]
 *   kind: 'awal' | 'beli' | 'masuk' | 'jual' | 'produksi' | 'pakai' | 'rusak' | 'opname'
 *   qty bertanda (+ masuk, − keluar); opname: qty = hasil hitung fisik (bukan selisih).
 */
export function movements({ materials = [], menus = [], products = [], transactions = [], expenses = [], entries = [], invItems = [], invEntries = [] }) {
  const mats = indexByCode(materials);
  const out = new Map();
  const add = (code, mv) => {
    const k = normCode(code);
    if (!mats.has(k)) return;
    if (!out.has(k)) out.set(k, []);
    out.get(k).push(mv);
  };
  const viaInv = new Set();
  for (const m of materials) if (invItemForMaterial(m, invItems)) viaInv.add(normCode(m.code));

  // 1) catatan manual
  for (const e of entries) {
    if (!e.date || !ENTRY_KINDS[e.kind]) continue;
    const q = n(e.qty);
    const sign = e.kind === 'pakai' || e.kind === 'rusak' ? -1 : 1;
    add(e.code, { date: e.date, kind: e.kind, qty: e.kind === 'opname' ? q : sign * q, ref: e.id, label: ENTRY_KINDS[e.kind] + (e.note ? ' · ' + e.note : ''), order: e.kind === 'opname' ? 9 : e.kind === 'awal' ? 0 : 5, at: n(e.createdAt) });
  }
  // 2) belanja bahan di Pengeluaran
  for (const x of expenses) {
    const code = normCode(x.materialCode);
    if (!code || !x.date) continue;
    const m = mats.get(code);
    if (!m) continue;
    const per = n(m.perBuy) > 0 ? n(m.perBuy) : 1;
    add(code, { date: x.date, kind: 'beli', qty: r6(n(x.qty || 1) * per), value: n(x.amount), ref: x.id, label: `Belanja ${n(x.qty || 1)} ${x.unit || m.buyUnit || ''}`.trim(), order: 1, at: n(x.createdAt) });
  }
  // 3) pemakaian dari penjualan (menu non-produksi)
  const prod = productionMenus(menus, products, invItems);
  const look = menuLookup(menus, products);
  const usage = (menu, porsi, date, kind, ref, label) => {
    const batch = n(menu.batch) > 0 ? n(menu.batch) : 1;
    for (const it of menu.items || []) {
      const q = r6(n(it.qty) / batch * porsi);
      if (q) add(it.code, { date, kind, qty: -q, ref, label, order: 3, at: 0 });
    }
  };
  for (const t of transactions) {
    if (!t.date) continue;
    for (const it of t.items || []) {
      const menu = look.forItem(it);
      if (!menu || prod.has(menu.id)) continue;
      const q = n(it.qty);
      if (q) usage(menu, q, t.date, 'jual', t.id, `Terjual ${q} × ${menu.code} ${menu.name}`);
    }
  }
  // 4) pemakaian dari produksi di Persediaan (menu produksi)
  for (const [menuId, { item, mult }] of prod) {
    const menu = menus.find(m => m.id === menuId);
    for (const e of invEntries) {
      if (e.itemId !== item.id || e.area !== 'dapur' || (e.kind !== 'masuk' && e.kind !== 'hasil') || !e.date) continue;
      const porsi = n(e.qty) / mult;
      if (porsi) usage(menu, porsi, e.date, 'produksi', e.id, `Masak ${item.name}: ${r6(porsi)} porsi (${menu.code})`);
    }
  }
  for (const list of out.values()) list.sort((a, b) => String(a.date).localeCompare(String(b.date)) || a.order - b.order || a.at - b.at);
  // bahan yang dipantau di Persediaan: hanya belanja yang dicatat (sebagai info), bukan stok
  for (const k of viaInv) if (out.has(k)) out.set(k, out.get(k).filter(mv => mv.kind === 'beli'));
  return out;
}

/** Saldo berjalan; opname menetapkan saldo (selisihnya dicatat sebagai penyesuaian). */
export function runBalance(list) {
  let bal = 0;
  return (list || []).map(mv => {
    let delta = mv.qty;
    if (mv.kind === 'opname') { delta = mv.qty - bal; bal = mv.qty; }
    else bal += mv.qty;
    bal = r6(bal);
    return { ...mv, delta: r6(delta), balance: bal };
  });
}

/**
 * Ringkasan stok per bahan untuk periode [from, to].
 * open = saldo sebelum 'from'; buy/use/adjust = jumlah dalam periode; close = saldo akhir 'to'.
 */
export function stockSummary(data, from, to) {
  const mv = movements(data);
  const viaInvOf = m => invItemForMaterial(m, data.invItems || []);
  return (data.materials || []).map(m => {
    const code = normCode(m.code);
    const rows = runBalance(mv.get(code) || []);
    const s = { code, material: m, open: 0, buy: 0, buyValue: 0, use: 0, useSale: 0, useProd: 0, adjust: 0, close: 0, lastBuy: null, rows, invItem: viaInvOf(m) };
    for (const r of rows) {
      if (r.date < from) { s.open = r.balance; continue; }
      if (r.date > to) break;
      if (r.kind === 'beli') { s.buy += r.delta; s.buyValue += n(r.value); s.lastBuy = r.date; }
      else if (r.kind === 'jual') { s.use -= r.delta; s.useSale -= r.delta; }
      else if (r.kind === 'produksi') { s.use -= r.delta; s.useProd -= r.delta; }
      else if (r.kind === 'pakai') s.use -= r.delta;
      else s.adjust += r.delta; // awal, masuk lain, rusak, opname
    }
    const upto = rows.filter(r => r.date <= to);
    s.close = upto.length ? upto[upto.length - 1].balance : 0;
    if (s.invItem) s.close = invDapurBalance(s.invItem, data.invEntries || [], to);
    for (const k of ['buy', 'buyValue', 'use', 'useSale', 'useProd', 'adjust']) s[k] = r6(s[k]);
    // Nilai per satuan yang dipakai: satuan item Persediaan (bila dipantau di sana) atau satuan stok bahan.
    const perUnit = s.invItem ? (n(m.buyPrice) > 0 ? n(m.buyPrice) / invQtyFromExpense({ qty: 1 }, m, s.invItem) : 0) : unitCost(m);
    s.unit = s.invItem ? (s.invItem.unit || m.stockUnit || '') : (m.stockUnit || '');
    s.value = m.tracked === false ? 0 : Math.max(0, s.close) * perUnit;
    s.status = stockStatus(m, s);
    return s;
  });
}

/** Saldo bagian dapur sebuah item Persediaan sampai tanggal 'to' (aturan sama dengan persediaan-logic). */
export function invDapurBalance(item, invEntries, to) {
  let b = 0;
  for (const e of invEntries) {
    if (e.itemId !== item.id || e.area !== 'dapur' || !e.date || e.date > to) continue;
    if (e.kind === 'awal' || e.kind === 'masuk' || e.kind === 'hasil') b += n(e.qty);
    else if (e.kind === 'pakai' || e.kind === 'naik' || e.kind === 'rusak') b -= n(e.qty);
  }
  return r6(b);
}

export function stockStatus(m, s) {
  if (s.invItem) return 'persediaan';
  if (m.tracked === false) return 'tidak';
  if (!s.rows.length) return 'kosong';
  if (s.close < -1e-9) return 'minus';
  if (s.close <= 1e-9) return 'habis';
  if (n(m.minStock) > 0 && s.close <= n(m.minStock)) return 'menipis';
  return 'aman';
}
export const STATUS_LABEL = { aman: 'Aman', menipis: 'Menipis', habis: 'Habis', minus: 'Minus', kosong: 'Belum ada catatan', tidak: 'Tidak dilacak', persediaan: 'Dipantau di Persediaan' };

// ---------------- impor dari Excel ----------------

const norm = s => String(s ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
function headerMap(row, spec) {
  const h = (row || []).map(norm), map = {};
  for (const [key, names] of Object.entries(spec)) {
    const i = h.findIndex(x => names.some(nm => x === nm || x.startsWith(nm)));
    if (i >= 0) map[key] = i;
  }
  return map;
}
function findSheet(book, names) {
  const keys = Object.keys(book);
  return keys.find(k => names.includes(norm(k))) || keys.find(k => names.some(nm => norm(k).includes(nm)));
}
function findHeader(rows, spec, need) {
  for (let i = 0; i < Math.min(rows.length, 10); i++) {
    const map = headerMap(rows[i], spec);
    if (need.every(k => k in map)) return { i, map };
  }
  return null;
}
const yes = v => !/^(tidak|no|n|false|0|tdk)$/i.test(String(v ?? '').trim());
const txt = v => (v === null || v === undefined ? '' : String(v).trim());

/**
 * Membaca workbook format "Format HPP untuk suntik aplikasi kasir" (sheet Bahan_Baku, Menu, Resep).
 * Kolom dikenali dari judulnya, bukan posisinya. Kolom rumus diabaikan (dihitung ulang oleh aplikasi).
 */
export function parseHppWorkbook(book) {
  const warnings = [];
  const out = { materials: [], menus: [], warnings };
  const sb = findSheet(book, ['bahan baku', 'bahan']);
  const sm = findSheet(book, ['menu']);
  const sr = findSheet(book, ['resep']);
  if (!sb) throw new Error('Sheet "Bahan_Baku" tidak ditemukan');
  const B = findHeader(book[sb], {
    code: ['kode bahan'], name: ['nama bahan'], buyUnit: ['satuan beli'], buyPrice: ['harga beli'], perBuy: ['isi per satuan beli', 'isi'],
    stockUnit: ['satuan stok'], tracked: ['dilacak'], minStock: ['stok minimum', 'stok min'], note: ['catatan']
  }, ['code', 'name']);
  if (!B) throw new Error('Judul kolom "Kode Bahan" & "Nama Bahan" tidak ditemukan di sheet ' + sb);
  const seen = new Set();
  for (const r of book[sb].slice(B.i + 1)) {
    const code = normCode(r[B.map.code]);
    if (!code) continue;
    if (seen.has(code)) { warnings.push(`Kode bahan ${code} ganda; baris berikutnya diabaikan`); continue; }
    seen.add(code);
    const g = k => (k in B.map ? r[B.map[k]] : undefined);
    out.materials.push({
      code, name: txt(g('name')) || code, buyUnit: txt(g('buyUnit')), buyPrice: n(g('buyPrice')),
      perBuy: n(g('perBuy')) > 0 ? n(g('perBuy')) : 1, stockUnit: txt(g('stockUnit')) || txt(g('buyUnit')),
      tracked: 'tracked' in B.map ? yes(g('tracked')) : true, minStock: n(g('minStock')), note: txt(g('note'))
    });
  }
  if (sm) {
    const M = findHeader(book[sm], {
      code: ['kode menu'], name: ['nama menu'], category: ['kategori'], sellUnit: ['satuan jual'], price: ['harga jual'],
      batch: ['porsi per batch', 'porsi'], note: ['catatan']
    }, ['code', 'name']);
    if (!M) warnings.push('Judul kolom sheet Menu tidak dikenali; menu tidak diimpor');
    else for (const r of book[sm].slice(M.i + 1)) {
      const code = normCode(r[M.map.code]);
      if (!code || out.menus.some(x => x.code === code)) continue;
      const g = k => (k in M.map ? r[M.map[k]] : undefined);
      out.menus.push({ code, name: txt(g('name')) || code, category: txt(g('category')), sellUnit: txt(g('sellUnit')) || 'porsi', price: n(g('price')), batch: n(g('batch')) > 0 ? n(g('batch')) : 1, note: txt(g('note')), sku: code, items: [] });
    }
  }
  if (sr) {
    const R = findHeader(book[sr], { menu: ['kode menu'], code: ['kode bahan'], group: ['kelompok'], qty: ['qty per batch', 'qty'] }, ['menu', 'code', 'qty']);
    if (!R) warnings.push('Judul kolom sheet Resep tidak dikenali; resep tidak diimpor');
    else for (const r of book[sr].slice(R.i + 1)) {
      const mc = normCode(r[R.map.menu]), bc = normCode(r[R.map.code]);
      if (!mc || !bc) continue;
      const menu = out.menus.find(m => m.code === mc);
      if (!menu) { warnings.push(`Resep untuk menu ${mc} diabaikan: menu tidak ada di sheet Menu`); continue; }
      if (!seen.has(bc)) warnings.push(`Resep ${mc} memakai kode bahan ${bc} yang tidak ada di sheet Bahan`);
      menu.items.push({ code: bc, group: txt(r[R.map.group]), qty: n(r[R.map.qty]) });
    }
  }
  return out;
}

/**
 * Menggabungkan hasil impor dengan data yang ada (kunci: kode). id dipertahankan; data baru diberi id baru.
 * Menu dihubungkan ke produk kasir: SKU = kode menu, atau nama produk sama persis.
 */
export function mergeImport(parsed, existing, products, makeId) {
  const exM = indexByCode(existing.materials), exH = indexByCode(existing.menus);
  const now = Date.now();
  const materials = parsed.materials.map(m => {
    const old = exM.get(m.code);
    return { ...(old || {}), ...m, id: old?.id || makeId(), createdAt: old?.createdAt || now, updatedAt: now, priceDate: old?.priceDate || '' };
  });
  const byName = new Map((products || []).map(p => [norm(p.name), p]));
  const links = { sku: 0, name: 0, none: [] };
  const menus = parsed.menus.map(m => {
    const old = exH.get(m.code);
    const rec = { ...(old || {}), ...m, id: old?.id || makeId(), createdAt: old?.createdAt || now, updatedAt: now };
    if (old?.productId || (old?.sku && old.sku !== old.code)) { rec.productId = old.productId || ''; rec.sku = old.sku; }
    let p = productForMenu(rec, products);
    if (p) links.sku++;
    else {
      p = byName.get(norm(m.name));
      if (p) { rec.productId = p.id; rec.sku = p.sku || rec.sku; links.name++; }
      else links.none.push(m.code + ' ' + m.name);
    }
    return rec;
  });
  return { materials, menus, links };
}
