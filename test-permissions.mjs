// Izin perangkat tambahan: aturan di aplikasi (permissions.js) harus identik dengan server (SyncPerms.java).
import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { makePerms, normalize, PRESETS } from './permissions.js';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('GAGAL:', m); } };
const STORES = ['products', 'transactions', 'expenses', 'settings', 'customers', 'employees', 'salaryPayments', 'expenseTypes', 'expenseItems', 'categories', 'tables', 'orders', 'stockMovements', 'assets', 'liabilities', 'receivables', 'openingBalance', 'invItems', 'invEntries', 'cashiers', 'materials', 'hppMenus', 'materialEntries', 'tabelBaru'];

const kasir = makePerms(PRESETS.kasir.keys);
ok(kasir.canPage('transaction') && kasir.canPage('history') && !kasir.canPage('pembukuan') && kasir.canPage('reports'), 'kasir: menu kasir + Laporan (terbuka untuk semua)');
ok(!makePerms(['reports','cost']).canRead('expenses') && makePerms(['reports']).keys.length === 0, 'kunci lama reports diabaikan, tidak membuka pengeluaran');
ok(kasir.canPage('dashboard') && kasir.canPage('settings'), 'beranda & Pengaturan (bagian perangkat) selalu terbuka');
ok(!kasir.has('cost') && !kasir.has('txEdit') && !kasir.has('data'), 'kasir: tanpa HPP/laba, edit transaksi, ekspor');
ok(makePerms(null).full && makePerms(null).canRead('openingBalance'), 'null = akses penuh (Perangkat Utama / Mandiri)');
ok(normalize(['evaluasi']).includes('cost'), 'Evaluasi membuka HPP/laba otomatis');

// paritas dengan Java (butuh JDK)
let java = true;
try { execFileSync('javac', ['-version'], { stdio: 'ignore' }); } catch { java = false; }
if (java) {
  const out = mkdtempSync(join(tmpdir(), 'perms-'));
  const N = 'android-native/src/main/java/id/kasmini/pos/sync/';
  execFileSync('javac', ['-d', out, N + 'MiniJson.java', N + 'SyncPerms.java', 'android-native/test/PermsDump.java'], { stdio: ['ignore', 'ignore', 'inherit'] });
  const J = JSON.parse(execFileSync('java', ['-cp', out, 'PermsDump', STORES.join(',')], { encoding: 'utf8' }));
  const cases = [PRESETS.kasir.keys, PRESETS.pelayan.keys, PRESETS.dapur.keys, PRESETS.penuh.keys, ['reports'], ['reports', 'cost'], ['pembukuan'], ['expenses'], ['salary'], ['hpp'], ['inventory', 'txEdit'], []];
  cases.forEach((keys, i) => {
    const P = makePerms(keys), j = J[i];
    ok(JSON.stringify(P.keys) === JSON.stringify([...j.keys].sort()), `paritas kunci [${keys}]`);
    ok(P.has('cost') === j.cost, `paritas cost [${keys}]`);
    STORES.forEach((s, k) => ok(P.canRead(s) === j.read[k], `paritas baca ${s} [${keys}]: JS ${P.canRead(s)} vs Java ${j.read[k]}`));
  });
} else console.log('(lewati paritas Java: JDK tidak ada)');
console.log(`test-permissions: ${pass} lulus, ${fail} gagal`);
process.exit(fail ? 1 : 0);
