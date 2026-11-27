// Mesin sinkronisasi antar perangkat (LAN) — tanpa ketergantungan Capacitor agar bisa diuji di Node.
//
// Prinsip:
//  - Setiap perangkat tetap menyimpan salinan lengkap data di SQLite lokal (aplikasi tetap jalan
//    walau Wi-Fi putus). Perangkat Utama menyimpan database induk di Room.
//  - Setiap penulisan lokal juga dicatat di antrean kirim (sync_outbox) lalu dikirim (push).
//  - Perubahan dari perangkat lain diambil berurutan per nomor revisi (pull, long-poll).
//  - Record lokal membawa kolom `_sv` = revisi server yang menjadi dasar data tersebut, sehingga
//    Perangkat Utama bisa menggabungkan perubahan serentak (mis. dua kasir menjual produk yang sama).

import { makePerms } from './permissions.js';

export const SV = '_sv';
const sleepDefault = ms => new Promise(r => setTimeout(r, ms));

export function createSyncEngine({
  db,                      // koneksi SQLite (API @capacitor-community/sqlite: query/run/executeSet)
  plugin,                  // plugin LanSync (getState, push, pull, seed, setMode, pair, startServer, ...)
  storeNames,              // daftar store yang disinkronkan
  localFields = { settings: ['lastCashier'] }, // kolom yang tetap milik perangkat masing-masing
  onState = () => {},
  onRemoteChange = () => {},
  sleep = sleepDefault,
  pushDelay = 250,
  waitSec = 25,
  log = console
}) {
  const STORES = new Set(storeNames);
  const st = {
    mode: 'standalone', native: {}, online: false, pending: 0, cursor: 0,
    lastSync: 0, lastError: '', needsRepair: false, busy: '', started: false,
    perms: null // daftar izin dari Perangkat Utama (perangkat tambahan); null = belum diketahui / penuh
  };
  let seq = 0, chain = Promise.resolve();
  let pushTimer = null, pushing = false, pushAgain = false, pulling = false, generation = 0;
  // Versi server yang dilewati saat pull karena record masih punya perubahan lokal yang belum terkirim.
  // Dipakai saat balasan push tiba bila versinya lebih baru (kursor sudah melewatinya).
  const skipped = new Map();

  const active = () => st.mode === 'server' || st.mode === 'client';
  const emit = () => { try { onState(snapshot()); } catch (e) { log.warn?.(e); } };
  const snapshot = () => ({ ...st, native: { ...st.native } });

  // Antrean tunggal untuk semua penulisan lokal + penerapan data server (mencegah tulis-timpa).
  function locked(fn) {
    const r = chain.then(fn, fn);
    chain = r.catch(() => {});
    return r;
  }

  const rows = r => (r && r.values) || [];
  const parse = s => { try { return s ? JSON.parse(s) : null; } catch { return null; } };
  const key = (s, id) => s + '\u0001' + id;

  // Perangkat tambahan tanpa izin Pengaturan memakai PIN lokalnya sendiri (hash PIN owner tidak pernah diterima/dikirim).
  const PIN_FIELDS = ['pinHash', 'pinSalt'];
  const ownPin = () => st.mode === 'client' && !(st.perms && st.perms.includes('settings'));
  const fieldsOf = name => (name === 'settings' && ownPin() ? [...(localFields[name] || []), ...PIN_FIELDS] : localFields[name] || []);
  function forServer(name, obj) {
    const o = { ...obj };
    delete o[SV];
    for (const f of fieldsOf(name)) delete o[f];
    return o;
  }
  function fromServer(name, payload, rev, localObj) {
    const o = { ...payload, [SV]: rev };
    for (const f of fieldsOf(name)) if (localObj && localObj[f] !== undefined) o[f] = localObj[f];
    return o;
  }
  const sameData = (name, a, b) => JSON.stringify(forServer(name, a)) === JSON.stringify(forServer(name, b));

  async function getLocal(name, id) {
    const r = rows(await db.query('SELECT payload FROM pos_records WHERE store_name = ? AND id = ?', [name, id]));
    return r.length ? parse(r[0].payload) : null;
  }
  async function getOutbox(name, id) {
    const r = rows(await db.query('SELECT op, payload, base_rev, base_payload, seq FROM sync_outbox WHERE store_name = ? AND id = ?', [name, id]));
    return r[0] || null;
  }
  async function setMeta(k, v) { await db.run('INSERT OR REPLACE INTO sync_meta (k, v) VALUES (?, ?)', [k, String(v)]); }
  async function getMeta(k) {
    const r = rows(await db.query('SELECT v FROM sync_meta WHERE k = ?', [k]));
    return r.length ? r[0].v : null;
  }
  async function refreshPending() {
    const r = rows(await db.query('SELECT COUNT(*) AS n FROM sync_outbox', []));
    st.pending = Number(r[0]?.n || 0);
    emit();
  }

  // ---------------- lapisan penulisan (dipasang ke db.js) ----------------

  const layer = {
    put(name, obj) {
      return locked(async () => {
        const id = String(obj.id);
        const json = JSON.stringify(obj);
        if (!active() || !STORES.has(name)) {
          await db.run('INSERT OR REPLACE INTO pos_records (store_name, id, payload) VALUES (?, ?, ?)', [name, id, json]);
          return obj;
        }
        const cur = await getLocal(name, id);
        const row = await getOutbox(name, id);
        const set = [{ statement: 'INSERT OR REPLACE INTO pos_records (store_name, id, payload) VALUES (?, ?, ?)', values: [name, id, json] }];
        // Bukan perubahan hanya bila isinya sama DAN berasal dari versi yang sama. Objek yang dibaca
        // dari versi lama (mis. stok 10 lalu dijual jadi 9, sementara versi baru dari kasir lain juga 9)
        // tetap dikirim agar Perangkat Utama menghitung kedua penjualan.
        const sameBase = !(SV in obj) || (cur && obj[SV] === cur[SV]);
        const unchanged = cur && sameBase && sameData(name, cur, obj) && (!row || row.op === 'put');
        if (!unchanged) {
          const baseRev = row ? row.base_rev
            : (typeof obj[SV] === 'number' ? obj[SV] : (cur && typeof cur[SV] === 'number' ? cur[SV] : null));
          set.push({
            statement: 'INSERT OR REPLACE INTO sync_outbox (store_name, id, op, payload, base_rev, base_payload, seq) VALUES (?, ?, ?, ?, ?, ?, ?)',
            values: [name, id, 'put', JSON.stringify(forServer(name, obj)), baseRev ?? null, row ? row.base_payload : null, ++seq]
          });
        }
        await db.executeSet(set, true);
        if (!unchanged) { st.pending += row ? 0 : 1; emit(); schedulePush(); }
        if (name === 'settings' && id === 'main' && st.mode === 'server' && obj.name) plugin.setStoreName({ name: obj.name }).catch(() => {});
        return obj;
      });
    },
    del(name, id) {
      return locked(async () => {
        id = String(id);
        if (!active() || !STORES.has(name)) {
          await db.run('DELETE FROM pos_records WHERE store_name = ? AND id = ?', [name, id]);
          return;
        }
        const cur = await getLocal(name, id);
        const row = await getOutbox(name, id);
        const set = [{ statement: 'DELETE FROM pos_records WHERE store_name = ? AND id = ?', values: [name, id] }];
        let queued = false;
        if (cur || row) {
          const neverSynced = row && row.base_rev == null && !row.base_payload && !(cur && typeof cur[SV] === 'number');
          if (neverSynced && !pushing) {
            set.push({ statement: 'DELETE FROM sync_outbox WHERE store_name = ? AND id = ?', values: [name, id] });
          } else {
            const baseRev = row ? row.base_rev : (cur && typeof cur[SV] === 'number' ? cur[SV] : null);
            set.push({
              statement: 'INSERT OR REPLACE INTO sync_outbox (store_name, id, op, payload, base_rev, base_payload, seq) VALUES (?, ?, ?, ?, ?, ?, ?)',
              values: [name, id, 'del', null, baseRev ?? null, row ? row.base_payload : null, ++seq]
            });
            queued = true;
          }
        }
        await db.executeSet(set, true);
        if (queued) schedulePush();
        await refreshPending();
      });
    }
  };

  // ---------------- kirim (push) ----------------

  function schedulePush(delay = pushDelay) {
    if (!active() || st.needsRepair) return;
    clearTimeout(pushTimer);
    pushTimer = setTimeout(() => { pushNow().catch(() => {}); }, delay);
  }

  async function pushNow() {
    if (!active() || st.needsRepair) return;
    if (pushing) { pushAgain = true; return; }
    pushing = true;
    try {
      while (active()) {
        const all = rows(await db.query('SELECT store_name, id, op, payload, base_rev, base_payload, seq FROM sync_outbox ORDER BY seq LIMIT 80', []));
        if (!all.length) break;
        const batch = [];
        let size = 0;
        for (const r of all) {
          size += (r.payload?.length || 0) + (r.base_payload?.length || 0) + 80;
          if (batch.length && size > 1_200_000) break;
          batch.push(r);
        }
        const changes = batch.map(r => {
          const c = { s: r.store_name, id: r.id, op: r.op };
          if (r.op === 'put') c.p = JSON.parse(r.payload);
          if (r.base_rev != null) c.b = Number(r.base_rev);
          if (r.base_payload) c.bp = JSON.parse(r.base_payload);
          return c;
        });
        const res = await plugin.push({ body: JSON.stringify({ deviceId: st.native.deviceId || '', changes }) });
        if (res.status !== 200) { await httpError(res); throw new Error('Kirim data ditolak (' + res.status + ')'); }
        const data = JSON.parse(res.body);
        await locked(() => applyAck(batch, data.results || []));
        setOnline(true);
      }
    } catch (e) {
      setOnline(false, e);
      if (!st.needsRepair) schedulePush(5000);
      throw e;
    } finally {
      pushing = false;
      await refreshPending().catch(() => {});
      if (pushAgain) { pushAgain = false; schedulePush(30); }
    }
  }

  async function applyAck(batch, results) {
    const touched = new Set();
    for (let i = 0; i < batch.length; i++) {
      const r = batch[i], x = results[i];
      if (!x) continue;
      const name = r.store_name, id = r.id;
      const del = await db.run('DELETE FROM sync_outbox WHERE store_name = ? AND id = ? AND seq = ?', [name, id, r.seq]);
      const removed = Number(del?.changes?.changes ?? 0) > 0;
      if (removed) {
        const cur = await getLocal(name, id);
        const sk = skipped.get(key(name, id));
        skipped.delete(key(name, id));
        if (sk && sk.r > x.r) { x.r = sk.r; x.d = sk.d; x.p = sk.p; x.eq = false; }
        if (x.d) {
          if (cur) { await db.run('DELETE FROM pos_records WHERE store_name = ? AND id = ?', [name, id]); touched.add(name); }
          continue;
        }
        const payload = x.eq ? JSON.parse(r.payload) : x.p;
        const obj = fromServer(name, payload, x.r, cur);
        if (!cur || !sameData(name, cur, obj)) touched.add(name);
        await db.run('INSERT OR REPLACE INTO pos_records (store_name, id, payload) VALUES (?, ?, ?)', [name, id, JSON.stringify(obj)]);
      } else {
        // Diubah lagi saat sedang dikirim: perubahan berikutnya dihitung dari versi yang baru terkirim.
        const row = await getOutbox(name, id);
        if (row) {
          const base = r.op === 'put' ? r.payload : null;
          await db.run('UPDATE sync_outbox SET base_rev = ?, base_payload = ? WHERE store_name = ? AND id = ?',
            [base ? null : (x.d ? null : x.r), base, name, id]);
        } else if (!x.d && !(await getLocal(name, id))) {
          await db.run('INSERT OR REPLACE INTO sync_outbox (store_name, id, op, payload, base_rev, base_payload, seq) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [name, id, 'del', null, x.r, null, ++seq]);
        }
      }
    }
    if (touched.size) onRemoteChange([...touched]);
  }

  // ---------------- ambil (pull) ----------------

  async function applyChanges(changes, cursor) {
    const touched = new Set();
    if (changes.length) {
      const pendingKeys = new Set(rows(await db.query('SELECT store_name, id FROM sync_outbox', [])).map(r => key(r.store_name, r.id)));
      const existing = new Map();
      const wanted = changes.filter(c => STORES.has(c.s));
      for (let i = 0; i < wanted.length; i += 200) {
        const part = wanted.slice(i, i + 200);
        const sql = 'SELECT store_name, id, payload FROM pos_records WHERE (store_name, id) IN (VALUES ' + part.map(() => '(?, ?)').join(', ') + ')';
        for (const r of rows(await db.query(sql, part.flatMap(c => [c.s, String(c.id)])))) existing.set(key(r.store_name, r.id), r.payload);
      }
      const set = [];
      for (const c of wanted) {
        const id = String(c.id), k = key(c.s, id);
        if (pendingKeys.has(k)) { // perubahan lokal belum terkirim: hasil gabungan datang saat push
          const prev = skipped.get(k);
          if (!prev || c.r > prev.r) skipped.set(k, { r: c.r, d: !!c.d, p: c.p });
          continue;
        }
        const curStr = existing.get(k);
        if (c.d) {
          if (curStr !== undefined) { set.push({ statement: 'DELETE FROM pos_records WHERE store_name = ? AND id = ?', values: [c.s, id] }); touched.add(c.s); existing.delete(k); }
          continue;
        }
        const curObj = curStr !== undefined ? parse(curStr) : null;
        const obj = fromServer(c.s, c.p, c.r, curObj);
        const str = JSON.stringify(obj);
        if (str !== curStr) {
          set.push({ statement: 'INSERT OR REPLACE INTO pos_records (store_name, id, payload) VALUES (?, ?, ?)', values: [c.s, id, str] });
          if (!curObj || !sameData(c.s, curObj, obj)) touched.add(c.s);
          existing.set(k, str);
        }
        if (c.s === 'settings' && id === 'main' && st.mode === 'server' && c.p?.name) plugin.setStoreName({ name: c.p.name }).catch(() => {});
      }
      set.push({ statement: 'INSERT OR REPLACE INTO sync_meta (k, v) VALUES (?, ?)', values: ['cursor', String(cursor)] });
      await db.executeSet(set, true);
    } else if (cursor !== st.cursor) {
      await setMeta('cursor', cursor);
    }
    st.cursor = cursor;
    st.lastSync = Date.now();
    if (touched.size) onRemoteChange([...touched]);
  }

  async function pullOnce(wait = 0) {
    const gen = generation, since = st.cursor;
    const res = await plugin.pull({ since: String(since), wait }); // string: aman untuk angka besar di jembatan Capacitor
    if (gen !== generation) return { more: false, stale: true }; // mode/server berganti selama menunggu
    if (res.status !== 200) { await httpError(res); throw new Error('Ambil data ditolak (' + res.status + ')'); }
    const data = JSON.parse(res.body);
    if (Array.isArray(data.perms) && gen === generation) {
      const restart = await locked(() => applyPermsChange(data.perms));
      if (restart) return { more: true, permsChanged: true };
    }
    await locked(() => (gen === generation && since === st.cursor) ? applyChanges(data.changes || [], Number(data.cursor ?? st.cursor)) : null);
    setOnline(true);
    return data;
  }

  /**
   * Izin dari Perangkat Utama berubah: data yang tidak lagi diizinkan dihapus dari perangkat ini,
   * lalu semua data yang diizinkan diambil ulang dari awal (mis. harga modal yang kini boleh dilihat).
   * Mengembalikan true bila pengambilan harus diulang dari kursor 0.
   */
  async function applyPermsChange(keys) {
    const canon = JSON.stringify([...keys].sort());
    if (st.perms && JSON.stringify([...st.perms].sort()) === canon) return false;
    const P = makePerms(keys);
    const banned = [...STORES].filter(x => !P.canRead(x));
    const set = [];
    if (banned.length) {
      const q = banned.map(() => '?').join(', ');
      set.push({ statement: `DELETE FROM pos_records WHERE store_name IN (${q})`, values: banned });
      set.push({ statement: `DELETE FROM sync_outbox WHERE store_name IN (${q})`, values: banned });
    }
    const restart = st.cursor > 0;
    const hadSettings = !!(st.perms && st.perms.includes('settings'));
    if (hadSettings && !P.has('settings')) {
      // Izin Pengaturan dicabut: hapus salinan hash PIN owner dari perangkat ini.
      for (const r of rows(await db.query("SELECT id, payload FROM pos_records WHERE store_name = 'settings'", []))) {
        const o = parse(r.payload);
        if (o && PIN_FIELDS.some(f => f in o)) { for (const f of PIN_FIELDS) delete o[f]; set.push({ statement: 'UPDATE pos_records SET payload = ? WHERE store_name = ? AND id = ?', values: [JSON.stringify(o), 'settings', r.id] }); }
      }
    }
    set.push({ statement: 'INSERT OR REPLACE INTO sync_meta (k, v) VALUES (?, ?)', values: ['perms', canon] });
    if (restart) set.push({ statement: 'INSERT OR REPLACE INTO sync_meta (k, v) VALUES (?, ?)', values: ['cursor', '0'] });
    await db.executeSet(set, true);
    st.perms = JSON.parse(canon);
    if (restart) { st.cursor = 0; skipped.clear(); }
    emit();
    onRemoteChange([...STORES]);
    return restart;
  }

  async function pullLoop() {
    if (pulling) return;
    pulling = true;
    const gen = generation;
    let backoff = 1000;
    try {
      while (active() && !st.needsRepair && gen === generation) {
        try {
          const data = await pullOnce(waitSec);
          backoff = 1000;
          if (st.pending) schedulePush(0);
          if (data.more) continue;
        } catch (e) {
          setOnline(false, e);
          if (st.needsRepair || gen !== generation) break;
          await sleep(backoff);
          backoff = Math.min(backoff * 2, 15000);
        }
      }
    } finally {
      pulling = false;
    }
  }

  async function httpError(res) {
    let msg = '';
    try { msg = JSON.parse(res.body).error || ''; } catch {}
    if (res.status === 401 || res.status === 410) {
      st.needsRepair = true;
      st.lastError = msg || (res.status === 410 ? 'Perangkat Utama sudah berganti data.' : 'Perangkat ini perlu dipasangkan ulang.');
      emit();
    } else if (msg) st.lastError = msg;
  }

  function setOnline(ok, err) {
    const was = st.online, wasErr = st.lastError;
    st.online = !!ok;
    if (ok) { if (!st.needsRepair) st.lastError = ''; }
    else if (err && !st.needsRepair) st.lastError = String(err.message || err);
    if (was !== st.online || wasErr !== st.lastError) emit();
  }

  // ---------------- siklus hidup ----------------

  async function refreshNative() {
    st.native = await plugin.getState();
    st.mode = st.native.mode || 'standalone';
    emit();
    return st.native;
  }

  async function start() {
    const m = rows(await db.query('SELECT IFNULL(MAX(seq), 0) AS m FROM sync_outbox', []));
    seq = Number(m[0]?.m || 0);
    st.cursor = Number(await getMeta('cursor')) || 0;
    try { st.perms = JSON.parse(await getMeta('perms') || 'null'); } catch { st.perms = null; }
    await refreshNative();
    st.started = true;
    await refreshPending();
    if (st.mode === 'server' && st.native.serverAutoStart && !st.native.serverRunning) {
      plugin.startServer().then(refreshNative).catch(e => { st.lastError = 'Server: ' + (e.message || e); emit(); });
    }
    resume();
  }

  function resume() {
    if (!active() || st.needsRepair) return;
    pullLoop();
    schedulePush(0);
  }

  async function allLocalRecords() {
    return rows(await db.query('SELECT store_name, id, payload FROM pos_records ORDER BY rowid', []));
  }

  /** Menjadikan perangkat ini Perangkat Utama: data lokal menjadi data induk di Room. */
  async function becomeServer({ storeName = '', progress = () => {} } = {}) {
    st.busy = 'Menyiapkan Perangkat Utama…'; emit();
    try {
      await locked(async () => {
        const all = (await allLocalRecords()).filter(r => STORES.has(r.store_name));
        let chunk = [], size = 0, first = true, done = 0;
        const flush = async () => {
          await plugin.seed({ body: JSON.stringify({ records: chunk }), reset: first, storeName });
          first = false; done += chunk.length; chunk = []; size = 0;
          progress(done, all.length);
        };
        for (const r of all) {
          const p = parse(r.payload);
          if (!p) continue;
          chunk.push({ s: r.store_name, id: r.id, p: forServer(r.store_name, p) });
          size += r.payload.length;
          if (size > 800_000) await flush();
        }
        if (chunk.length || first) await flush();
        await db.executeSet([
          { statement: 'DELETE FROM sync_outbox', values: [] },
          { statement: 'INSERT OR REPLACE INTO sync_meta (k, v) VALUES (?, ?)', values: ['cursor', '0'] }
        ], true);
        st.cursor = 0;
        st.perms = null;
        await db.executeSet([{ statement: "DELETE FROM sync_meta WHERE k = 'perms'", values: [] }], true);
        await plugin.setMode({ mode: 'server' });
        st.mode = 'server'; // penulisan yang menunggu antrean langsung tercatat di outbox
      });
      st.needsRepair = false;
      generation++;
      await refreshNative();
      // Ambil ulang dari Room agar setiap record lokal punya nomor revisi (_sv).
      let more = true;
      while (more) more = !!(await pullOnce(0)).more;
      try { await plugin.startServer(); } catch (e) { st.lastError = 'Server: ' + (e.message || e); }
      await refreshNative();
      resume();
    } finally {
      st.busy = ''; emit();
    }
  }

  /**
   * Bergabung ke Perangkat Utama: data lokal diganti salinan dari Perangkat Utama.
   * backup(rows) dipanggil lebih dulu untuk menyimpan cadangan data lama perangkat ini.
   */
  async function join({ host, port, code, name, backup = async () => {}, progress = () => {} }) {
    st.busy = 'Menghubungkan…'; emit();
    try {
      await plugin.pair({ host, port, code, name });
      generation++;
      skipped.clear();
      st.needsRepair = false;
      await locked(async () => {
        await backup(await allLocalRecords());
        await db.executeSet([
          { statement: 'DELETE FROM pos_records', values: [] },
          { statement: 'DELETE FROM sync_outbox', values: [] },
          { statement: "DELETE FROM sync_meta WHERE k = 'perms'", values: [] },
          { statement: 'INSERT OR REPLACE INTO sync_meta (k, v) VALUES (?, ?)', values: ['cursor', '0'] }
        ], true);
        st.cursor = 0;
        st.perms = null;
        st.mode = 'client';
      });
      await refreshNative();
      st.busy = 'Mengambil data toko…'; emit();
      let more = true, pages = 0;
      while (more) { more = !!(await pullOnce(0)).more; progress(++pages); }
      await refreshPending();
      resume();
    } finally {
      st.busy = ''; emit();
    }
  }

  /** Kembali ke mode Mandiri. Data lokal tetap ada sebagai salinan terpisah. */
  async function leave() {
    generation++;
    await locked(async () => {
      await plugin.setMode({ mode: 'standalone' });
      st.mode = 'standalone';
      st.perms = null;
      await db.executeSet([{ statement: 'DELETE FROM sync_outbox', values: [] }, { statement: "DELETE FROM sync_meta WHERE k = 'perms'", values: [] }], true);
    });
    st.needsRepair = false;
    st.online = false;
    await refreshNative();
    await refreshPending();
  }

  async function syncNow() {
    if (!active()) return;
    await pushNow().catch(() => {});
    await pullOnce(0);
    await refreshPending();
  }

  return {
    layer, start, resume, refreshNative, becomeServer, join, leave, syncNow, pullOnce, pushNow,
    state: snapshot, active, locked
  };
}
