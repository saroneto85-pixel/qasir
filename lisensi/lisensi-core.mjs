// Inti Alat Pembuat Kode Aktivasi KASIR DBL — WebCrypto (browser modern / Node 20+), tanpa pustaka.
// Format harus identik dengan android-native/.../license/LicenseCodec.java (diuji silang oleh test-lisensi.mjs).
export const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
export const PLANS = {
  1: { name: 'Basic', extra: 0, label: 'Basic — 1 perangkat' },
  2: { name: 'Toko', extra: 2, label: 'Toko — 1 utama + 2 tambahan' },
  3: { name: 'Pro', extra: 5, label: 'Pro — 1 utama + 5 tambahan' },
  9: { name: 'Pemilik', extra: -1, label: 'Pemilik — tanpa batas (khusus HP Anda)' }
};
const SIGN_PREFIX = new TextEncoder().encode('KASIRDBL-LIC1');
const EPOCH_2024 = Date.UTC(2024, 0, 1);
const subtle = () => globalThis.crypto.subtle;

export function normalize(s) {
  let out = '';
  for (let c of String(s || '').toUpperCase()) {
    if (c === '0') c = 'O'; else if (c === '1') c = 'I'; else if (c === '8') c = 'B';
    if ((c >= 'A' && c <= 'Z') || (c >= '2' && c <= '7')) out += c;
    else if (/[0-9A-Z]/.test(c)) throw new Error('Karakter tidak dikenal: ' + c);
  }
  return out;
}
export function base32(bytes) {
  let out = '', buf = 0, bits = 0;
  for (const b of bytes) { buf = (buf << 8) | b; bits += 8; while (bits >= 5) { out += ALPHABET[(buf >> (bits - 5)) & 31]; bits -= 5; } buf &= 0xff; }
  if (bits > 0) out += ALPHABET[(buf << (5 - bits)) & 31];
  return out;
}
export function unbase32(s) {
  const out = []; let buf = 0, bits = 0;
  for (const c of s) { const v = ALPHABET.indexOf(c); if (v < 0) throw new Error('Karakter tidak dikenal'); buf = (buf << 5) | v; bits += 5; if (bits >= 8) { out.push((buf >> (bits - 8)) & 0xff); bits -= 8; } buf &= 0xff; }
  return new Uint8Array(out);
}
export const group = (s, n = 5) => s.replace(new RegExp(`(.{${n}})(?=.)`, 'g'), '$1-');
async function sha256(bytes) { return new Uint8Array(await subtle().digest('SHA-256', bytes)); }
const b64 = bytes => btoa(String.fromCharCode(...bytes));
const unb64 = s => Uint8Array.from(atob(s.trim()), c => c.charCodeAt(0));

/** Kode perangkat -> hash 8 byte, atau melempar Error bila salah ketik. */
export async function parseDeviceCode(code) {
  let b;
  try { b = unbase32(normalize(code)); } catch { throw new Error('Kode perangkat berisi huruf yang tidak dikenal.'); }
  if (b.length !== 9) throw new Error('Kode perangkat harus 15 huruf/angka (contoh ABCDE-FGHIJ-KLMNO).');
  const h = b.slice(0, 8);
  if ((await sha256(h))[0] !== b[8]) throw new Error('Kode perangkat salah ketik (angka cek tidak cocok). Minta pembeli menyalin ulang.');
  return h;
}
/** Untuk uji: kode perangkat dari packageName + ANDROID_ID (sama dengan LicenseCodec.deviceHash). */
export async function deviceCodeFor(packageName, androidId) {
  const h = (await sha256(new TextEncoder().encode(`KASIRDBL-DEV1|${packageName}|${androidId}`))).slice(0, 8);
  const b = new Uint8Array(9); b.set(h); b[8] = (await sha256(h))[0];
  return group(base32(b));
}

export async function generateKeys() {
  return subtle().generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
}
export async function publicKeyB64(publicKey) { return b64(new Uint8Array(await subtle().exportKey('spki', publicKey))); }
export async function exportPrivateJwk(privateKey) { return subtle().exportKey('jwk', privateKey); }
export async function importPrivateJwk(jwk) { return subtle().importKey('jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign']); }
export async function publicFromPrivateJwk(jwk) {
  const pub = { kty: jwk.kty, crv: jwk.crv, x: jwk.x, y: jwk.y, ext: true };
  return publicKeyB64(await subtle().importKey('jwk', pub, { name: 'ECDSA', namedCurve: 'P-256' }, true, ['verify']));
}
export const dayNumber = (date = new Date()) => Math.max(0, Math.min(65535, Math.floor((Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) - EPOCH_2024) / 86400000)));

/** Membuat kode aktivasi (seumur hidup) untuk satu kode perangkat. */
export async function makeActivationCode(privateKey, deviceCode, plan, date = new Date()) {
  if (!PLANS[plan]) throw new Error('Paket tidak dikenal');
  const hash = await parseDeviceCode(deviceCode), day = dayNumber(date);
  const payload = new Uint8Array(12);
  payload[0] = 1; payload[1] = plan; payload[2] = day >> 8; payload[3] = day & 255; payload.set(hash, 4);
  const msg = new Uint8Array(SIGN_PREFIX.length + 12); msg.set(SIGN_PREFIX); msg.set(payload, SIGN_PREFIX.length);
  const sig = new Uint8Array(await subtle().sign({ name: 'ECDSA', hash: 'SHA-256' }, privateKey, msg));
  if (sig.length !== 64) throw new Error('Browser menghasilkan tanda tangan berformat lain');
  const all = new Uint8Array(76); all.set(payload); all.set(sig, 12);
  return group(base32(all));
}
/** Pemeriksaan di sisi alat (sama dengan aplikasi), dipakai untuk swa-uji sebelum kode dikirim. */
export async function verifyActivationCode(publicB64, deviceCode, code) {
  const raw = unbase32(normalize(code));
  if (raw.length !== 76) return null;
  const payload = raw.slice(0, 12), sig = raw.slice(12);
  const key = await subtle().importKey('spki', unb64(publicB64), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
  const msg = new Uint8Array(SIGN_PREFIX.length + 12); msg.set(SIGN_PREFIX); msg.set(payload, SIGN_PREFIX.length);
  if (!(await subtle().verify({ name: 'ECDSA', hash: 'SHA-256' }, key, sig, msg))) return null;
  const hash = await parseDeviceCode(deviceCode);
  if (hash.some((x, i) => x !== payload[4 + i])) return null;
  return { plan: payload[1], day: (payload[2] << 8) | payload[3] };
}

// ---- cadangan kunci terenkripsi (PBKDF2 + AES-GCM) ----
export async function encryptBackup(obj, password) {
  const salt = crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12));
  const base = await subtle().importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']);
  const key = await subtle().deriveKey({ name: 'PBKDF2', salt, iterations: 250000, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt']);
  const ct = new Uint8Array(await subtle().encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(JSON.stringify(obj))));
  return { format: 'kasirdbl-kunci-lisensi-v1', salt: b64(salt), iv: b64(iv), data: b64(ct) };
}
export async function decryptBackup(file, password) {
  if (file?.format !== 'kasirdbl-kunci-lisensi-v1') throw new Error('Bukan file cadangan kunci KASIR DBL');
  const base = await subtle().importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']);
  const key = await subtle().deriveKey({ name: 'PBKDF2', salt: unb64(file.salt), iterations: 250000, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['decrypt']);
  try { return JSON.parse(new TextDecoder().decode(await subtle().decrypt({ name: 'AES-GCM', iv: unb64(file.iv) }, key, unb64(file.data)))); }
  catch { throw new Error('Kata sandi cadangan salah'); }
}
