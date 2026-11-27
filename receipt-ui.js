// Pengaturan struk (form + pratinjau langsung) dan penghubung ke pembuat struk (receipt.js).
import { all, put } from './db.js';
import { jsPDF } from 'jspdf';
import * as R from './receipt.js';

const $ = id => document.getElementById(id);
const toast = m => window.toast?.(m);
const CHECKS = { rcShowLogo: 'showLogo', rcShowAddress: 'showAddress', rcShowPhone: 'showPhone', rcShowInvoice: 'showInvoice', rcShowDateTime: 'showDateTime', rcShowCashier: 'showCashier', rcShowCustomer: 'showCustomer', rcShowType: 'showType', rcShowPayment: 'showPayment', rcShowSku: 'showSku', rcShowNote: 'showNote', rcAlwaysDiscount: 'alwaysDiscount', rcCut: 'cut' };
const VALUES = { rcPaper: 'paper', rcLogoSource: 'logoSource', rcLogoSize: 'logoSize', rcLogoAlign: 'logoAlign', rcTagline: 'tagline', rcFooter: 'footer', rcQrSize: 'qrSize', rcQrCaption: 'qrCaption', rcFeed: 'feed', rcCopies: 'copies' };
let qrData = '';           // gambar bawah (QR) yang sedang diedit
let logo2 = '';            // Logo 2 (khusus struk) yang sedang diedit
const todayStr = () => { const d = new Date(), p = n => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`; };
const SAMPLE = () => ({ invoice: 'INV-CONTOH', date: todayStr(), time: '10.30.00', cashier: 'Pemilik', customer: '', type: 'Dine In', payment: 'Tunai', items: [{ name: 'Ayam Bakar Bacem Utuh', sku: 'AYB-001', qty: 1, price: 85000 }, { name: 'Nasi Rendang', sku: 'NSR-002', qty: 2, price: 15000 }], subtotal: 115000, discount: 0, total: 115000, paid: 150000, change: 35000, note: '' });

export async function getStore() { const s = await all('settings'); return s.find(x => x.id === 'main') || s[0] || {}; }
const currentLogo = saved => (window.storeLogoData === null ? '' : window.storeLogoData || saved.logo || '');
// Logo yang tampil di pratinjau struk sesuai pilihan sumber (Logo 1 toko / Logo 2 struk)
const previewLogo = saved => ($('rcLogoSource').value === 'struk' ? logo2 : currentLogo(saved));
function drawLogo2() {
  const box = $('rcLogo2Box'), t = $('rcLogoThumb');
  box.hidden = $('rcLogoSource').value !== 'struk';
  if (logo2) t.src = logo2; else t.removeAttribute('src');
  $('rcLogoRemove').hidden = !logo2;
}

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
  qrData = cfg.qrImage || ''; drawQrThumb(); drawLogo2();
}
function drawQrThumb() { const t = $('rcQrThumb'); t.src = qrData; t.style.display = qrData ? 'block' : 'none'; $('rcQrRemove').hidden = !qrData; }

async function previewTx() { const t = (await all('transactions')).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))[0]; return { tx: t || SAMPLE(), real: !!t }; }
async function renderPreview() {
  const saved = await getStore(), { tx, real } = await previewTx();
  const store = { name: $('storeName').value || saved.name, address: $('storeAddress').value, phone: $('storePhone').value, logo: previewLogo(saved) };
  const m = await R.attachAspects(R.receiptModel(tx, store, R.normReceipt({ receipt: readCfg() })));
  $('rcPreview').innerHTML = `<div class="rc-paper rc-w${m.g.paper}">${R.receiptHTML(m)}</div>`;
  $('rcPreviewNote').textContent = real ? `Contoh dari transaksi terakhir (${tx.invoice}) · kertas ${m.g.paper} mm` : `Contoh transaksi · kertas ${m.g.paper} mm`;
}
let timer = 0; const schedulePreview = () => { clearTimeout(timer); timer = setTimeout(renderPreview, 120); };

export async function loadReceiptSettings() {
  if (!$('receiptSettings')) return;
  const s = await getStore(); logo2 = s.receiptLogo || ''; fillCfg(R.normReceipt(s)); await renderPreview();
}
async function saveReceiptSettings() {
  const s = await getStore(), cfg = readCfg();
  if (!cfg.footer.trim() && !confirm('Footer kosong: struk dicetak tanpa ucapan di bagian bawah. Lanjutkan?')) return;
  if (cfg.showLogo && cfg.logoSource === 'struk' && !logo2 && !confirm('Logo 2 (khusus struk) belum dipilih: struk dicetak tanpa logo. Lanjutkan?')) return;
  await put('settings', { ...s, id: 'main', receipt: cfg, receiptLogo: logo2, footer: cfg.footer.split(/\r?\n/)[0] || '', logo: currentLogo(s) });
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
  $('rcLogoSource').addEventListener('change', drawLogo2);
  $('rcLogoFile').onchange = async e => { const f = e.target.files[0]; if (!f) return; if (!/^image\//.test(f.type)) { toast('File harus berupa gambar'); return; } if (f.size > 5 * 1024 * 1024) { toast('Ukuran gambar maksimal 5 MB'); e.target.value = ''; return; } try { logo2 = await R.normalizeImage(f, 600); $('rcLogoSource').value = 'struk'; $('rcShowLogo').checked = true; drawLogo2(); toast('Logo 2 siap — tekan Simpan pengaturan struk'); schedulePreview(); } catch { toast('Gambar tidak dapat dibaca'); } e.target.value = ''; };
  $('rcLogoRemove').onclick = () => { logo2 = ''; drawLogo2(); toast('Logo 2 akan dihapus saat disimpan'); schedulePreview(); };
  $('rcQrFile').onchange = async e => { const f = e.target.files[0]; if (!f) return; try { qrData = await R.normalizeImage(f, 700); drawQrThumb(); schedulePreview(); } catch { toast('Gambar tidak dapat dibaca'); } e.target.value = ''; };
  $('rcQrRemove').onclick = () => { qrData = ''; drawQrThumb(); schedulePreview(); };
  $('rcTestPrint').onclick = testPrint;
  $('rcReset').onclick = () => { if (confirm('Kembalikan pengaturan struk ke bawaan? (belum tersimpan sampai Anda menekan Simpan)')) { fillCfg({ ...R.RC_DEFAULTS }); schedulePreview(); } };
}

// ---- antarmuka untuk app.js ----
async function modelFor(tx, cfgOverride) {
  const s = await getStore(), eff = cfgOverride ? { ...s, receipt: cfgOverride, receiptLogo: cfgOverride.logoSource === 'struk' && logo2 ? logo2 : s.receiptLogo } : s;
  return R.receiptModel(tx, { ...s, logo: R.receiptLogoOf(eff) }, R.normReceipt(eff));
}
window.receiptApi = {
  model: modelFor,
  pdf: async (tx, cfg) => R.receiptPDF(await modelFor(tx, cfg), jsPDF),
  html: async (tx, cfg) => R.receiptPrintDocument(await R.attachAspects(await modelFor(tx, cfg))),
  escBase64: async (tx, cfg) => R.toBase64(await R.receiptEscPos(await modelFor(tx, cfg))),
  copies: async () => R.normReceipt(await getStore()).copies,
};
window.loadReceiptSettings = loadReceiptSettings;
bind();
