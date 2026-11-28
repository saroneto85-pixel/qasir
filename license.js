// Lisensi KASIR DBL di sisi tampilan: layar aktivasi + kunci menu.
// Pemeriksaan kode aktivasi (tanda tangan digital, cocok-perangkat, keaslian APK) terjadi di native (LicensePlugin),
// JS hanya menampilkan hasilnya. Perangkat tambahan yang tersambung ke Perangkat Utama tidak perlu kode sendiri.
import { Capacitor, registerPlugin } from '@capacitor/core';
import { Share } from '@capacitor/share';
import { onSyncState } from './sync.js';

const hasPlugin = Capacitor.isNativePlatform() || !!Capacitor.isPluginAvailable?.('License');
const License = hasPlugin ? registerPlugin('License') : null;
const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const toast = m => window.toast?.(m);
// Kontak pengembang (permintaan kode aktivasi & bantuan)
export const DEV_NAME = 'Mustanir Enterpreuner';
export const DEV_EMAIL = 'saroneto85@gmail.com';
export const DEV_WA = '6281373702192';
export const DEV_WA_TEXT = '+62 813-7370-2192';
export const waLink = text => `https://wa.me/${DEV_WA}${text ? '?text=' + encodeURIComponent(text) : ''}`;
/** Buka WhatsApp (Android meneruskan tautan wa.me ke aplikasi WhatsApp). */
export function openWa(text) { const a = document.createElement('a'); a.href = waLink(text); a.rel = 'noopener'; document.body.appendChild(a); a.click(); a.remove(); }
export const PLAN_TEXT = { Basic: 'Basic — 1 perangkat', Toko: 'Toko — 1 utama + 2 tambahan', Pro: 'Pro — 1 utama + 5 tambahan', Pemilik: 'Pemilik — tanpa batas' };

let lic = null;              // hasil License.status()
let sync = { mode: 'standalone', available: false };
let licLoaded = false, syncKnown = false, joining = false, upgrade = false;
const listeners = new Set();

export const licenseState = () => lic;
export const onLicense = fn => { listeners.add(fn); return () => listeners.delete(fn); };
const ready = () => licLoaded && syncKnown;
/** Terkunci = belum ada lisensi sah di perangkat ini DAN bukan perangkat tambahan yang tersambung. */
export const isLocked = () => ready() && !lic?.valid && sync.mode !== 'client';

/** Dipanggil app.js sebelum membuka halaman. */
export function licenseGuard(page) {
  if (!isLocked()) return true;
  if (joining && page === 'settings') return true;
  showOverlay();
  return false;
}

async function load() {
  try { lic = License ? await License.status() : { web: true, valid: false, configured: false, genuine: true, deviceCode: '' }; }
  catch (e) { lic = { valid: false, error: String(e?.message || e), configured: true, genuine: true, deviceCode: '' }; }
  licLoaded = true;
  apply();
}

function apply() {
  if (!ready()) return;
  const locked = isLocked();
  document.body.classList.toggle('lic-locked', locked);
  if (!locked) { joining = false; document.body.classList.remove('lic-joining'); if (!upgrade) hideOverlay(); }
  else if (!joining) showOverlay();
  renderInfo();
  for (const fn of listeners) { try { fn(lic); } catch (e) { console.warn(e); } }
}

// ---------- layar aktivasi ----------
function ensureOverlay() {
  if ($('licOverlay')) return $('licOverlay');
  const el = document.createElement('div');
  el.id = 'licOverlay';
  el.className = 'lic-overlay';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-modal', 'true');
  el.setAttribute('aria-labelledby', 'licTitle');
  el.hidden = true;
  document.body.appendChild(el);
  return el;
}

function overlayHTML() {
  const L = lic || {};
  const head = `<div class="lic-head"><img src="${esc($('brandLogo')?.getAttribute('src') || 'logo-dbl.png')}" alt=""><div><h2 id="licTitle">${upgrade ? 'Ganti / tingkatkan lisensi' : 'Aktivasi KASIR DBL'}</h2><p>${upgrade ? `Lisensi sekarang: ${esc(PLAN_TEXT[L.planName] || L.planName || '-')}` : 'Aplikasi perlu diaktifkan sekali di perangkat ini.'}</p></div>${upgrade ? '<button type="button" class="lic-x" data-lic="close" aria-label="Tutup">×</button>' : ''}</div>`;
  const dev = `<p class="lic-dev">Pengembang: <b>${esc(DEV_NAME)}</b> · <a href="${waLink()}">WA ${esc(DEV_WA_TEXT)}</a> · <a href="mailto:${DEV_EMAIL}?subject=KASIR%20DBL">${DEV_EMAIL}</a></p>`;
  if (L.web) return head + '<div class="lic-card"><p><b>Aplikasi ini hanya berjalan sebagai aplikasi Android resmi.</b></p><p class="muted">Pasang APK KASIR DBL dari penjual.</p></div>' + dev;
  if (L.genuine === false) return head + '<div class="lic-card lic-bad"><p><b>APK ini bukan versi resmi.</b></p><p>Tanda tangan aplikasi berbeda dari aslinya, sehingga tidak bisa diaktifkan. Hapus aplikasi ini lalu pasang APK resmi dari penjual. Data penjualan bisa dipulihkan dari file cadangan.</p></div>' + dev;
  if (L.configured === false) return head + '<div class="lic-card lic-bad"><p><b>Build ini belum memuat kunci lisensi.</b></p><p>Hubungi penjual untuk APK yang benar.</p></div>' + dev;
  return head + `
<div class="lic-card">
  <p class="lic-step"><span>1</span> Kirim kode perangkat ini ke penjual</p>
  <div class="lic-code" id="licDevCode">${esc(L.deviceCode || '—')}</div>
  <button type="button" class="btn lic-wa" data-lic="wa">Minta kode aktivasi via WhatsApp</button>
  <p class="muted small lic-wa-note">Ke ${esc(DEV_WA_TEXT)} (${esc(DEV_NAME)}). Kode perangkat otomatis terisi di pesan.</p>
  <div class="lic-row"><button type="button" class="outline" data-lic="copy">Salin kode</button><button type="button" class="outline" data-lic="share">Bagikan lewat aplikasi lain</button></div>
  <p class="lic-step"><span>2</span> Tempel kode aktivasi dari penjual</p>
  <textarea id="licInput" rows="4" spellcheck="false" autocomplete="off" autocapitalize="characters" placeholder="ABCDE-FGHIJ-…"></textarea>
  <p class="lic-err" id="licErr" role="alert" hidden></p>
  <button type="button" class="btn lic-go" data-lic="activate">Aktifkan</button>
  <p class="muted small">Paket: Basic (1 perangkat) · Toko (1 utama + 2 tambahan) · Pro (1 utama + 5 tambahan). Lisensi berlaku seumur hidup untuk perangkat ini.</p>
</div>
${upgrade ? '' : `<div class="lic-card lic-join">
  <p><b>Ini perangkat tambahan (pelayan / dapur / kasir kedua)?</b></p>
  <p class="muted small">Tidak perlu kode aktivasi. Sambungkan ke Perangkat Utama toko yang sudah aktif, lewat Wi-Fi yang sama.</p>
  <button type="button" class="outline" data-lic="join">Sambungkan ke Perangkat Utama</button>
</div>`}
${L.error ? `<p class="muted small">Catatan: ${esc(L.error)}</p>` : ''}
<p class="lic-dev">Pengembang: <b>${esc(DEV_NAME)}</b> · <a href="${waLink()}">WA ${esc(DEV_WA_TEXT)}</a> · <a href="mailto:${DEV_EMAIL}?subject=Aktivasi%20KASIR%20DBL">${DEV_EMAIL}</a></p>`;
}

export function showOverlay(opts = {}) {
  if (opts.upgrade !== undefined) upgrade = !!opts.upgrade;
  const el = ensureOverlay();
  el.innerHTML = overlayHTML();
  el.hidden = false;
  document.body.classList.add('lic-open');
  el.onclick = onClick;
  el.querySelector('#licInput')?.addEventListener('input', () => { const e = $('licErr'); if (e) e.hidden = true; });
}
function hideOverlay() {
  const el = $('licOverlay');
  if (el) el.hidden = true;
  document.body.classList.remove('lic-open');
  upgrade = false;
}

async function onClick(ev) {
  const b = ev.target.closest('[data-lic]');
  if (!b) return;
  const act = b.dataset.lic, code = lic?.deviceCode || '';
  if (act === 'close') { hideOverlay(); return; }
  if (act === 'copy') {
    try { await navigator.clipboard.writeText(code); toast('Kode perangkat disalin'); }
    catch { const r = document.createRange(); r.selectNodeContents($('licDevCode')); getSelection().removeAllRanges(); getSelection().addRange(r); toast('Tekan lama lalu Salin'); }
    return;
  }
  const store = (document.getElementById('storeLabel')?.textContent || '').trim();
  const text = `Halo ${DEV_NAME}, saya ingin ${upgrade ? 'meningkatkan paket' : 'aktivasi'} KASIR DBL.\nKode perangkat: ${code}${store ? `\nNama toko: ${store}` : ''}${upgrade && lic?.planName ? `\nPaket sekarang: ${lic.planName}` : ''}\nPaket yang diminta: (Basic / Toko / Pro)`;
  if (act === 'wa') { openWa(text); return; }
  if (act === 'share') {
    try { await Share.share({ title: 'Kode perangkat KASIR DBL', text, dialogTitle: 'Kirim ke penjual — pilih WhatsApp' }); }
    catch (e) { if (!/cancel/i.test(String(e?.message || e))) { try { await navigator.clipboard.writeText(text); toast('Pesan disalin; tempel di WhatsApp'); } catch { toast('Salin kode secara manual'); } } }
    return;
  }
  if (act === 'activate') {
    const input = $('licInput'), err = $('licErr'), val = (input?.value || '').trim();
    if (!val) { err.textContent = 'Tempel kode aktivasi dulu.'; err.hidden = false; input?.focus(); return; }
    b.disabled = true; b.textContent = 'Memeriksa…';
    try {
      lic = await License.activate({ code: val });
      upgrade = false;
      hideOverlay();
      toast(`Lisensi aktif: paket ${PLAN_TEXT[lic.planName] || lic.planName}`);
      apply();
    } catch (e) {
      err.textContent = String(e?.message || e).replace(/^Error:\s*/, '');
      err.hidden = false;
      b.disabled = false; b.textContent = 'Aktifkan';
    }
    return;
  }
  if (act === 'join') startJoin();
}

function startJoin() {
  joining = true;
  hideOverlay();
  document.body.classList.add('lic-joining');
  window.__activatePage?.('settings');
  if (!$('licJoinBar')) {
    const bar = document.createElement('div');
    bar.id = 'licJoinBar';
    bar.className = 'lic-join-bar';
    bar.innerHTML = '<p><b>Mode sambung perangkat tambahan.</b> Tekan “Gabung ke Perangkat Utama” di bawah, lalu masukkan kode pairing yang tampil di Perangkat Utama.</p><button type="button" class="outline" id="licBackToActivate">Kembali ke aktivasi</button>';
    $('settings')?.prepend(bar);
    $('licBackToActivate').onclick = () => { joining = false; document.body.classList.remove('lic-joining'); showOverlay(); };
  }
  setTimeout(() => $('syncPanel')?.scrollIntoView({ block: 'start' }), 100);
}

// ---------- info lisensi di Pengaturan ----------
function renderInfo() {
  const box = $('licenseInfo');
  if (!box || !lic) return;
  if (sync.mode === 'client' && !lic.valid) {
    box.innerHTML = '<p>Perangkat tambahan — mengikuti lisensi Perangkat Utama.</p>' + (lic.deviceCode ? `<p class="muted small">Kode perangkat: <code>${esc(lic.deviceCode)}</code></p>` : '');
    return;
  }
  if (!lic.valid) { box.innerHTML = '<p>Belum aktif.</p>'; return; }
  const day = lic.issuedEpochDay ? new Date(lic.issuedEpochDay * 86400000).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }) : '';
  const extra = lic.extraDevices < 0 ? 'tanpa batas' : lic.extraDevices === 0 ? 'tidak ada' : `${lic.extraDevices} perangkat`;
  box.innerHTML = `<p><b>Paket ${esc(lic.planName)}</b> · seumur hidup</p>
<p class="muted small">Perangkat tambahan: ${extra}${day ? ` · kode dibuat ${esc(day)}` : ''}</p>
<p class="muted small">Kode perangkat: <code>${esc(lic.deviceCode)}</code></p>
<button type="button" class="outline" id="licUpgrade">Masukkan kode aktivasi baru (tingkatkan paket)</button>`;
  $('licUpgrade').onclick = () => showOverlay({ upgrade: true });
}

// ---------- mulai ----------
onSyncState(s => {
  const wasClient = sync.mode === 'client';
  sync = s || sync;
  if (s?.available || !Capacitor.isNativePlatform()) syncKnown = true;
  if (!wasClient && sync.mode === 'client' && joining) { toast('Tersambung ke Perangkat Utama'); window.__activatePage?.('dashboard'); }
  apply();
});
setTimeout(() => { syncKnown = true; apply(); }, 4000); // sinkronisasi tidak tersedia -> tetap lanjut
load();

window.kasirLicense = { state: licenseState, isLocked, show: showOverlay, refresh: load };
