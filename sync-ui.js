// Panel "Sinkronisasi antar perangkat" di Pengaturan + indikator status di kepala aplikasi.
import { all, isNative } from './db.js';
import { LanSync, onSyncState, syncEngine, backupRows } from './sync.js';
import { PAGE_LABELS, FEATURE_LABELS, PAGES, FEATURES, PRESETS, normalize } from './permissions.js';

const $ = id => document.getElementById(id);
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const toast = s => window.toast?.(s);
const pin = async reason => (window.requirePin ? window.requirePin(reason) : true);
const ago = t => {
  if (!t) return 'belum pernah';
  const s = Math.max(0, Math.round((Date.now() - t) / 1000));
  if (s < 60) return 'baru saja';
  if (s < 3600) return Math.floor(s / 60) + ' menit lalu';
  if (s < 86400) return Math.floor(s / 3600) + ' jam lalu';
  return new Date(t).toLocaleDateString('id-ID');
};
const json = (s, d) => { try { return JSON.parse(s); } catch { return d; } };

let st = { mode: 'standalone', available: false };
let target = null; // Perangkat Utama yang dipilih di dialog gabung
let devList = [];  // perangkat terdaftar (Perangkat Utama)

// ---------- indikator di kepala ----------
function badge() {
  let el = $('syncChip');
  const label = $('storeLabel');
  if (!el && label) {
    el = document.createElement('button');
    el.id = 'syncChip';
    el.type = 'button';
    el.className = 'sync-chip';
    el.onclick = () => window.showPage?.('settings').then?.(() => $('syncPanel')?.scrollIntoView({ behavior: 'smooth' }));
    label.insertAdjacentElement('afterend', el);
  }
  if (!el) return;
  if (st.mode === 'standalone' || !st.available) { el.hidden = true; return; }
  el.hidden = false;
  const devs = json(st.native?.devices, []);
  const onlineDevs = devs.filter(d => d.online).length;
  let cls = 'ok', text;
  if (st.needsRepair) { cls = 'bad'; text = 'Perlu disambungkan ulang'; }
  else if (st.mode === 'server') {
    if (!st.native?.serverRunning) { cls = 'bad'; text = 'Server toko mati'; }
    else text = `Server toko · ${onlineDevs} perangkat`;
  } else if (st.online) text = st.pending ? `Online · kirim ${st.pending}` : 'Online toko';
  else { cls = 'warn'; text = st.pending ? `Offline · ${st.pending} menunggu` : 'Offline'; }
  el.className = 'sync-chip ' + cls;
  el.textContent = '● ' + text;
}

// ---------- panel pengaturan ----------
function render() {
  badge();
  const body = $('syncBody');
  if (!body) return;
  const b = $('syncBadge');
  if (b) b.textContent = { standalone: 'Mandiri', server: 'Perangkat Utama', client: 'Perangkat Tambahan' }[st.mode] || st.mode;
  if (!isNative) {
    body.innerHTML = '<p class="muted">Sinkronisasi antar perangkat hanya tersedia di aplikasi Android (APK), bukan di browser.</p>';
    return;
  }
  if (!st.available) { body.innerHTML = `<p class="muted small">${esc(st.lastError || 'Memuat status sinkronisasi…')}</p>`; return; }
  if (st.busy) { body.innerHTML = `<p class="sync-busy">⏳ ${esc(st.busy)}</p>`; return; }
  const n = st.native || {};
  if (st.mode === 'server') body.innerHTML = serverHtml(n);
  else if (st.mode === 'client') body.innerHTML = clientHtml(n);
  else body.innerHTML = standaloneHtml();
}

function standaloneHtml() {
  return `<p>Hubungkan beberapa HP/tablet di toko ke satu <b>Kasir Induk</b> lewat Wi-Fi atau hotspot yang sama. Perangkat saling menemukan otomatis — tidak perlu mengetik alamat IP.</p>
  <div class="sync-choice">
    <div><h3>Perangkat Utama (Kasir Induk)</h3><p class="muted small">Menyimpan database utama toko dan menjalankan server lokal di latar belakang. Data di perangkat ini menjadi data induk.</p><button class="btn full" type="button" onclick="syncUi.beServer()">Jadikan Perangkat Utama</button></div>
    <div><h3>Perangkat Tambahan</h3><p class="muted small">Untuk pelayan, dapur, atau kasir kedua. Data diambil dari Perangkat Utama dan perubahan dikirim balik otomatis.</p><button class="outline full" type="button" onclick="syncUi.openJoin()">Gabung ke Perangkat Utama</button></div>
  </div>
  ${st.lastError ? `<p class="muted small">${esc(st.lastError)}</p>` : ''}`;
}

function serverHtml(n) {
  const ips = json(n.ips, []);
  const port = n.serverPort || 8686;
  const devs = devList = json(n.devices, []);
  const code = String(n.pairCode || '').replace(/(\d{3})(\d{3})/, '$1 $2');
  return `<div class="sync-status ${n.serverRunning ? 'ok' : 'bad'}">
      <b>${n.serverRunning ? '● Server toko aktif' : '○ Server toko berhenti'}</b>
      <span>${n.serverRunning ? (ips.length ? ips.map(ip => esc(ip + ':' + port)).join(' · ') : 'Belum ada Wi-Fi/hotspot') : esc(n.serverError || 'Perangkat tambahan tidak bisa sinkron sampai server dijalankan.')}</span>
      ${n.serverRunning ? '<button class="outline" type="button" onclick="syncUi.stopServer()">Hentikan</button>' : '<button class="btn" type="button" onclick="syncUi.startServer()">Jalankan server</button>'}
    </div>
    <div class="sync-pair"><div><small class="muted">Kode pairing untuk perangkat tambahan</small><div class="sync-code">${esc(code)}</div></div><button class="outline" type="button" onclick="syncUi.newCode()">Kode baru</button></div>
    <h3>Perangkat terhubung (${devs.length})</h3>
    ${devs.length ? `<div class="sync-devs">${devs.map((d, i) => `<div class="sync-dev"><span class="dot ${d.online ? 'ok' : ''}"></span><div><b>${esc(d.name)}</b> <span class="debt-tag">${esc(d.code)}</span><br><small class="muted">${d.online ? 'online' : 'terakhir ' + ago(d.lastSeen)}</small><span class="perm-sum">Akses: ${esc(permSummary(d.perms))}</span></div><button class="link" type="button" onclick="syncUi.openPerms(${i})">Akses</button><button class="link danger" type="button" onclick="syncUi.revoke(${i})">Cabut</button></div>`).join('')}</div>` : '<p class="muted small">Belum ada. Di HP/tablet lain: Pengaturan → Sinkronisasi → <b>Gabung ke Perangkat Utama</b>, lalu masukkan kode di atas.</p>'}
    <p class="muted small">Data induk: ${Number(n.records || 0).toLocaleString('id-ID')} record · revisi ${Number(n.latest || 0).toLocaleString('id-ID')} · menunggu dikirim ${st.pending || 0}</p>
    ${staticIpGuide(ips[0] || '192.168.1.10', port)}
    <button class="outline full danger" type="button" onclick="syncUi.leave()">Berhenti menjadi Perangkat Utama</button>`;
}

function clientHtml(n) {
  const code = n.deviceCode || '';
  const sample = 'INV-' + new Date().toISOString().slice(0, 10).replace(/-/g, '') + '-' + (code ? code + '-' : '') + '001';
  return `${st.needsRepair ? `<div class="sync-status bad"><b>⚠ ${esc(st.lastError || 'Perlu disambungkan ulang')}</b><button class="btn" type="button" onclick="syncUi.openJoin()">Sambungkan ulang</button></div>` : `
    <div class="sync-status ${st.online ? 'ok' : 'warn'}"><b>${st.online ? '● Online di toko' : '○ Offline'}</b><span>${st.online ? 'Tersambung ke Perangkat Utama' : esc(st.lastError || 'Mencari Perangkat Utama…')}</span></div>`}
    <p>Toko: <b>${esc(n.storeName || '—')}</b><br><small class="muted">Perangkat Utama: ${esc((n.host || '?') + ':' + (n.port || ''))} (ditemukan otomatis lewat NSD)</small></p>
    <p class="small">Perangkat ini: <b>${esc(n.deviceName || 'Perangkat tambahan')}</b> <span class="debt-tag">${esc(code)}</span><br><small class="muted">Nomor nota dari perangkat ini: ${esc(sample)}</small></p>
    <p class="muted small">Menunggu dikirim: ${st.pending || 0} perubahan · sinkron terakhir: ${ago(st.lastSync)}</p>
    <p class="small">Akses perangkat ini: <b>${esc(st.perms ? permSummary(st.perms) : 'menunggu Perangkat Utama…')}</b><br><small class="muted">Diatur owner di Perangkat Utama → Pengaturan → Perangkat terhubung → Akses.</small></p>
    <p class="muted small">Aplikasi tetap bisa dipakai saat Wi-Fi putus; perubahan dikirim otomatis begitu tersambung lagi.</p>
    <div class="sync-actions"><button class="btn" type="button" onclick="syncUi.syncNow()">Sinkronkan sekarang</button><button class="outline danger" type="button" onclick="syncUi.leave()">Putuskan (jadi Mandiri)</button></div>`;
}

function staticIpGuide(ip, port) {
  return `<details class="sync-guide"><summary>Panduan IP tetap (DHCP Reservation) di router</summary>
  <p class="small">Perangkat tambahan menemukan Kasir Induk otomatis lewat NSD. IP tetap membuat sambungan ulang lebih cepat dan tetap jalan bila jaringan memblokir pencarian otomatis.</p>
  <ol class="small">
    <li>Di HP ini: <b>Setelan → Wi-Fi → (nama Wi-Fi toko) → Privasi</b> → pilih <b>Gunakan MAC perangkat</b> (bukan MAC acak). Catat <b>alamat MAC</b> di halaman yang sama.</li>
    <li>Buka halaman admin router (biasanya <b>192.168.1.1</b> atau <b>192.168.0.1</b>; lihat stiker di bawah router).</li>
    <li>Cari menu <b>DHCP → Address Reservation / Static Lease / IP-MAC Binding</b>.</li>
    <li>Tambahkan MAC HP ini dengan IP tetap, mis. <b>${esc(ip)}</b> (sebaiknya di luar rentang DHCP otomatis, mis. .200–.250, bila router mengizinkan).</li>
    <li>Simpan, lalu matikan-nyalakan Wi-Fi di HP ini. Server toko memakai port <b>${esc(port)}</b>.</li>
  </ol>
  <p class="muted small">Bila memakai hotspot HP: jadikan HP Kasir Induk sebagai pemancar hotspot, atau pastikan semua perangkat tersambung ke hotspot yang sama. Matikan "AP isolation / Isolasi klien" di router bila perangkat tidak saling menemukan.</p></details>`;
}

// ---------- izin akses perangkat tambahan ----------
function permSummary(keys) {
  const k = normalize(keys || []);
  for (const [, p] of Object.entries(PRESETS)) if (JSON.stringify(normalize(p.keys)) === JSON.stringify(k)) return p.label;
  const pages = k.filter(x => PAGES.includes(x)).length;
  return `${pages} menu${k.includes('cost') ? ', HPP & laba' : ''}${k.includes('txEdit') ? ', edit transaksi' : ''}`;
}
let permTarget = null;
function permDialog() {
  let d = $('permDialog');
  if (d) return d;
  document.body.insertAdjacentHTML('beforeend', `<dialog id="permDialog"><form method="dialog" id="permForm"><div class="modal-head"><h2 id="permTitle">Akses perangkat</h2><button type="button" class="x" data-close aria-label="Tutup">×</button></div>
    <p class="muted small">Perangkat ini hanya bisa membuka menu dan fitur yang dicentang. Data dari menu yang tidak dicentang (mis. laba rugi, neraca, gaji) <b>tidak dikirim</b> ke perangkat tersebut, dan perubahan ke data itu ditolak.</p>
    <div class="perm-presets">${Object.entries(PRESETS).map(([k, p]) => `<button type="button" class="outline" data-preset="${k}">${esc(p.label)}</button>`).join('')}</div>
    <h3>Menu</h3><div class="perm-grid">${PAGES.map(k => `<label class="chk"><input type="checkbox" name="perm" value="${k}"> ${esc(PAGE_LABELS[k])}</label>`).join('')}</div>
    <h3>Fitur sensitif</h3><div class="perm-grid">${FEATURES.map(k => `<label class="chk"><input type="checkbox" name="perm" value="${k}"> ${esc(FEATURE_LABELS[k])}</label>`).join('')}</div>
    <p class="muted small" id="permHint"></p>
    <menu><button type="button" class="outline" data-close>Batal</button><button type="button" class="btn" id="permSave">Simpan akses</button></menu></form></dialog>`);
  d = $('permDialog');
  const boxes = () => [...d.querySelectorAll('input[name=perm]')];
  const sync = () => {
    const sel = boxes().filter(b => b.checked).map(b => b.value), norm = normalize(sel);
    const cost = d.querySelector('input[value=cost]');
    const forced = norm.includes('cost') && !sel.includes('cost');
    cost.checked = norm.includes('cost'); cost.disabled = forced;
    $('permHint').textContent = forced ? 'HPP & laba otomatis terbuka karena menu HPP Menu / Neraca Awal / Pembukuan / Evaluasi dipilih.' : '';
  };
  d.addEventListener('change', sync);
  d.querySelectorAll('[data-preset]').forEach(b => b.onclick = () => {
    const keys = PRESETS[b.dataset.preset].keys;
    boxes().forEach(x => { x.checked = keys.includes(x.value); x.disabled = false; });
    sync();
  });
  $('permSave').onclick = async () => {
    const keys = normalize(boxes().filter(b => b.checked).map(b => b.value));
    try {
      await LanSync.setDevicePerms({ deviceId: permTarget.deviceId, keys: JSON.stringify(keys) });
      d.close();
      toast(`Akses ${permTarget.name} diperbarui. Perangkat menyesuaikan dalam beberapa detik.`);
      await refresh();
    } catch (e) { toast('Gagal menyimpan akses: ' + (e.message || e)); }
  };
  d._sync = sync;
  return d;
}
async function openPerms(i) {
  const dev = devList[i];
  if (!dev) return;
  if (!await pin('mengatur akses perangkat')) return;
  permTarget = dev;
  const d = permDialog(), keys = normalize(dev.perms || []);
  $('permTitle').textContent = `Akses: ${dev.name} (${dev.code})`;
  d.querySelectorAll('input[name=perm]').forEach(b => { b.checked = keys.includes(b.value); b.disabled = false; });
  d._sync();
  d.showModal();
}

// ---------- aksi ----------
async function refresh() {
  const e = syncEngine();
  if (e) await e.refreshNative().catch(() => {});
}

async function beServer() {
  if (!await pin('menjadikan perangkat ini Perangkat Utama')) return;
  if (!confirm('Jadikan perangkat ini PERANGKAT UTAMA (Kasir Induk)?\n\nSeluruh data di perangkat ini menjadi data induk toko. Perangkat tambahan yang pernah tersambung ke Perangkat Utama lain harus disambungkan ulang.')) return;
  const e = syncEngine();
  const s = (await all('settings')).find(x => x.id === 'main') || {};
  try {
    await e.becomeServer({ storeName: s.name || 'Toko', progress: (d, t) => { st = { ...st, busy: `Menyalin data induk… ${d}/${t}` }; render(); } });
    toast('Perangkat Utama aktif. Masukkan kode pairing di perangkat tambahan.');
  } catch (err) {
    toast('Gagal: ' + (err.message || err));
  }
}

async function startServer() {
  try { await LanSync.startServer(); toast('Server toko berjalan'); } catch (e) { toast(e.message || String(e)); }
  await refresh();
}
async function stopServer() {
  if (!await pin('menghentikan server toko')) return;
  if (!confirm('Hentikan server? Perangkat tambahan akan offline sampai server dijalankan lagi.')) return;
  await LanSync.stopServer({ keepAutoStart: false }).catch(e => toast(e.message));
  await refresh();
}
async function newCode() {
  await LanSync.newPairCode().catch(e => toast(e.message));
  await refresh();
}
async function revoke(i) {
  const d = devList[i];
  if (!d) return;
  const { token, name } = d;
  if (!await pin('mencabut perangkat')) return;
  if (!confirm(`Cabut "${name}"? Perangkat tersebut tidak bisa sinkron lagi sampai dipasangkan ulang.`)) return;
  await LanSync.revokeDevice({ token }).catch(e => toast(e.message));
  await refresh();
}
async function leave() {
  const server = st.mode === 'server';
  if (!await pin(server ? 'menghentikan Perangkat Utama' : 'memutus sinkronisasi')) return;
  const extra = st.pending ? `\n\nPERHATIAN: ${st.pending} perubahan belum terkirim dan tidak akan dikirim.` : '';
  const msg = server
    ? 'Berhenti menjadi Perangkat Utama? Server dimatikan dan semua perangkat tambahan tidak bisa sinkron lagi. Data di perangkat ini tetap ada.'
    : 'Putuskan perangkat ini dari Perangkat Utama? Data yang sudah ada tetap tersimpan di perangkat ini sebagai salinan terpisah.';
  if (!confirm(msg + extra)) return;
  await syncEngine().leave().catch(e => toast(e.message));
  toast('Perangkat kembali ke mode Mandiri');
}
async function syncNow() {
  try { await syncEngine().syncNow(); toast('Sinkron selesai'); } catch (e) { toast('Belum tersambung: ' + (e.message || e)); }
}

// ---------- dialog gabung ----------
async function openJoin() {
  const s = (await all('settings')).find(x => x.id === 'main') || {};
  if (s.pinHash && !await pin('menggabungkan perangkat ke Perangkat Utama')) return;
  target = null;
  $('syncFound').innerHTML = '';
  $('syncPairBox').hidden = true;
  $('syncJoinMsg').textContent = '';
  $('syncDeviceName').value = st.native?.deviceName || '';
  $('syncJoinDialog').showModal();
  scan();
}

async function scan() {
  const btn = $('syncScan');
  btn.disabled = true;
  btn.textContent = '🔍 Mencari di Wi-Fi ini…';
  $('syncJoinMsg').textContent = '';
  try {
    const r = await LanSync.discover({ timeoutMs: 5000 });
    const list = json(r.servers, []);
    $('syncFound').innerHTML = list.length
      ? list.map((x, i) => `<button type="button" class="sync-server" data-i="${i}"><b>${esc(x.storeName || x.serviceName)}</b><small>${esc(x.host + ':' + x.port)}</small></button>`).join('')
      : '<p class="muted small">Belum ditemukan. Pastikan Kasir Induk sudah “Jadikan Perangkat Utama”, servernya aktif, dan kedua perangkat memakai Wi-Fi/hotspot yang sama. Coba cari lagi, atau masukkan alamat manual di bawah.</p>';
    $('syncFound').querySelectorAll('.sync-server').forEach(b => b.onclick = () => choose(list[Number(b.dataset.i)]));
    if (list.length === 1) choose(list[0]);
  } catch (e) {
    $('syncJoinMsg').textContent = 'Pencarian gagal: ' + (e.message || e);
  } finally {
    btn.disabled = false;
    btn.textContent = '🔍 Cari ulang Perangkat Utama';
  }
}

function choose(x) {
  target = x;
  $('syncFound').querySelectorAll('.sync-server').forEach(b => b.classList.toggle('selected', b.querySelector('small')?.textContent === x.host + ':' + x.port));
  $('syncPairTarget').innerHTML = `Sambungkan ke <b>${esc(x.storeName || 'Perangkat Utama')}</b> <small class="muted">(${esc(x.host + ':' + x.port)})</small>`;
  $('syncPairBox').hidden = false;
  $('syncPairCode').focus();
}

async function manualCheck() {
  const host = $('syncManualHost').value.trim(), port = Number($('syncManualPort').value) || 8686;
  if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return toast('Alamat IP tidak valid');
  try {
    const r = await LanSync.probe({ host, port });
    const info = json(r.info, {});
    if (info.app !== 'kasir-dbl') throw new Error('Alamat ini bukan Perangkat Utama KASIR');
    choose({ host, port, storeName: info.storeName, storeId: info.storeId });
  } catch (e) {
    $('syncJoinMsg').textContent = 'Tidak tersambung: ' + (e.message || e);
  }
}

async function pairNow() {
  if (!target) return;
  const code = $('syncPairCode').value.replace(/\D/g, '');
  const name = $('syncDeviceName').value.trim() || 'Perangkat tambahan';
  if (code.length !== 6) return toast('Masukkan 6 digit kode pairing dari Kasir Induk');
  if (!confirm('Data di perangkat ini akan DIGANTI dengan data dari Perangkat Utama. Cadangan data lama disimpan otomatis lebih dulu. Lanjutkan?')) return;
  const btn = $('syncPairBtn');
  btn.disabled = true;
  $('syncJoinMsg').textContent = 'Menghubungkan…';
  let backupPath = '';
  try {
    await syncEngine().join({
      host: target.host, port: target.port, code, name,
      backup: async rows => { backupPath = await backupRows(rows, 'sebelum gabung'); },
      progress: p => { $('syncJoinMsg').textContent = `Mengambil data toko… (bagian ${p})`; }
    });
    $('syncJoinDialog').close();
    alert('Perangkat tersambung ke ' + (target.storeName || 'Perangkat Utama') + '.' + (backupPath ? '\nCadangan data lama: ' + backupPath : '') + '\n\nAplikasi dimuat ulang.');
    location.reload();
  } catch (e) {
    $('syncJoinMsg').textContent = 'Gagal: ' + (e.message || e);
  } finally {
    btn.disabled = false;
  }
}

function wire() {
  $('syncScan') && ($('syncScan').onclick = scan);
  $('syncManualCheck') && ($('syncManualCheck').onclick = manualCheck);
  $('syncPairBtn') && ($('syncPairBtn').onclick = pairNow);
}

window.syncUi = { beServer, startServer, stopServer, newCode, revoke, leave, syncNow, openJoin, openPerms };
wire();
onSyncState(s => { st = s; render(); });
// Perbarui daftar perangkat online di Perangkat Utama secara berkala saat halaman Pengaturan terbuka.
setInterval(() => { if (st.mode === 'server' && $('settings')?.classList.contains('active')) refresh(); }, 10000);
render();
