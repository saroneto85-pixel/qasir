// Uji ujung-ke-ujung sinkronisasi antar perangkat:
//  - server uji Java (SyncCore asli, rute sama dengan Ktor LanServer)
//  - 3 "perangkat" Node, masing-masing SQLite sendiri + sync-engine.js asli
// Jalankan: node test-sync-e2e.mjs   (butuh JDK: javac & java)
import { spawn, execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { createSyncEngine, SV } from './sync-engine.js';

const require = createRequire(import.meta.url);
const { DatabaseSync } = require('node:sqlite');
const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
const ok = (c, name) => { if (c) pass++; else { fail++; console.log('GAGAL:', name); } };
const eq = (a, b, name) => { const c = JSON.stringify(a) === JSON.stringify(b); if (!c) console.log('  diperoleh :', JSON.stringify(a), '\n  diharapkan:', JSON.stringify(b)); ok(c, name); };

const STORES = ['products', 'transactions', 'expenses', 'settings', 'customers', 'employees', 'salaryPayments', 'expenseTypes', 'expenseItems', 'categories', 'tables', 'orders', 'stockMovements', 'assets', 'liabilities', 'receivables', 'openingBalance', 'invItems', 'invEntries', 'cashiers'];

// ---------- server uji Java ----------
const out = mkdtempSync(join(tmpdir(), 'kasir-sync-'));
const N = 'android-native/src/main/java/id/kasmini/pos/sync/';
execFileSync('javac', ['-d', out, N + 'MiniJson.java', N + 'SyncMerge.java', N + 'SyncStore.java', N + 'SyncCore.java',
  'android-native/test/MemorySyncStore.java', 'android-native/test/SyncTestServer.java'], { stdio: ['ignore', 'ignore', 'inherit'] });
const java = spawn('java', ['-cp', out, 'SyncTestServer'], { stdio: ['ignore', 'pipe', 'inherit'] });
const port = await new Promise((res, rej) => {
  let buf = '';
  java.stdout.on('data', d => { buf += d; const m = buf.match(/READY (\d+)/); if (m) res(Number(m[1])); });
  java.on('exit', c => rej(new Error('server Java berhenti ' + c)));
});
const BASE = `http://127.0.0.1:${port}`;
async function http(method, path, body, headers = {}) {
  const r = await fetch(BASE + path, { method, body: body ?? undefined, headers: { 'Content-Type': 'application/json', ...headers } });
  return { status: r.status, body: await r.text() };
}
const local = async p => JSON.parse((await http('GET', p)).body);

// ---------- SQLite perangkat (meniru API @capacitor-community/sqlite) ----------
function makeDb() {
  const d = new DatabaseSync(':memory:');
  d.exec(`CREATE TABLE pos_records (store_name TEXT NOT NULL, id TEXT NOT NULL, payload TEXT NOT NULL, PRIMARY KEY (store_name, id));
    CREATE TABLE sync_outbox (store_name TEXT NOT NULL, id TEXT NOT NULL, op TEXT NOT NULL, payload TEXT, base_rev INTEGER, base_payload TEXT, seq INTEGER NOT NULL, PRIMARY KEY (store_name, id));
    CREATE TABLE sync_meta (k TEXT PRIMARY KEY, v TEXT);`);
  const v = a => (a || []).map(x => x === undefined ? null : x);
  return {
    async query(sql, values) { await sleep(0); return { values: d.prepare(sql).all(...v(values)).map(r => ({ ...r })) }; },
    async run(sql, values) { await sleep(0); const r = d.prepare(sql).run(...v(values)); return { changes: { changes: Number(r.changes) } }; },
    async executeSet(set) {
      await sleep(0);
      d.exec('BEGIN');
      try { for (const s of set) d.prepare(s.statement).run(...v(s.values)); d.exec('COMMIT'); }
      catch (e) { d.exec('ROLLBACK'); throw e; }
      return { changes: { changes: set.length } };
    }
  };
}

// ---------- plugin palsu ----------
function serverPlugin() {
  const st = { mode: 'standalone', deviceId: 'devA', serverAutoStart: true };
  const self = {
    st,
    async getState() { const s = st.mode === 'server' ? await local('/local/state') : {}; return { ...st, ...s, serverRunning: st.mode === 'server' }; },
    async setMode({ mode }) { st.mode = mode; return self.getState(); },
    async seed({ body, reset, storeName }) { const r = await http('POST', `/local/seed?reset=${reset ? 1 : 0}&name=${encodeURIComponent(storeName || '')}`, body); return JSON.parse(r.body); },
    async startServer() { return self.getState(); },
    async setStoreName() { return {}; },
    async push({ body }) { return http('POST', '/local/push', body); },
    async pull({ since, wait }) { return http('GET', `/local/pull?since=${since}&wait=${wait}`); }
  };
  return self;
}
function clientPlugin(id) {
  const st = { mode: 'standalone', deviceId: id, token: '', storeId: '', deviceCode: '', offline: false, delayPush: 0, delayAfterPush: 0 };
  const hdr = () => ({ 'X-Kasir-Token': st.token, 'X-Kasir-Store': st.storeId });
  const self = {
    st,
    async getState() { return { mode: st.mode, deviceId: id, deviceCode: st.deviceCode, storeId: st.storeId, paired: !!st.token }; },
    async pair({ code, name }) {
      const r = await http('POST', '/api/pair', JSON.stringify({ code, name, deviceId: id }));
      if (r.status !== 200) throw new Error(JSON.parse(r.body).error);
      const j = JSON.parse(r.body);
      Object.assign(st, { token: j.token, storeId: j.storeId, deviceCode: j.deviceCode, mode: 'client' });
      return self.getState();
    },
    async setMode({ mode }) { st.mode = mode; return self.getState(); },
    async push({ body }) {
      if (st.offline) throw new Error('offline');
      if (st.delayPush) await sleep(st.delayPush);
      const r = await http('POST', '/api/push', body, hdr());
      if (st.delayAfterPush) await sleep(st.delayAfterPush); // balasan terlambat tiba
      return r;
    },
    async pull({ since, wait }) {
      if (st.offline) { await sleep(20); throw new Error('offline'); }
      return http('GET', `/api/changes?since=${since}&wait=${wait}`, null, hdr());
    }
  };
  return self;
}

// ---------- perangkat ----------
let uidN = 0;
const uid = () => 'x' + (++uidN).toString(36) + Math.random().toString(36).slice(2, 6);
function device(name, plugin) {
  const db = makeDb();
  const remote = [];
  const engine = createSyncEngine({
    db, plugin, storeNames: STORES, pushDelay: 5, waitSec: 1,
    sleep: ms => sleep(Math.min(ms, 60)), onRemoteChange: s => remote.push(...s), log: { warn() {} }
  });
  const dev = {
    name, db, plugin, engine, remote,
    put: (s, o) => engine.layer.put(s, o),
    del: (s, id) => engine.layer.del(s, id),
    async all(s) { return (await db.query('SELECT payload FROM pos_records WHERE store_name = ? ORDER BY rowid', [s])).values.map(r => JSON.parse(r.payload)); },
    async get(s, id) { return (await dev.all(s)).find(x => x.id === id); },
    async sell(pid, qty) { // meniru afterSale: baca produk -> simpan transaksi -> kurangi stok
      const p = (await dev.all('products')).find(x => x.id === pid);
      await dev.put('transactions', { id: uid(), items: [{ productId: pid, qty }], total: qty * p.price, by: name });
      await dev.put('products', { ...p, stock: p.stock - qty });
    },
    async pending() { return (await db.query('SELECT COUNT(*) AS n FROM sync_outbox', [])).values[0].n; }
  };
  return dev;
}

const clean = (s, o) => { const x = { ...o }; delete x[SV]; if (s === 'settings') delete x.lastCashier; return x; };
async function dumpDevice(d) {
  const rows = (await d.db.query('SELECT store_name, id, payload FROM pos_records ORDER BY store_name, id', [])).values;
  return rows.map(r => [r.store_name, r.id, clean(r.store_name, JSON.parse(r.payload))]);
}
async function dumpServer() {
  const d = await local('/local/dump');
  return d.changes.filter(c => !c.d).map(c => [c.s, c.id, c.p]).sort((a, b) => (a[0] + '\u0001' + a[1]) < (b[0] + '\u0001' + b[1]) ? -1 : 1);
}
async function settle(devs, ms = 10000) {
  // Konvergen = tidak ada antrean, semua kursor = revisi terakhir server, dan revisi server tidak
  // berubah selama pemeriksaan (dicek dua kali berturut-turut).
  const end = Date.now() + ms;
  let stable = 0;
  while (Date.now() < end) {
    const latest = (await local('/local/state')).latest;
    let all = true;
    for (const d of devs) {
      if (await d.pending() || d.engine.state().cursor !== latest) { all = false; break; }
    }
    if (all && (await local('/local/state')).latest === latest) { if (++stable >= 2) return true; }
    else stable = 0;
    await sleep(25);
  }
  for (const d of devs) console.log('  ', d.name, 'pending', await d.pending(), 'cursor', d.engine.state().cursor, d.engine.state().lastError);
  throw new Error('perangkat tidak konvergen');
}
async function sameEverywhere(devs, label) {
  const srv = JSON.stringify(await dumpServer());
  for (const d of devs) eq(JSON.stringify(await dumpDevice(d)) === srv, true, `${label}: data ${d.name} = data induk`);
}

try {
  // 1) Kasir Induk (A) dengan data lama
  const A = device('A', serverPlugin());
  await A.engine.start();
  await A.put('settings', { id: 'main', name: 'Bumbu Lengkep', lastCashier: 'Ani', expenseTypes: ['Bahan baku', 'Gaji'] });
  await A.put('products', { id: 'p1', name: 'Rendang', sku: 'RD', price: 15000, stock: 10 });
  await A.put('products', { id: 'p2', name: 'Es Teh', sku: 'ET', price: 5000, stock: null });
  await A.put('transactions', { id: 't0', items: [], total: 0 });
  eq(await A.pending(), 0, 'mandiri: tidak ada antrean kirim');
  await A.engine.becomeServer({ storeName: 'Bumbu Lengkep' });
  eq(A.engine.state().mode, 'server', 'A menjadi Perangkat Utama');
  eq((await local('/local/state')).records, 4, 'Room terisi 4 record');
  ok(typeof (await A.get('products', 'p1'))[SV] === 'number', 'record lokal A punya nomor revisi');
  eq((await A.get('settings', 'main')).lastCashier, 'Ani', 'kolom per-perangkat A tetap');
  const srvSettings = (await dumpServer()).find(r => r[0] === 'settings')[2];
  ok(!('lastCashier' in srvSettings), 'kolom per-perangkat tidak dikirim ke induk');

  // 2) Perangkat tambahan B (punya data lama) & C bergabung
  const B = device('B', clientPlugin('devB'));
  await B.engine.start();
  await B.put('products', { id: 'old', name: 'Data lama B', stock: 1 });
  let backedUp = [];
  const code = (await local('/local/state')).pairCode;
  let failed = '';
  try { await B.engine.join({ code: '000000', name: 'Tablet', backup: async r => { backedUp = r; } }); } catch (e) { failed = e.message; }
  ok(/salah/i.test(failed), 'kode pairing salah ditolak');
  eq(B.engine.state().mode, 'standalone', 'gagal pairing: B tetap mandiri');
  await B.engine.join({ code, name: 'Tablet Pelayan', backup: async r => { backedUp = r; } });
  eq(backedUp.length, 1, 'cadangan data lama B dibuat sebelum diganti');
  ok(!(await B.get('products', 'old')), 'data lama B diganti data toko');
  eq(B.plugin.st.deviceCode, 'K2', 'B mendapat kode perangkat K2');
  const C = device('C', clientPlugin('devC'));
  await C.engine.start();
  await C.engine.join({ code, name: 'HP Dapur' });
  eq(C.plugin.st.deviceCode, 'K3', 'C mendapat kode perangkat K3');
  await settle([A, B, C]);
  await sameEverywhere([A, B, C], 'setelah bergabung');

  // 3) Tiga kasir menjual produk yang sama pada saat bersamaan
  await Promise.all([A.sell('p1', 1), B.sell('p1', 1), C.sell('p1', 1)]);
  await settle([A, B, C]);
  for (const d of [A, B, C]) eq((await d.get('products', 'p1')).stock, 7, `penjualan serentak: stok di ${d.name} = 7`);
  eq((await A.all('transactions')).length, 4, 'semua transaksi sampai di Kasir Induk');
  ok(B.remote.includes('products') && B.remote.includes('transactions'), 'B diberi tahu ada perubahan dari perangkat lain');
  await sameEverywhere([A, B, C], 'penjualan serentak');

  // 4) B offline: tetap jualan & tambah pelanggan; A mengubah nama produk dan menjual
  B.plugin.st.offline = true;
  await sleep(1200);
  await B.sell('p1', 2);
  await B.put('customers', { id: 'c1', name: 'Pak Budi', phone: '0812' });
  await A.put('products', { ...(await A.get('products', 'p1')), name: 'Rendang Padang' });
  await A.sell('p1', 1);
  await sleep(150);
  ok(await B.pending() > 0, 'offline: perubahan B menunggu di antrean');
  eq((await C.get('products', 'p1')).name, 'Rendang Padang', 'C menerima ubahan A walau B offline');
  B.plugin.st.offline = false;
  await settle([A, B, C], 15000);
  for (const d of [A, B, C]) {
    const p = await d.get('products', 'p1');
    eq([p.name, p.stock], ['Rendang Padang', 4], `setelah B online: ${d.name} punya nama baru & stok 4`);
  }
  eq((await C.get('customers', 'c1'))?.name, 'Pak Budi', 'pelanggan dari B (offline) sampai di C');
  await sameEverywhere([A, B, C], 'setelah offline');

  // 5) Kolom per-perangkat (kasir aktif) tidak saling menimpa
  await B.put('settings', { ...(await B.get('settings', 'main')), lastCashier: 'Budi' });
  await A.put('settings', { ...(await A.get('settings', 'main')), name: 'Bumbu Lengkep 2' });
  await settle([A, B, C]);
  eq([(await A.get('settings', 'main')).lastCashier, (await A.get('settings', 'main')).name], ['Ani', 'Bumbu Lengkep 2'], 'A: kasir aktif tetap Ani, nama toko baru');
  eq([(await B.get('settings', 'main')).lastCashier, (await B.get('settings', 'main')).name], ['Budi', 'Bumbu Lengkep 2'], 'B: kasir aktif tetap Budi, nama toko baru');

  // 6) Daftar jenis pengeluaran ditambah serentak di dua perangkat
  const sA = await A.get('settings', 'main'), sC = await C.get('settings', 'main');
  await Promise.all([
    A.put('settings', { ...sA, expenseTypes: [...sA.expenseTypes, 'Listrik'] }),
    C.put('settings', { ...sC, expenseTypes: [...sC.expenseTypes, 'Transportasi'] })
  ]);
  await settle([A, B, C]);
  eq((await B.get('settings', 'main')).expenseTypes.slice().sort(), ['Bahan baku', 'Gaji', 'Listrik', 'Transportasi'], 'tambahan daftar dari dua perangkat sama-sama tersimpan');

  // 7) Hapus di C sementara B mengedit data yang sama -> tetap terhapus di semua perangkat
  const cust = await B.get('customers', 'c1');
  B.plugin.st.offline = true;
  await B.put('customers', { ...cust, phone: '0899' });
  await C.del('customers', 'c1');
  await settle([A, C]);
  B.plugin.st.offline = false;
  await settle([A, B, C], 15000);
  for (const d of [A, B, C]) ok(!(await d.get('customers', 'c1')), `hapus menang: pelanggan hilang di ${d.name}`);

  // 8) Mengubah lagi saat pengiriman sebelumnya masih berjalan (tidak boleh dobel/hilang)
  const before = (await C.get('products', 'p1')).stock;
  C.plugin.st.delayPush = 200;
  await C.sell('p1', 1);
  await sleep(60);
  await C.sell('p1', 1);
  await B.sell('p1', 1);
  await settle([A, B, C], 15000);
  C.plugin.st.delayPush = 0;
  for (const d of [A, B, C]) eq((await d.get('products', 'p1')).stock, before - 3, `edit saat kirim: stok di ${d.name} = ${before - 3}`);
  await sameEverywhere([A, B, C], 'edit saat kirim');

  // 8b) Objek dibaca dari versi lama, lalu versi baru (isi sama) masuk sebelum disimpan
  const staleRead = await B.get('products', 'p1');
  await A.sell('p1', 1);
  await settle([A, B, C]);
  eq((await B.get('products', 'p1')).stock, staleRead.stock - 1, '8b: B sudah menerima penjualan A');
  await B.put('products', { ...staleRead, stock: staleRead.stock - 1 }); // penjualan B dari bacaan lama
  await settle([A, B, C]);
  for (const d of [A, B, C]) eq((await d.get('products', 'p1')).stock, staleRead.stock - 2, `8b: penjualan dari bacaan lama tetap dihitung (${d.name})`);

  // 8c) Balasan push terlambat, sementara versi lebih baru dari A sudah lewat di pull
  B.plugin.st.delayAfterPush = 500;
  const s0 = (await B.get('products', 'p1')).stock;
  await B.sell('p1', 1);
  await sleep(120);
  await A.put('products', { ...(await A.get('products', 'p1')), name: 'Rendang Spesial' });
  await settle([A, B, C], 15000);
  B.plugin.st.delayAfterPush = 0;
  for (const d of [A, B, C]) {
    const p = await d.get('products', 'p1');
    eq([p.name, p.stock], ['Rendang Spesial', s0 - 1], `8c: versi terbaru tidak hilang di ${d.name}`);
  }
  await sameEverywhere([A, B, C], '8c');

  // 9) Data baru lalu langsung dihapus sebelum terkirim -> tidak pernah sampai ke induk
  B.plugin.st.offline = true;
  await B.put('expenses', { id: 'e-temp', amount: 1 });
  await B.del('expenses', 'e-temp');
  eq(await B.pending(), 0, 'dibuat lalu dihapus saat offline: antrean kosong');
  B.plugin.st.offline = false;

  // 10) Pemulihan cadangan (hapus semua + tulis ulang) di perangkat tambahan
  const snap = await C.all('products');
  for (const p of snap) await C.del('products', p.id);
  for (const p of snap) { const x = { ...p }; delete x[SV]; await C.put('products', { ...x, restored: true }); }
  await settle([A, B, C], 15000);
  eq((await A.all('products')).map(p => [p.id, !!p.restored]), snap.map(p => [p.id, true]), 'pulihkan di C diterapkan di Kasir Induk');
  await sameEverywhere([A, B, C], 'pemulihan');

  // 11) Banyak data: 600 transaksi dari B, terkirim bertahap
  for (let i = 0; i < 600; i++) await B.put('transactions', { id: 'bulk' + i, total: i, note: 'x'.repeat(200) });
  await settle([A, B, C], 30000);
  eq((await C.all('transactions')).filter(t => t.id.startsWith('bulk')).length, 600, '600 transaksi sampai di C');

  // 12) Perangkat dicabut -> perlu dipasangkan ulang
  const devs = JSON.parse((await local('/local/state')).devices);
  await http('GET', '/local/revoke?token=' + devs.find(d => d.code === 'K3').token);
  await C.put('expenses', { id: 'e1', amount: 5000 });
  await sleep(1500);
  ok(C.engine.state().needsRepair, 'perangkat dicabut ditandai perlu disambungkan ulang');
  ok(/dicabut/i.test(C.engine.state().lastError), 'pesan pencabutan jelas');

  // 13) Kembali mandiri
  await B.engine.leave();
  eq(B.engine.state().mode, 'standalone', 'B kembali mandiri');
  await B.put('products', { id: 'solo', name: 'Hanya di B' });
  eq(await B.pending(), 0, 'mandiri: tidak mengantre');
} catch (e) {
  fail++;
  console.log('GAGAL (galat):', e.stack || e);
} finally {
  java.kill();
}
console.log(`test-sync-e2e: ${pass} lulus, ${fail} gagal`);
process.exit(fail ? 1 : 0);
