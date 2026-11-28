// QRIS & rekening pembayaran: ditampilkan layar penuh untuk dipindai pembeli saat transaksi non-tunai.
// Data akun disimpan di settings (id 'main') -> ikut tersinkron ke semua perangkat toko.
import { all, put } from './db.js';

const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const rupiah = n => 'Rp' + Math.round(Number(n) || 0).toLocaleString('id-ID');
const toast = m => window.toast?.(m);
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

export const PAY_METHODS = ['QRIS', 'Transfer Bank', 'E-Wallet', 'Kartu Debit'];
export const TYPE_LABEL = { qris: 'QRIS', transfer: 'Rekening bank', ewallet: 'E-wallet' };
export const DEFAULT_METHODS = { qris: ['QRIS', 'E-Wallet'], transfer: ['Transfer Bank'], ewallet: ['E-Wallet'] };

// ---------- logika murni (diuji test-payqr.mjs) ----------
export function normalizeAccount(a = {}) {
  const type = TYPE_LABEL[a.type] ? a.type : 'qris';
  const methods = (Array.isArray(a.methods) ? a.methods : DEFAULT_METHODS[type]).filter(m => PAY_METHODS.includes(m));
  return {
    id: a.id || uid(), type,
    label: String(a.label || TYPE_LABEL[type]).trim().slice(0, 40),
    holder: String(a.holder || '').trim().slice(0, 60),
    number: String(a.number || '').trim().slice(0, 40),
    note: String(a.note || '').trim().slice(0, 140),
    image: typeof a.image === 'string' && a.image.startsWith('data:image/') ? a.image : '',
    methods: methods.length ? methods : DEFAULT_METHODS[type],
    active: a.active !== false
  };
}
/** Akun aktif yang bisa ditampilkan untuk sebuah metode pembayaran (punya gambar atau nomor). */
export function accountsFor(settings, method) {
  return (settings?.payAccounts || []).map(normalizeAccount)
    .filter(a => a.active && a.methods.includes(method) && (a.image || a.number));
}
export const autoShow = settings => settings?.payQrAuto !== false;

// ---------- data ----------
let S = null;
async function settings() { const ss = await all('settings'); S = ss.find(x => x.id === 'main') || ss[0] || { id: 'main' }; return S; }
async function saveAccounts(list) {
  const s = await settings();
  await put('settings', { ...s, id: s.id || 'main', payAccounts: list.map(normalizeAccount) });
  await settings();
  renderSettings(); refreshCartBar();
}

// ---------- layar QR untuk pembeli ----------
let pending = null;
function ensureScreen() {
  if ($('payQrScreen')) return $('payQrScreen');
  // <dialog> modal = lapisan teratas, selalu di atas dialog lain (mis. pembayaran piutang).
  const el = document.createElement('dialog');
  el.id = 'payQrScreen'; el.className = 'payqr-screen';
  el.setAttribute('aria-label', 'Pembayaran QRIS / transfer');
  el.addEventListener('cancel', e => { e.preventDefault(); if (pending) { close(); pending.resolve({ ok: false }); pending = null; } });
  document.body.appendChild(el);
  return el;
}
function screenHTML(o) {
  const a = o.accounts[o.index];
  const tabs = o.accounts.length > 1 ? `<div class="payqr-tabs" role="tablist">${o.accounts.map((x, i) => `<button type="button" role="tab" aria-selected="${i === o.index}" class="${i === o.index ? 'on' : ''}" data-pq="tab" data-i="${i}">${esc(x.label)}</button>`).join('')}</div>` : '';
  const store = ($('storeLabel')?.textContent || '').trim();
  return `<div class="payqr-inner">
  <div class="payqr-top"><div><small>${esc(store || 'Pembayaran')}</small><b>${esc(o.method)}</b></div><div class="payqr-total"><small>Total bayar</small><strong>${rupiah(o.total)}</strong></div></div>
  ${tabs}
  <div class="payqr-body">
    ${a.image ? `<img class="payqr-img" src="${a.image}" alt="Kode ${esc(a.label)} untuk dipindai">` : `<div class="payqr-noimg">${esc(TYPE_LABEL[a.type])}</div>`}
    <div class="payqr-info">
      <p class="payqr-label">${esc(a.label)}</p>
      ${a.holder ? `<p>a.n. <b>${esc(a.holder)}</b></p>` : ''}
      ${a.number ? `<p class="payqr-num"><span>${esc(a.number)}</span> <button type="button" class="outline" data-pq="copy">Salin</button></p>` : ''}
      <p class="payqr-how">${a.type === 'qris' ? `Pindai dengan aplikasi bank / e-wallet apa pun, lalu masukkan nominal <b>${rupiah(o.total)}</b>.` : `Transfer tepat <b>${rupiah(o.total)}</b> ke rekening di atas.`}</p>
      ${a.note ? `<p class="muted small">${esc(a.note)}</p>` : ''}
    </div>
  </div>
  <div class="payqr-actions"><button type="button" class="outline" data-pq="back">Kembali</button><button type="button" class="btn payqr-ok" data-pq="ok">${esc(o.okText)}</button></div>
  <p class="payqr-check">Pastikan dana sudah masuk (cek notifikasi / mutasi) sebelum menekan tombol hijau.</p>
</div>`;
}
function draw() { const el = ensureScreen(); el.innerHTML = screenHTML(pending); }

/**
 * Menampilkan QR/rekening untuk pembeli. Resolusi: {ok:boolean, account?:label}.
 * Tidak ada akun untuk metode itu -> langsung {ok:true}.
 */
export async function showPayment({ method, total, okText = 'Pembayaran diterima — simpan', force = false }) {
  const s = await settings();
  const accounts = accountsFor(s, method);
  if (!accounts.length) {
    if (force) toast(`Belum ada QRIS / rekening untuk ${method}. Tambahkan di Pengaturan → QRIS & rekening pembayaran.`);
    return { ok: !force, account: '' };
  }
  if (!force && !autoShow(s)) return { ok: true, account: '' };
  if (pending) pending.resolve({ ok: false });
  return new Promise(resolve => {
    pending = { method, total, accounts, index: 0, okText, resolve };
    draw();
    const el = $('payQrScreen');
    if (!el.open) el.showModal();
    document.body.classList.add('payqr-open');
    el.onclick = async ev => {
      const b = ev.target.closest('[data-pq]'); if (!b || !pending) return;
      const act = b.dataset.pq, acc = pending.accounts[pending.index];
      if (act === 'tab') { pending.index = Number(b.dataset.i) || 0; draw(); return; }
      if (act === 'copy') { try { await navigator.clipboard.writeText(acc.number.replace(/\s/g, '')); toast('Nomor disalin'); } catch { toast(acc.number); } return; }
      if (act === 'back' || act === 'ok') {
        const res = { ok: act === 'ok', account: acc.label };
        close(); pending.resolve(res); pending = null;
      }
    };
  });
}
function close() { const el = $('payQrScreen'); if (el?.open) el.close(); document.body.classList.remove('payqr-open'); }
window.addEventListener('popstate', () => { if (pending) { close(); pending.resolve({ ok: false }); pending = null; } });

// ---------- tombol di keranjang & dialog pembayaran piutang ----------
async function refreshCartBar() {
  const bar = $('payQrBar'); if (!bar) return;
  const s = S || await settings(), method = $('payment')?.value || '';
  const n = accountsFor(s, method).length;
  bar.hidden = !n;
  const btn = $('payQrShow'); if (btn) btn.textContent = `Tampilkan ${method === 'Transfer Bank' ? 'rekening' : 'QRIS'} untuk pembeli`;
  const hint = $('payQrHint'); if (hint) hint.textContent = autoShow(s) ? 'Juga tampil otomatis saat Simpan transaksi.' : '';
}
async function refreshDebtBar() {
  const sel = $('payMethod'); if (!sel) return;
  let b = $('payQrDebt');
  if (!b) {
    b = document.createElement('button'); b.type = 'button'; b.id = 'payQrDebt'; b.className = 'outline full payqr-debt';
    sel.closest('label')?.after(b);
    b.onclick = () => showPayment({ method: sel.value, total: Number($('payAmount')?.value) || 0, okText: 'Selesai', force: true });
  }
  const s = S || await settings(), n = accountsFor(s, sel.value).length;
  b.hidden = !n; b.textContent = `Tampilkan ${sel.value === 'Transfer Bank' ? 'rekening' : 'QRIS'} untuk pembeli`;
}

// ---------- Pengaturan ----------
function renderSettings() {
  const box = $('payAccList'); if (!box) return;
  const list = (S?.payAccounts || []).map(normalizeAccount);
  $('payQrAuto').checked = autoShow(S);
  box.innerHTML = list.length ? list.map(a => `<div class="payacc-row${a.active ? '' : ' off'}">
    ${a.image ? `<img src="${a.image}" alt="">` : `<div class="payacc-noimg">${esc(TYPE_LABEL[a.type])}</div>`}
    <div><b>${esc(a.label)}</b><small>${esc(TYPE_LABEL[a.type])}${a.holder ? ' · a.n. ' + esc(a.holder) : ''}${a.number ? ' · ' + esc(a.number) : ''}</small><small>Untuk: ${a.methods.map(esc).join(', ')}${a.active ? '' : ' · nonaktif'}</small></div>
    <div class="payacc-act"><button type="button" class="outline" data-pa="edit" data-id="${a.id}">Ubah</button><button type="button" class="outline" data-pa="test" data-id="${a.id}">Lihat</button></div>
  </div>`).join('') : '<p class="muted small">Belum ada. Tambahkan QRIS toko (foto/screenshot QRIS dari bank atau penyedia QRIS) atau nomor rekening.</p>';
}
let editImage = '';
function openEditor(a) {
  const d = $('payAccDialog'), x = a ? normalizeAccount(a) : normalizeAccount({ type: 'qris', label: '' });
  $('paId').value = a ? x.id : '';
  $('paType').value = x.type; $('paLabel').value = a ? x.label : ''; $('paHolder').value = x.holder; $('paNumber').value = x.number; $('paNote').value = x.note;
  $('paActive').checked = x.active;
  editImage = x.image; drawEditImage();
  for (const cb of d.querySelectorAll('[name=paMethod]')) cb.checked = x.methods.includes(cb.value);
  $('paDelete').hidden = !a;
  $('paErr').hidden = true;
  typeHints();
  d.showModal();
}
function drawEditImage() { const im = $('paImgPrev'); if (editImage) { im.src = editImage; im.hidden = false; } else { im.removeAttribute('src'); im.hidden = true; } $('paImgRemove').hidden = !editImage; }
function typeHints() {
  const t = $('paType').value;
  $('paNumberLabel').firstChild.textContent = t === 'transfer' ? 'Nomor rekening' : t === 'ewallet' ? 'Nomor HP e-wallet' : 'NMID / nomor (opsional)';
  $('paImgLabel').firstChild.textContent = t === 'qris' ? 'Gambar QRIS (wajib)' : 'Gambar barcode / QR (opsional)';
}
async function loadImageFile(f, max = 1100) {
  const src = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(f); });
  const im = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });
  const k = Math.min(1, max / Math.max(im.width, im.height)), c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(im.width * k)); c.height = Math.max(1, Math.round(im.height * k));
  const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.imageSmoothingQuality = 'high'; g.drawImage(im, 0, 0, c.width, c.height);
  // JPEG kualitas tinggi: ukuran jauh lebih kecil untuk foto stiker QRIS, tetap tajam untuk dipindai.
  return c.toDataURL('image/jpeg', 0.92);
}

function bind() {
  if (!$('payAccDialog')) return;
  $('payAccAdd').onclick = () => openEditor(null);
  $('payQrAuto').onchange = async e => { const s = await settings(); await put('settings', { ...s, id: s.id || 'main', payQrAuto: e.target.checked }); await settings(); refreshCartBar(); toast(e.target.checked ? 'QRIS tampil otomatis saat Simpan transaksi' : 'QRIS hanya tampil lewat tombol'); };
  $('payAccList').onclick = async e => {
    const b = e.target.closest('[data-pa]'); if (!b) return;
    const a = (S?.payAccounts || []).find(x => x.id === b.dataset.id); if (!a) return;
    if (b.dataset.pa === 'edit') openEditor(a);
    else showPayment({ method: normalizeAccount(a).methods[0], total: 0, okText: 'Tutup', force: true });
  };
  $('paType').onchange = () => {
    typeHints();
    const t = $('paType').value;
    for (const cb of document.querySelectorAll('[name=paMethod]')) cb.checked = DEFAULT_METHODS[t].includes(cb.value);
  };
  $('paImg').onchange = async e => {
    const f = e.target.files[0]; e.target.value = '';
    if (!f) return;
    if (!/^image\//.test(f.type)) return toast('File harus berupa gambar');
    if (f.size > 8 * 1024 * 1024) return toast('Ukuran gambar maksimal 8 MB');
    try { editImage = await loadImageFile(f); drawEditImage(); } catch { toast('Gambar tidak dapat dibaca'); }
  };
  $('paImgRemove').onclick = () => { editImage = ''; drawEditImage(); };
  $('paSave').onclick = async e => {
    e.preventDefault();
    const err = msg => { $('paErr').textContent = msg; $('paErr').hidden = false; };
    const type = $('paType').value, methods = [...document.querySelectorAll('[name=paMethod]:checked')].map(x => x.value);
    if (!$('paLabel').value.trim()) return err('Isi nama akun, mis. "QRIS Bumbu Lengkep" atau "BRI a.n. Budi".');
    if (type === 'qris' && !editImage) return err('Pilih gambar QRIS (foto atau screenshot QRIS toko).');
    if (type !== 'qris' && !editImage && !$('paNumber').value.trim()) return err('Isi nomor rekening / HP atau pilih gambar barcode.');
    if (!methods.length) return err('Pilih minimal satu metode pembayaran.');
    const id = $('paId').value, list = [...(S?.payAccounts || [])];
    const acc = normalizeAccount({ id: id || undefined, type, label: $('paLabel').value, holder: $('paHolder').value, number: $('paNumber').value, note: $('paNote').value, image: editImage, methods, active: $('paActive').checked });
    const i = list.findIndex(x => x.id === id);
    if (i >= 0) list[i] = acc; else list.push(acc);
    await saveAccounts(list);
    $('payAccDialog').close();
    toast(id ? 'Akun pembayaran diperbarui' : 'Akun pembayaran ditambahkan');
  };
  $('paDelete').onclick = async () => {
    const id = $('paId').value; if (!id || !confirm('Hapus akun pembayaran ini?')) return;
    await saveAccounts((S?.payAccounts || []).filter(x => x.id !== id));
    $('payAccDialog').close(); toast('Akun pembayaran dihapus');
  };
  for (const x of document.querySelectorAll('#payAccDialog [data-close]')) x.onclick = () => $('payAccDialog').close();
}

export async function initPayQr() {
  await settings();
  bind(); renderSettings(); refreshCartBar();
  $('payment')?.addEventListener('change', refreshCartBar);
  $('payQrShow') && ($('payQrShow').onclick = () => { window.__payQrForce = true; $('completeSale').click(); });
  $('payMethod')?.addEventListener('change', refreshDebtBar);
  $('payDialog') && new MutationObserver(() => { if ($('payDialog').open) refreshDebtBar(); }).observe($('payDialog'), { attributes: true, attributeFilter: ['open'] });
}
/** Dipanggil setelah data tersinkron / dimuat ulang. */
export async function reloadPayQr() { await settings(); renderSettings(); refreshCartBar(); }

window.payQr = { show: showPayment, reload: reloadPayQr };
