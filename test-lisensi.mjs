// Uji lisensi: alat pembuat kode (JS/WebCrypto) <-> pemeriksa di aplikasi (Java LicenseCodec).
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as L from './lisensi/lisensi-core.mjs';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('GAGAL:', m); } };
const pkg = 'id.kasmini.pos', androidId = '9774d56d682e549c';
const deviceCode = await L.deviceCodeFor(pkg, androidId);
ok(/^[A-Z2-7]{5}-[A-Z2-7]{5}-[A-Z2-7]{5}$/.test(deviceCode), 'kode perangkat 15 huruf: ' + deviceCode);
const keys = await L.generateKeys(), pub = await L.publicKeyB64(keys.publicKey);
const other = await L.generateKeys(), otherPub = await L.publicKeyB64(other.publicKey);
const date = new Date(2026, 10, 27);
const fx = { pkg, androidId, deviceCode, pub, otherPub, epochDay: String(Math.floor(Date.UTC(2026, 10, 27) / 86400000)) };
for (const p of [1, 2, 3, 9]) {
  fx['code' + p] = await L.makeActivationCode(keys.privateKey, deviceCode, p, date);
  ok((await L.verifyActivationCode(pub, deviceCode, fx['code' + p]))?.plan === p, `alat: swa-uji paket ${p}`);
}
ok(fx.code2.replace(/-/g, '').length === 122, 'kode aktivasi 122 karakter');
fx.otherCode = await L.makeActivationCode(keys.privateKey, await L.deviceCodeFor(pkg, 'ffff0000aaaa1111'), 2, date);
ok(await L.verifyActivationCode(pub, deviceCode, fx.otherCode) === null, 'alat: kode HP lain tidak cocok');
ok(await L.verifyActivationCode(otherPub, deviceCode, fx.code1) === null, 'alat: kunci lain menolak');
// paket tak dikenal (ditandatangani sah) untuk menguji penolakan di aplikasi
{
  const hash = await L.parseDeviceCode(deviceCode), payload = new Uint8Array(12);
  payload[0] = 1; payload[1] = 7; payload.set(hash, 4);
  const pre = new TextEncoder().encode('KASIRDBL-LIC1'), msg = new Uint8Array(pre.length + 12); msg.set(pre); msg.set(payload, pre.length);
  const sig = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, keys.privateKey, msg));
  const all = new Uint8Array(76); all.set(payload); all.set(sig, 12); fx.badPlan = L.group(L.base32(all));
}
for (const bad of ['ABCDE-FGHIJ', 'ABCDE-FGHIJ-KLMN9', deviceCode.slice(0, 16) + (deviceCode.at(-1) === 'A' ? 'B' : 'A')]) {
  let err = ''; try { await L.parseDeviceCode(bad); } catch (e) { err = e.message; }
  ok(err, 'kode perangkat keliru ditolak: ' + bad + ' -> ' + err);
}
ok((await L.parseDeviceCode(deviceCode.toLowerCase().replace(/-/g, ' '))).length === 8, 'kode perangkat toleran huruf kecil/spasi');
// cadangan kunci terenkripsi
{
  const jwk = await L.exportPrivateJwk(keys.privateKey), file = await L.encryptBackup({ jwk }, 'rahasia-123');
  ok(!JSON.stringify(file).includes(jwk.d), 'cadangan tidak memuat kunci rahasia terbuka');
  const back = await L.decryptBackup(file, 'rahasia-123');
  ok(await L.publicFromPrivateJwk(back.jwk) === pub, 'cadangan dipulihkan -> kunci publik sama');
  const k2 = await L.importPrivateJwk(back.jwk);
  ok(await L.verifyActivationCode(pub, deviceCode, await L.makeActivationCode(k2, deviceCode, 3)) !== null, 'kunci pulihan bisa membuat kode sah');
  let err = ''; try { await L.decryptBackup(file, 'salah'); } catch (e) { err = e.message; }
  ok(/salah/.test(err), 'kata sandi cadangan salah ditolak');
}
// alat HTML harus memuat inti yang sama persis (dibangun oleh lisensi/build-alat.py)
{
  const html = fs.readFileSync('lisensi/pembuat-kode-aktivasi.html', 'utf8');
  const core = fs.readFileSync('lisensi/lisensi-core.mjs', 'utf8').replace(/^export (async function|function|const)/gm, '$1');
  ok(html.includes(core), 'pembuat-kode-aktivasi.html memakai lisensi-core.mjs terbaru (jalankan python3 lisensi/build-alat.py)');
}
// uji silang Java
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lic-'));
const fxFile = path.join(tmp, 'fx.json'); fs.writeFileSync(fxFile, JSON.stringify(fx));
const src = 'android-native/src/main/java/id/kasmini/pos/license/LicenseCodec.java';
try {
  execFileSync('javac', ['-nowarn', '-d', tmp, src, 'android-native/test/LicenseTest.java'], { stdio: 'pipe' });
  const out = execFileSync('java', ['-cp', tmp, 'LicenseTest', fxFile], { encoding: 'utf8' });
  process.stdout.write(out);
  ok(/0 gagal/.test(out), 'uji silang Java');
} catch (e) { fail++; console.log('GAGAL uji Java:', e.stdout?.toString() || e.message, e.stderr?.toString() || ''); }
console.log(`test-lisensi: ${pass} lulus, ${fail} gagal`);
process.exit(fail ? 1 : 0);
