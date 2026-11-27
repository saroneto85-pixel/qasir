// Logika murni Kontrol Persediaan (Dapur → Depan). Tanpa DOM supaya mudah diuji.
//
// Alur:
//   DAPUR  : stok awal / bahan masuk / hasil olahan  →  dipakai (diolah) · naik ke depan · rusak  →  sisa dapur
//   DEPAN  : naik dari dapur (= stok awal depan) + sisa kemarin  →  penjualan · rusak  →  sisa depan
//
// Semua saldo DIHITUNG dari catatan (invEntries), tidak pernah diketik manual.
// Satu catatan "naik" (area dapur) mengurangi dapur dan menambah depan sekaligus.

export const AREA = { dapur: 'Dapur', depan: 'Depan' };

export const KIND_LABEL = {
  dapur: {
    awal: 'Stok awal dapur',
    masuk: 'Bahan masuk',
    hasil: 'Hasil olahan',
    pakai: 'Dipakai / diolah',
    naik: 'Naik ke depan',
    rusak: 'Rusak / terbuang',
  },
  depan: {
    awal: 'Stok awal depan',
    jual: 'Penjualan',
    rusak: 'Rusak / terbuang',
  },
};

const IN_D = new Set(['awal', 'masuk', 'hasil']);
const OUT_D = new Set(['pakai', 'naik', 'rusak']);
const n = v => Number(v) || 0;
export const pad = x => String(x).padStart(2, '0');
const byTime = (a, b) => String(a.date).localeCompare(String(b.date)) || n(a.createdAt) - n(b.createdAt);

// Tanggal lokal (bukan UTC) supaya catatan jam 00:00–07:00 WIB tidak jatuh ke hari kemarin.
export function localToday(d = new Date()) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function monthRange(ym) {
  const [y, m] = String(ym).split('-').map(Number);
  const last = new Date(y, m, 0).getDate();
  return { from: `${ym}-01`, to: `${ym}-${pad(last)}`, days: last };
}

// Jenis catatan MANUAL yang boleh dipilih untuk sebuah item pada sebuah bagian (sejak 2.12).
//   - Bahan masuk tidak diketik di sini: item terhubung kode bahan menerimanya otomatis dari Stok Bahan Baku
//     (belanja & masuk lain); masakan/menu masuk dapur lewat "Olah jadi menu" (hasil olahan).
//   - Pengecualian: item bahan (dapur saja) yang BELUM diberi kode bahan masih boleh "Bahan masuk" manual.
export function kindsFor(item, area, linked = false) {
  if (area === 'depan') return ['rusak', 'awal']; // penjualan diambil otomatis dari kasir (SKU)
  if (item && item.hasDepan) return ['naik', 'rusak', 'awal'];
  return linked ? ['pakai', 'rusak', 'awal'] : ['masuk', 'pakai', 'rusak', 'awal'];
}

function applyEntry(b, e) {
  const q = n(e.qty);
  if (e.area === 'dapur') {
    if (IN_D.has(e.kind)) b.dapur += q;
    else if (OUT_D.has(e.kind)) b.dapur -= q;
    if (e.kind === 'naik') b.depan += q; // jadi stok awal bagian depan
  } else if (e.area === 'depan') {
    if (e.kind === 'awal') b.depan += q;
    else if (e.kind === 'jual' || e.kind === 'rusak') b.depan -= q;
  }
}

// Tanggal pertama saat saldo akhir hari (dapur/depan) negatif, atau null.
export function firstMinus(item, entries) {
  const mine = entries.filter(e => e.itemId === item.id && e.date).sort(byTime);
  const b = { dapur: 0, depan: 0 };
  let i = 0;
  while (i < mine.length) {
    const date = mine[i].date;
    while (i < mine.length && mine[i].date === date) applyEntry(b, mine[i++]);
    if (b.dapur < -1e-9 || b.depan < -1e-9) return date;
  }
  return null;
}

export function balanceAt(item, entries, date) {
  const b = { dapur: 0, depan: 0 };
  entries.filter(e => e.itemId === item.id && e.date && e.date <= date).sort(byTime).forEach(e => applyEntry(b, e));
  return b;
}

// Ringkasan satu item untuk satu periode (padanan kolom Dashboard Excel).
export function summarize(item, entries, from, to, low = 2) {
  const mine = entries.filter(e => e.itemId === item.id && e.date && e.date <= to).sort(byTime);
  const bal = { dapur: 0, depan: 0 };
  let open = { dapur: 0, depan: 0 }, openTaken = false, minus = false, last = null;
  const p = { awalD: 0, awalF: 0, masuk: 0, hasil: 0, pakai: 0, naik: 0, dRusak: 0, jual: 0, fRusak: 0 };
  const useDays = new Set();
  let i = 0;
  while (i < mine.length) {
    const date = mine[i].date;
    if (!openTaken && date >= from) { open = { ...bal }; openTaken = true; }
    while (i < mine.length && mine[i].date === date) {
      const e = mine[i++], q = n(e.qty);
      if (date >= from) {
        if (e.area === 'dapur') {
          if (e.kind === 'awal') p.awalD += q;
          else if (e.kind === 'masuk') p.masuk += q;
          else if (e.kind === 'hasil') p.hasil += q;
          else if (e.kind === 'pakai') { p.pakai += q; useDays.add(date); }
          else if (e.kind === 'naik') p.naik += q;
          else if (e.kind === 'rusak') p.dRusak += q;
        } else {
          if (e.kind === 'awal') p.awalF += q;
          else if (e.kind === 'jual') { p.jual += q; useDays.add(date); }
          else if (e.kind === 'rusak') p.fRusak += q;
        }
        last = date;
      }
      applyEntry(bal, e);
    }
    if (bal.dapur < -1e-9 || bal.depan < -1e-9) minus = true;
  }
  if (!openTaken) open = { ...bal };

  const awal = open.dapur + open.depan + p.awalD + p.awalF;
  const dMasuk = p.masuk + p.hasil;
  const dKeluar = p.pakai + p.naik;
  const used = p.pakai + p.jual;                 // "Terjual / Dipakai"
  const rusak = p.dRusak + p.fRusak;
  const total = bal.dapur + bal.depan;
  const base = awal + dMasuk;
  const days = useDays.size;
  const avg = days ? used / days : 0;
  const cukup = total <= 0 ? 0 : (avg === 0 ? null : total / avg);
  const selisih = Math.round((base - (used + rusak + total)) * 100) / 100;
  const hasData = mine.length > 0;
  const status = !hasData ? 'KOSONG' : total <= 0 ? 'HABIS' : (cukup !== null && cukup < low ? 'MENIPIS' : 'AMAN');
  const kroscek = selisih !== 0 ? 'SELISIH' : minus ? 'SALDO MINUS' : 'OK';
  return {
    awal, awalD: open.dapur + p.awalD, awalF: open.depan + p.awalF,
    dMasuk, dPakai: p.pakai, dNaik: p.naik, dKeluar, dRusak: p.dRusak, dSisa: bal.dapur,
    fMasuk: p.naik, fJual: p.jual, fRusak: p.fRusak, fSisa: bal.depan,
    used, rusak, total, rusakPct: base ? rusak / base : 0, days, avg, cukup, selisih, kroscek, status, hasData,
    lastDate: last, base,
  };
}

export function summarizeAll(items, entries, from, to, low = 2) {
  const rows = items.map(item => ({ item, ...summarize(item, entries, from, to, low) }));
  const count = {
    items: rows.length,
    aman: rows.filter(r => r.status === 'AMAN').length,
    perlu: rows.filter(r => r.status === 'MENIPIS' || r.status === 'HABIS').length,
    kroscek: rows.filter(r => r.kroscek !== 'OK').length,
    last: rows.reduce((m, r) => (r.lastDate && r.lastDate > m ? r.lastDate : m), ''),
  };
  return { rows, count };
}

// Kartu persediaan harian (padanan sheet per item pada Excel).
export function dailyCard(item, entries, from, to) {
  const mine = entries.filter(e => e.itemId === item.id && e.date && e.date <= to).sort(byTime);
  const bal = { dapur: 0, depan: 0 };
  let i = 0;
  while (i < mine.length && mine[i].date < from) applyEntry(bal, mine[i++]);
  const rows = [];
  const start = Number(from.slice(8)), end = Number(to.slice(8)), ym = from.slice(0, 7);
  for (let d = start; d <= end; d++) {
    const date = `${ym}-${pad(d)}`;
    const r = {
      date, dAwal: bal.dapur, dMasuk: 0, dPakai: 0, dNaik: 0, dRusak: 0, dSisa: 0,
      fAwal: bal.depan, fMasuk: 0, fJual: 0, fRusak: 0, fSisa: 0, has: false,
    };
    while (i < mine.length && mine[i].date === date) {
      const e = mine[i++], q = n(e.qty);
      r.has = true;
      if (e.area === 'dapur') {
        if (e.kind === 'awal' || e.kind === 'masuk' || e.kind === 'hasil') r.dMasuk += q;
        else if (e.kind === 'pakai') r.dPakai += q;
        else if (e.kind === 'naik') { r.dNaik += q; r.fMasuk += q; }
        else if (e.kind === 'rusak') r.dRusak += q;
      } else {
        if (e.kind === 'awal') r.fMasuk += q;
        else if (e.kind === 'jual') r.fJual += q;
        else if (e.kind === 'rusak') r.fRusak += q;
      }
      applyEntry(bal, e);
    }
    r.dSisa = bal.dapur; r.fSisa = bal.depan;
    rows.push(r);
  }
  return rows;
}

// Jumlah terjual dari transaksi kasir untuk satu produk pada satu tanggal.
export function posSales(transactions, productId, date) {
  let q = 0;
  for (const t of transactions || []) {
    if (t.date !== date) continue;
    for (const it of t.items || []) if (it.productId === productId) q += n(it.qty);
  }
  return q;
}

// Jumlah terjual per SKU/kode: baris transaksi cocok bila SKU-nya sama, atau produknya (id) memakai SKU itu.
export function posSalesBySku(transactions, products, sku, date) {
  const k = String(sku || '').trim().toUpperCase();
  if (!k) return 0;
  const ids = new Set((products || []).filter(p => String(p.sku || '').trim().toUpperCase() === k).map(p => p.id));
  let q = 0;
  for (const t of transactions || []) {
    if (t.date !== date) continue;
    for (const it of t.items || []) if (String(it.sku || '').trim().toUpperCase() === k || ids.has(it.productId)) q += n(it.qty);
  }
  return q;
}


// ---------- keterkaitan item persediaan <-> banyak produk kasir ----------
// item.links = [{ productId, sku, mult }]  (mult = stok item terpakai per 1 produk terjual, default 1)
// SKU milik item sendiri juga ikut dihitung (mult 1). Data lama (item.productId) tetap terbaca.
const normS = s => String(s ?? '').trim().toUpperCase();
export function itemLinks(item, products = []) {
  if (!item) return [];
  const out = [], seen = new Set();
  const push = (product, sku, mult) => {
    const id = product?.id || '', key = normS(product?.sku || sku);
    const sig = id ? 'id:' + id : 'sku:' + key;
    if (!id && !key) return;
    if (seen.has(sig) || (key && seen.has('sku:' + key))) return;
    seen.add(sig); if (key) seen.add('sku:' + key);
    out.push({ productId: id, sku: product?.sku || sku || '', key, mult: Number(mult) > 0 ? Number(mult) : 1, product: product || null });
  };
  for (const l of item.links || []) push(products.find(p => p.id === l.productId) || products.find(p => normS(p.sku) && normS(p.sku) === normS(l.sku)) || null, l.sku, l.mult);
  if (!(item.links || []).length && item.productId) push(products.find(p => p.id === item.productId) || null, '', 1);
  if (item.sku) push(products.find(p => normS(p.sku) === normS(item.sku)) || null, item.sku, 1);
  return out;
}
// Jumlah stok item terpakai pada 'date' = sum(qty terjual x mult) untuk semua produk yang terhubung.
export function posSalesForItem(transactions, products, item, date) {
  const L = itemLinks(item, products);
  if (!L.length) return 0;
  const byId = new Map(L.filter(l => l.productId).map(l => [l.productId, l.mult])), byKey = new Map(L.filter(l => l.key).map(l => [l.key, l.mult]));
  let q = 0;
  for (const t of transactions || []) {
    if (t.date !== date) continue;
    for (const it of t.items || []) {
      const p = products.find(x => x.id === it.productId);
      let m = byId.get(it.productId);
      if (m === undefined) m = byKey.get(normS(it.sku)) ?? byKey.get(normS(p?.sku));
      if (m !== undefined) q += n(it.qty) * m;
    }
  }
  return q;
}

// Daftar item contoh (nama & satuan dari file Kontrol Stok). Tanpa angka stok.
// Catatan: "Dencis" di Excel satu sheet; di sini dipecah menjadi ikan segar → ikan goreng (perantara) → dua menu (sambal, bakar).
export const SEED_ITEMS = [
  { name: 'Rendang', sku: '', unit: '', hasDepan: true },
  { name: 'Ayam Utuh', unit: '', hasDepan: true },
  { name: 'Ayam Potong', unit: '', hasDepan: true },
  { name: 'Nila Besar', unit: '', hasDepan: true },
  { name: 'Kembung', unit: '', hasDepan: true },
  { name: 'Nila Kecil', unit: '', hasDepan: true },
  { name: 'Dencis Sambal', unit: '', hasDepan: true },
  { name: 'Dencis Bakar', unit: '', hasDepan: true },
  { name: 'Beras', unit: '', hasDepan: true },
  { name: 'Ikan Dencis Segar', unit: '', hasDepan: false },
  { name: 'Ikan Dencis Goreng', unit: '', hasDepan: false },
  { name: 'Minyak Goreng', unit: 'liter', hasDepan: false },
  { name: 'Telur', unit: 'buah', hasDepan: false },
];
