// Penyambung mesin sinkronisasi ke Capacitor (plugin native LanSync + SQLite aplikasi).
import { registerPlugin } from '@capacitor/core';
import { App } from '@capacitor/app';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { isNative, initDatabase, nativeConnection, installSyncLayer, setSyncGate, STORE_NAMES } from './db.js';
import { createSyncEngine, SV } from './sync-engine.js';
import { setPermKeys } from './permissions.js';

export const LanSync = isNative ? registerPlugin('LanSync') : null;

let engine = null;
let lastState = { mode: 'standalone', available: false, started: false };
const listeners = new Set();

export function onSyncState(fn) {
  listeners.add(fn);
  fn(lastState);
  return () => listeners.delete(fn);
}
export const syncEngine = () => engine;
export const syncState = () => lastState;

function publish(s) {
  lastState = { ...s, available: true };
  // Izin menu/fitur: perangkat tambahan mengikuti izin dari Perangkat Utama; lainnya akses penuh.
  if (s.mode === 'client') { if (s.perms) setPermKeys(s.perms); }
  else if (s.started) setPermKeys(null);
  for (const fn of listeners) { try { fn(lastState); } catch (e) { console.warn(e); } }
}

/** Menyimpan cadangan JSON (format sama dengan menu Cadangkan data) sebelum data lokal diganti. */
export async function backupRows(rows, label) {
  if (!rows.length) return '';
  const data = { version: 2, exportedAt: new Date().toISOString(), note: 'Cadangan otomatis: ' + label };
  for (const r of rows) {
    try {
      const x = JSON.parse(r.payload);
      delete x[SV];
      (data[r.store_name] ||= []).push(x);
    } catch { /* lewati record rusak */ }
  }
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const path = `KASIR-cadangan-${label.replace(/\s+/g, '-')}-${stamp}.json`;
  const text = JSON.stringify(data);
  try {
    await Filesystem.writeFile({ path, data: text, directory: Directory.Documents, encoding: Encoding.UTF8 });
    return 'Documents/' + path;
  } catch {
    await Filesystem.writeFile({ path, data: text, directory: Directory.Data, encoding: Encoding.UTF8 });
    return 'penyimpanan aplikasi/' + path;
  }
}

async function boot() {
  await initDatabase();
  const db = nativeConnection();
  if (!db) return;
  engine = createSyncEngine({
    db,
    plugin: LanSync,
    storeNames: STORE_NAMES,
    onState: publish,
    onRemoteChange: stores => window.dispatchEvent(new CustomEvent('kasir:remote-change', { detail: { stores } }))
  });
  installSyncLayer(engine.layer);
  try {
    await engine.start();
  } catch (e) {
    console.error('Sinkronisasi gagal dimulai', e);
    publish({ ...engine.state(), lastError: String(e.message || e) });
  }
  App.addListener('resume', () => {
    engine.refreshNative().catch(() => {});
    engine.resume();
  });
}

// Gerbang dipasang saat modul dimuat (sebelum app.js menulis apa pun), agar tidak ada
// penulisan yang lolos dari antrean sinkronisasi.
if (isNative) setSyncGate(boot().catch(e => console.error('Sinkronisasi tidak tersedia', e)));

// Dipakai app.js: kode perangkat pada nomor nota, dan peringatan aksi massal.
window.kasirSync = {
  deviceCode: () => (lastState.mode === 'client' ? (lastState.native?.deviceCode || '') : ''),
  active: () => lastState.mode === 'server' || lastState.mode === 'client',
  perms: () => lastState.perms || null,
  state: () => lastState
};
