// Pengaturan struk (form + pratinjau langsung) dan penghubung ke pembuat struk (receipt.js).
import { all, put } from './db.js';
import { jsPDF } from 'jspdf';
import * as R from './receipt.js';

const $ = id => document.getElementById(id);
const toast = m => window.toast?.(m);
const CHECKS = { rcShowLogo: 'showLogo', rcShowAddress: 'showAddress', rcShowPhone: 'showPhone', rcShowInvoice: 'showInvoice', rcShowDateTime: 'showDateTime', rcShowCashier: 'showCashier', rcShowCustomer: 'showCustomer', rcShowType: 'showType', rcShowPayment: 'showPayment', rcShowSku: 'showSku', rcShowNote: 'showNote', rcAlwaysDiscount: 'alwaysDiscount', rcCut: 'cut' };
const VALUES = { rcPaper: 'paper', rcLogoSize: 'logoSize', rcLogoAlign: 'logoAlign', rcTagline: 'tagline', rcFooter: 'footer', rcQrSize: 'qrSize', rcQrCaption: 'qrCaption', rcFeed: 'feed', rcCopies: 'copies' };
let qrData = '';           // gambar bawah (QR) yang sedang diedit
const todayStr = () => { const d = new Date(), p = n => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`; };
const SAMPLE = () => ({ invoice: 'INV-CONTOH', date: todayStr(), time: '10.30.00', cashier: 'Pemilik', customer: '', type: 'Dine In', payment: 'Tunai', items: [{ name: 'Ayam Bakar Bacem Utuh', sku: 'AYB-001', qty: 1, price: 85000 }, { name: 'Nasi Rendang', sku: 'NSR-002', qty: 2, price: 15000 }], subtotal: 115000, discount: 0, total: 115000, paid: 150000, change: 35000, note: '' });

export async function getStore() { const s = await all('settings'); return s.find(x => x.id === 'main') || s[0] || {}; }
const currentLogo = saved => (window.storeLogoData === null ? '' : window.storeLogoData || saved.logo || '');

function readCfg() {
  const c = {};
  for (const [id, k] of Object.entries(CHECKS)) c[k] = $(id).checked;
  for (const [id, k] of Object.entries(VALUES)) c[k] = $(id).value;
  c.qrImage = qrData;
  return c;
}
function fillCfg(cfg) {
  for (const [id, k] of Object.entries(CHECKS)) $(id).checked = !!cfg[k];
  for (const [id, k] of Object.entries(VALUES)) $(id).value = cfg[k] ?? '';
  qrData = cfg.qrImage || ''; drawQrThumb();
}
function drawQrThumb() { const t = $('rcQrThumb'); t.src = qrData; t.style.display = qrData ? 'block' : 'none'; $('rcQrRemove').hidden = !qrData; }

async function previewTx() { const t = (await all('transactions')).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))[0]; return { tx: t || SAMPLE(), real: !!t }; }
async function renderPreview() {
  const saved = await getStore(), { tx, real } = await previewTx();
  const store = { name: $('storeName').value || saved.name, address: $('storeAddress').value, phone: $('storePhone').value, logo: currentLogo(saved) };
  const m = await R.attachAspects(R.receiptModel(tx, store, R.normReceipt({ receipt: readCfg() })));
  $('rcPreview').innerHTML = `<div class="rc-paper rc-w${m.g.paper}">${R.receiptHTML(m)}</div>`;
  $('rcPreviewNote').textContent = real ? `Contoh dari transaksi terakhir (${tx.invoice}) · kertas ${m.g.paper} mm` : `Contoh transaksi · kertas ${m.g.paper} mm`;
}
let timer = 0; const schedulePreview = () => { clearTimeout(timer); timer = setTimeout(renderPreview, 120); };

export async function loadReceiptSettings() {
  if (!$('receiptSettings')) return;
  const s = await getStore(); fillCfg(R.normReceipt(s)); await renderPreview();
}
async function saveReceiptSettings() {
  const s = await getStore(), cfg = readCfg();
  if (!cfg.footer.trim() && !confirm('Footer kosong: struk dicetak tanpa ucapan di bagian bawah. Lanjutkan?')) return;
  await put('settings', { ...s, id: 'main', receipt: cfg, footer: cfg.footer.split(/\r?\n/)[0] || '', logo: currentLogo(s) });
  window.storeLogoData = '';
  toast('Pengaturan struk disimpan'); await loadReceiptSettings();
}
async function testPrint() { const { tx } = await previewTx(); window.printReceiptWith?.(tx, readCfg()); }
const CHIPS = ['Terima kasih telah berbelanja', 'Selamat menikmati', 'Barang yang sudah dibeli tidak dapat dikembalikan', 'Kritik & saran: {telepon}', 'Struk ini adalah bukti pembayaran'];

function bind() {
  if (!$('receiptSettings')) return;
  $('receiptSettings').addEventListener('input', schedulePreview); $('receiptSettings').addEventListener('change', schedulePreview);
  ['storeName', 'storeAddress', 'storePhone'].forEach(id => $(id).addEventListener('input', schedulePreview));
  $('rcSave').onclick = saveReceiptSettings;
  $('rcFooterChips').innerHTML = CHIPS.map((c, i) => `<button type="button" class="chip-btn" data-chip="${i}">+ ${c.replace(/&/g, '&amp;')}</button>`).join('');
  $('rcFooterChips').onclick = e => { const b = e.target.closest('[data-chip]'); if (!b) return; const t = $('rcFooter'); t.value = (t.value.trim() ? t.value.trim() + '\n' : '') + CHIPS[Number(b.dataset.chip)]; schedulePreview(); };
  $('rcLogoFile').onchange = async e => { const f = e.target.files[0]; if (!f) return; if (!/^image\//.test(f.type)) { toast('File harus berupa gambar'); return; } try { window.storeLogoData = await R.normalizeImage(f, 600); $('logoPreview').src = window.storeLogoData; $('logoPreview').style.display = 'block'; $('rcShowLogo').checked = true; toast('Logo siap disimpan'); schedulePreview(); } catch { toast('Gambar tidak dapat dibaca'); } e.target.value = ''; };
  $('rcLogoRemove').onclick = () => { window.storeLogoData = null; $('logoPreview').style.display = 'none'; toast('Logo akan dihapus saat disimpan'); schedulePreview(); };
  $('rcQrFile').onchange = async e => { const f = e.target.files[0]; if (!f) return; try { qrData = await R.normalizeImage(f, 700); drawQrThumb(); schedulePreview(); } catch { toast('Gambar tidak dapat dibaca'); } e.target.value = ''; };
  $('rcQrRemove').onclick = () => { qrData = ''; drawQrThumb(); schedulePreview(); };
  $('rcTestPrint').onclick = testPrint;
  $('rcReset').onclick = () => { if (confirm('Kembalikan pengaturan struk ke bawaan? (belum tersimpan sampai Anda menekan Simpan)')) { fillCfg({ ...R.RC_DEFAULTS }); schedulePreview(); } };
}

// ---- antarmuka untuk app.js ----
async function modelFor(tx, cfgOverride) { const s = await getStore(); return R.receiptModel(tx, { ...s, logo: currentLogoForOutput(s) }, R.normReceipt(cfgOverride ? { ...s, receipt: cfgOverride } : s)); }
const currentLogoForOutput = s => s.logo || '';
window.receiptApi = {
  model: modelFor,
  pdf: async (tx, cfg) => R.receiptPDF(await modelFor(tx, cfg), jsPDF),
  html: async (tx, cfg) => R.receiptPrintDocument(await R.attachAspects(await modelFor(tx, cfg))),
  escBase64: async (tx, cfg) => R.toBase64(await R.receiptEscPos(await modelFor(tx, cfg))),
  copies: async () => R.normReceipt(await getStore()).copies,
};
window.loadReceiptSettings = loadReceiptSettings;
bind();
