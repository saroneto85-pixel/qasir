import { Capacitor } from '@capacitor/core';
import { CapacitorSQLite, SQLiteConnection } from '@capacitor-community/sqlite';

const STORES = ['products', 'transactions', 'expenses', 'settings', 'customers', 'employees', 'salaryPayments', 'expenseTypes', 'expenseItems', 'categories', 'tables', 'orders', 'stockMovements', 'assets', 'liabilities', 'receivables', 'openingBalance'];
const DB_NAME = 'kasmini_pos';
const DB_VERSION = 2;

let sqlite = null;
let sqliteConnection = null;
let idb = null;
let initPromise = null;

// Android/iOS selalu memakai SQLite lokal. Database ini berada di direktori privat
// aplikasi pada penyimpanan internal perangkat (bukan server dan bukan browser storage).
export const isNative = Capacitor.isNativePlatform();

function assertStore(name) {
  if (!STORES.includes(name)) throw new Error(`Store tidak dikenal: ${name}`);
}

function idbStore(name, mode = 'readonly') {
  if (!idb) throw new Error('Database browser belum diinisialisasi');
  return idb.transaction(name, mode).objectStore(name);
}

function idbAll(name) {
  return new Promise((resolve, reject) => {
    const request = idbStore(name).getAll();
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error || new Error('Gagal membaca data'));
  });
}

function idbPut(name, obj) {
  return new Promise((resolve, reject) => {
    const request = idbStore(name, 'readwrite').put(obj);
    request.onsuccess = () => resolve(obj);
    request.onerror = () => reject(request.error || new Error('Gagal menyimpan data'));
  });
}

function idbDel(name, id) {
  return new Promise((resolve, reject) => {
    const request = idbStore(name, 'readwrite').delete(id);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error || new Error('Gagal menghapus data'));
  });
}

async function initNativeDatabase() {
  sqliteConnection = new SQLiteConnection(CapacitorSQLite);
  // Pulihkan handle bila WebView dimuat ulang dalam proses Android yang sama.
  await sqliteConnection.checkConnectionsConsistency();
  const existing = await sqliteConnection.isConnection(DB_NAME, false);
  sqlite = existing.result
    ? await sqliteConnection.retrieveConnection(DB_NAME, false)
    : await sqliteConnection.createConnection(DB_NAME, false, 'no-encryption', DB_VERSION, false);
  const openState = await sqlite.isDBOpen();
  if (!openState.result) await sqlite.open();
  await sqlite.execute(`
    CREATE TABLE IF NOT EXISTS pos_records (
      store_name TEXT NOT NULL,
      id TEXT NOT NULL,
      payload TEXT NOT NULL,
      PRIMARY KEY (store_name, id)
    );
  `);
  await sqlite.execute('CREATE INDEX IF NOT EXISTS idx_pos_records_store ON pos_records(store_name);');
  // Migrasi idempoten: buat master kategori dari kategori teks produk lama.
  const legacy = await sqlite.query("SELECT payload FROM pos_records WHERE store_name = 'products'");
  for (const row of (legacy.values || [])) {
    try {
      const product = JSON.parse(row.payload);
      const name = String(product.category || 'Umum').trim();
      if (name) await sqlite.run(
        'INSERT OR IGNORE INTO pos_records (store_name, id, payload) VALUES (?, ?, ?)',
        ['categories', name.toLocaleLowerCase('id-ID'), JSON.stringify({id:name.toLocaleLowerCase('id-ID'), name, createdAt:Date.now(), migrated:true})]
      );
    } catch (error) { console.warn('Lewati kategori produk lama yang tidak valid', error); }
  }

  return 'SQLite aktif — penyimpanan internal HP';
}

async function initBrowserDatabase() {
  await new Promise((resolve, reject) => {
    const request = indexedDB.open('kasmini-pos-plus', 5);
    request.onupgradeneeded = event => {
      const database = event.target.result;
      STORES.forEach(name => {
        if (!database.objectStoreNames.contains(name)) {
          database.createObjectStore(name, { keyPath: 'id' });
        }
      });
    };
    request.onsuccess = event => {
      idb = event.target.result;
      idb.onversionchange = () => idb.close();
      resolve();
    };
    request.onerror = () => reject(request.error || new Error('Gagal membuka IndexedDB'));
    request.onblocked = () => reject(new Error('Database browser sedang digunakan tab lain. Tutup tab Kasmini POS lain lalu coba lagi.'));
  });
  return 'IndexedDB aktif — penyimpanan browser';
}

export function initDatabase() {
  if (!initPromise) {
    initPromise = (isNative ? initNativeDatabase() : initBrowserDatabase()).catch(error => {
      initPromise = null;
      sqlite = null;
      throw error;
    });
  }
  return initPromise;
}

function assertReady() {
  if (isNative && !sqlite) throw new Error('SQLite belum siap. Muat ulang aplikasi.');
  if (!isNative && !idb) throw new Error('IndexedDB belum siap. Muat ulang aplikasi.');
}

export async function all(name) {
  assertStore(name);
  assertReady();
  if (!isNative) return idbAll(name);
  const result = await sqlite.query(
    'SELECT payload FROM pos_records WHERE store_name = ? ORDER BY rowid',
    [name]
  );
  return (result.values || []).map(row => {
    try {
      return JSON.parse(row.payload);
    } catch {
      throw new Error(`Ada data ${name} yang rusak dan tidak dapat dibaca`);
    }
  });
}

export async function put(name, obj) {
  assertStore(name);
  assertReady();
  if (!obj || obj.id === undefined || obj.id === null || String(obj.id) === '') {
    throw new Error('Setiap data harus memiliki ID');
  }
  if (!isNative) return idbPut(name, obj);
  await sqlite.run(
    'INSERT OR REPLACE INTO pos_records (store_name, id, payload) VALUES (?, ?, ?)',
    [name, String(obj.id), JSON.stringify(obj)]
  );
  return obj;
}

export async function del(name, id) {
  assertStore(name);
  assertReady();
  if (!isNative) return idbDel(name, id);
  await sqlite.run(
    'DELETE FROM pos_records WHERE store_name = ? AND id = ?',
    [name, String(id)]
  );
}

export async function databaseInfo() {
  await initDatabase();
  return {
    engine: isNative ? 'SQLite' : 'IndexedDB',
    location: isNative ? 'Penyimpanan internal privat aplikasi' : 'Penyimpanan browser',
    stores: [...STORES]
  };
}
