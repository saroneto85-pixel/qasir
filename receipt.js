// Struk KASIR: satu model data -> tiga keluaran (pratinjau/cetak HTML, PDF untuk WhatsApp, ESC/POS Bluetooth).
// Pengaturan disimpan di settings.main.receipt. Fungsi model/tata letak murni agar bisa diuji (test-receipt.mjs).

export const RC_DEFAULTS = {
  paper: 80,            // lebar kertas (mm): 58 atau 80
  showLogo: true, logoSize: 'sedang', logoAlign: 'center',
  logoSource: 'toko',   // 'toko' = Logo 1 (logo toko, sama dengan header) · 'struk' = Logo 2 (settings.receiptLogo)
  tagline: '',          // teks di bawah nama toko (slogan)
  showAddress: true, showPhone: true,
  showInvoice: true, showDateTime: true, showCashier: true, showCustomer: true, showType: true, showPayment: true,
  showSku: false, showNote: true, alwaysDiscount: false,
  footer: 'Terima kasih telah berbelanja',   // boleh beberapa baris; placeholder: {nama_toko} {telepon} {kasir} {tanggal} {nota}
  qrImage: '', qrSize: 'sedang', qrCaption: '',
  feed: 3, cut: true, copies: 1,
};
export const LOGO_SIZES = { kecil: 0.25, sedang: 0.45, besar: 0.65, penuh: 1 };
export const QR_SIZES = { kecil: 0.35, sedang: 0.5, besar: 0.7 };
const LOGO_MAX_H = 40, QR_MAX_H = 45; // mm

export function normReceipt(settings = {}) {
  const r = { ...RC_DEFAULTS, ...(settings.receipt || {}) };
  if (!settings.receipt && settings.footer) r.footer = settings.footer; // data lama
  r.paper = Number(r.paper) === 58 ? 58 : 80;
  r.feed = Math.min(8, Math.max(0, Math.round(Number(r.feed) || 0)));
  r.copies = Math.min(3, Math.max(1, Math.round(Number(r.copies) || 1)));
  if (!LOGO_SIZES[r.logoSize]) r.logoSize = 'sedang';
  if (!QR_SIZES[r.qrSize]) r.qrSize = 'sedang';
  if (!['left', 'center', 'right'].includes(r.logoAlign)) r.logoAlign = 'center';
  if (!['toko', 'struk'].includes(r.logoSource)) r.logoSource = 'toko';
  return r;
}
/** Gambar logo yang dicetak di struk: Logo 2 (khusus struk) bila dipilih, selain itu Logo 1 (logo toko). */
export function receiptLogoOf(settings = {}) {
  return normReceipt(settings).logoSource === 'struk' ? settings.receiptLogo || '' : settings.logo || '';
}
export const paperGeom = cfg => (cfg.paper === 58 ? { paper: 58, content: 48, cols: 32, dots: 384 } : { paper: 80, content: 72, cols: 48, dots: 576 });

// Ukuran gambar proporsional: lebar = fraksi lebar isi, tinggi mengikuti rasio asli, dibatasi tinggi maksimum.
export function fitImage(contentMM, frac, aspect, maxH) {
  const a = aspect > 0 ? aspect : 1;
  let w = contentMM * frac, h = w / a;
  if (h > maxH) { h = maxH; w = h * a; }
  return { w, h };
}

const nf = v => Math.round(Number(v) || 0).toLocaleString('id-ID');
export const rupiah = v => { const x = Math.round(Number(v) || 0); return (x < 0 ? '-' : '') + 'Rp ' + Math.abs(x).toLocaleString('id-ID'); };
const qtyText = q => String(Math.round((Number(q) || 0) * 1000) / 1000);
export function whenText(tx) {
  const [y, m, d] = String(tx.date || '').split('-'), t = /^(\d{1,2})[.:](\d{2})/.exec(String(tx.time || ''));
  return `${d}/${m}/${y}${t ? ' ' + t[1].padStart(2, '0') + ':' + t[2] : ''}`;
}
export function fillPlaceholders(text, tx, store) {
  return String(text || '').replace(/\{(nama_toko|telepon|kasir|tanggal|nota)\}/g, (_, k) => ({ nama_toko: store.name || '', telepon: store.phone || '', kasir: tx.cashier || '', tanggal: whenText(tx), nota: tx.invoice || '' }[k]));
}
const lines = text => String(text || '').split(/\r?\n/).map(s => s.trim()).filter(Boolean);

// ---------- model ----------
export function receiptModel(tx, store = {}, cfgRaw = {}) {
  const cfg = cfgRaw.paper ? cfgRaw : normReceipt({ receipt: cfgRaw }), g = paperGeom(cfg), tempo = tx.payment === 'Tempo / Kasbon';
  const meta = [];
  if (cfg.showInvoice) meta.push(['No. Nota', tx.invoice]);
  if (cfg.showDateTime) meta.push(['Tanggal', whenText(tx)]);
  if (cfg.showCashier && tx.cashier) meta.push(['Kasir', tx.cashier]);
  if (cfg.showCustomer && tx.customer) meta.push(['Pelanggan', tx.customer]);
  if (cfg.showType && tx.type) meta.push(['Tipe', tx.type]);
  if (cfg.showPayment && tx.payment) meta.push(['Pembayaran', tx.payment]);
  const totals = [['Subtotal', rupiah(tx.subtotal)]];
  if ((Number(tx.discount) || 0) > 0 || cfg.alwaysDiscount) totals.push(['Diskon', '- ' + rupiah(tx.discount)]);
  totals.push(['TOTAL', rupiah(tx.total), true]);
  if (!tempo) { totals.push(['Bayar', rupiah(tx.paid)]); totals.push(['Kembali', rupiah(tx.change)]); }
  return {
    cfg, g,
    logo: cfg.showLogo && store.logo ? { src: store.logo, align: cfg.logoAlign, frac: LOGO_SIZES[cfg.logoSize] } : null,
    title: store.name || 'Usaha Saya',
    tagline: lines(fillPlaceholders(cfg.tagline, tx, store)),
    address: cfg.showAddress && store.address ? lines(store.address) : [],
    phone: cfg.showPhone && store.phone ? 'Telp. ' + store.phone : '',
    meta,
    items: (tx.items || []).map(i => ({ name: i.name, sku: i.sku || '', qty: qtyText(i.qty), price: rupiah(i.price), total: rupiah((Number(i.price) || 0) * (Number(i.qty) || 0)) })),
    totals,
    status: tempo ? 'BELUM LUNAS (Tempo / Kasbon)' : '',
    note: cfg.showNote && tx.note ? tx.note : '',
    footer: lines(fillPlaceholders(cfg.footer, tx, store)).slice(0, 8),
    qr: cfg.qrImage ? { src: cfg.qrImage, frac: QR_SIZES[cfg.qrSize], caption: fillPlaceholders(cfg.qrCaption, tx, store) } : null,
  };
}

// ---------- gambar ----------
export const loadImage = src => new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = rej; im.src = src; });
// Ubah gambar unggahan (png/jpg/webp) menjadi PNG berukuran wajar, rasio tetap.
export async function normalizeImage(file, maxSide = 600) {
  const src = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(file); });
  const im = await loadImage(src), k = Math.min(1, maxSide / Math.max(im.width, im.height)), c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(im.width * k)); c.height = Math.max(1, Math.round(im.height * k));
  c.getContext('2d').drawImage(im, 0, 0, c.width, c.height);
  return c.toDataURL('image/png');
}
async function aspectOf(src) { try { const im = await loadImage(src); return im.width / im.height; } catch { return 1; } }
// Lengkapi model dengan rasio gambar asli agar HTML/PDF/ESC-POS memakai ukuran yang persis proporsional.
export async function attachAspects(m) { if (m.logo && !m.logo.aspect) m.logo.aspect = await aspectOf(m.logo.src); if (m.qr && !m.qr.aspect) m.qr.aspect = await aspectOf(m.qr.src); return m; }

// ---------- HTML (pratinjau & cetak) ----------
const E = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export function receiptHTML(m) {
  const w = m.g.content, al = { left: 'flex-start', center: 'center', right: 'flex-end' }[m.logo?.align || 'center'];
  const dim = (o, maxH) => { if (!o.aspect) return `width:${Math.round(o.frac * 100)}%;height:auto`; const f = fitImage(w, o.frac, o.aspect, maxH); return `width:${f.w.toFixed(2)}mm;height:${f.h.toFixed(2)}mm`; };
  const img = (o, maxH) => `<div style="display:flex;justify-content:${al};margin:0 0 2mm"><img src="${E(o.src)}" style="${dim(o, maxH)}" alt=""></div>`;
  const row = (k, v, b) => `<div class="r${b ? ' b' : ''}"><span>${E(k)}</span><span>${E(v)}</span></div>`;
  return `<div class="rc" style="width:${w}mm;font:${m.g.paper === 58 ? 10.5 : 11.5}px/1.35 'Courier New',monospace;color:#000;background:#fff;box-sizing:border-box">
<style>.rc .r{display:flex;justify-content:space-between;gap:8px}.rc .r span:last-child{text-align:right}.rc .b{font-weight:700;font-size:1.15em}.rc hr{border:0;border-top:1px dashed #000;margin:6px 0}.rc .c{text-align:center}.rc small{display:block;opacity:.7}</style>
${m.logo ? img(m.logo, LOGO_MAX_H) : ''}<div class="c"><b style="font-size:1.35em">${E(m.title)}</b>${m.tagline.map(t => `<div><i>${E(t)}</i></div>`).join('')}${m.address.map(a => `<div>${E(a)}</div>`).join('')}${m.phone ? `<div>${E(m.phone)}</div>` : ''}</div>
<hr>${m.meta.map(([k, v]) => row(k, v)).join('')}<hr>
${m.items.map(i => `<div>${E(i.name)}${m.cfg.showSku && i.sku ? `<small>SKU: ${E(i.sku)}</small>` : ''}</div>${row(`${i.qty} x ${i.price}`, i.total)}`).join('<div style="height:3px"></div>')}
<hr>${m.totals.map(([k, v, b]) => row(k, v, b)).join('')}${m.status ? `<div class="c b" style="margin-top:4px">${E(m.status)}</div>` : ''}${m.note ? `<div style="margin-top:4px">Catatan: ${E(m.note)}</div>` : ''}
${m.footer.length || m.qr ? '<hr>' : ''}<div class="c">${m.footer.map(f => `<div>${E(f)}</div>`).join('')}</div>${m.qr ? `<div style="margin-top:6px">${img({ src: m.qr.src, frac: m.qr.frac }, QR_MAX_H).replace(`justify-content:${al}`, 'justify-content:center')}${m.qr.caption ? `<div class="c">${E(m.qr.caption)}</div>` : ''}</div>` : ''}</div>`;
}
export function receiptPrintDocument(m) {
  return `<!doctype html><html><head><meta charset="utf-8"><title>Struk</title><style>@page{size:${m.g.paper}mm auto;margin:0}body{margin:0;padding:${(m.g.paper - m.g.content) / 2}mm;background:#fff}</style></head><body>${receiptHTML(m)}<script>window.onload=()=>setTimeout(()=>window.print(),250)<\/script></body></html>`;
}

// ---------- PDF (jsPDF) ----------
// Dua lintasan: mengukur tinggi pada dokumen tinggi, lalu menggambar pada dokumen berukuran pas.
export async function receiptPDF(m, JsPDF) {
  const { paper, content } = m.g, mx = (paper - content) / 2;
  const logoA = m.logo ? await aspectOf(m.logo.src) : 1, qrA = m.qr ? await aspectOf(m.qr.src) : 1, LH = 3.7;
  const imgFmt = s => (/^data:image\/jpe?g/i.test(s) ? 'JPEG' : 'PNG');
  const draw = doc => {
    let y = m.logo ? 5 : 8;
    const font = (style, size) => { doc.setFont('helvetica', style); doc.setFontSize(size); };
    const wrap = (t, w) => doc.splitTextToSize(String(t), w);
    const center = (t, style = 'normal', size = 8, gap = LH) => { font(style, size); for (const l of wrap(t, content)) { doc.text(l, paper / 2, y, { align: 'center' }); y += gap; } };
    const rule = () => { doc.setLineWidth(0.15); if (doc.setLineDashPattern) doc.setLineDashPattern([0.8, 0.8], 0); doc.line(mx, y, paper - mx, y); if (doc.setLineDashPattern) doc.setLineDashPattern([], 0); y += LH * 0.9; };
    const pair = (k, v, style = 'normal', size = 8) => {
      font(style, size);
      const vw = Math.min(content * 0.62, doc.getTextWidth(String(v)) + 0.5), vl = wrap(v, content * 0.62), kl = wrap(k, content - vw - 2);
      const n = Math.max(vl.length, kl.length);
      for (let i = 0; i < n; i++) { if (kl[i]) doc.text(kl[i], mx, y); if (vl[i]) doc.text(vl[i], paper - mx, y, { align: 'right' }); y += LH + (size > 8 ? 0.6 : 0); }
    };
    const place = (src, a, frac, maxH, align) => {
      const { w, h } = fitImage(content, frac, a, maxH), x = align === 'left' ? mx : align === 'right' ? paper - mx - w : (paper - w) / 2;
      try { doc.addImage(src, imgFmt(src), x, y, w, h); } catch (err) { console.warn('Gambar struk gagal dimasukkan:', err); }
      y += h + 3.8; // ruang agar baris teks berikutnya (baseline) tidak menimpa gambar
    };
    if (m.logo) place(m.logo.src, logoA, m.logo.frac, LOGO_MAX_H, m.logo.align);
    center(m.title, 'bold', 12, 5);
    m.tagline.forEach(t => center(t, 'italic', 8));
    m.address.forEach(a => center(a));
    if (m.phone) center(m.phone);
    y += 1; rule();
    m.meta.forEach(([k, v]) => pair(k, v)); rule();
    m.items.forEach(i => {
      font('normal', 8); for (const l of wrap(i.name, content)) { doc.text(l, mx, y); y += LH; }
      if (m.cfg.showSku && i.sku) { font('normal', 6.5); doc.text('SKU: ' + i.sku, mx, y); y += 3; }
      pair(`${i.qty} x ${i.price}`, i.total); y += 0.8;
    });
    rule();
    m.totals.forEach(([k, v, b]) => { if (b) { y += 0.6; } pair(k, v, b ? 'bold' : 'normal', b ? 10 : 8); });
    if (m.status) { y += 1; center(m.status, 'bold', 8.5); }
    if (m.note) { y += 1; font('normal', 8); for (const l of wrap('Catatan: ' + m.note, content)) { doc.text(l, mx, y); y += LH; } }
    if (m.footer.length || m.qr) { y += 1; rule(); }
    m.footer.forEach(f => center(f, 'normal', 8));
    if (m.qr) { y += 1; place(m.qr.src, qrA, m.qr.frac, QR_MAX_H, 'center'); if (m.qr.caption) center(m.qr.caption, 'normal', 7.5); }
    return y;
  };
  const probe = new JsPDF({ unit: 'mm', format: [paper, 3000] });
  const endY = draw(probe) + 5 + (m.cfg.feed || 0) * 1.5;
  const doc = new JsPDF({ unit: 'mm', format: [paper, Math.max(60, Math.ceil(endY)) ] });
  draw(doc);
  return doc;
}

// ---------- ESC/POS (printer Bluetooth) ----------
export const ascii = s => String(s ?? '').replace(/[×✕]/g, 'x').replace(/[–—−]/g, '-').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\x20-\x7e]/g, '?');
export function wrapCols(text, cols) {
  const out = []; let cur = '';
  for (const word of ascii(text).split(/\s+/).filter(Boolean)) {
    let w = word;
    while (w.length > cols) { if (cur) { out.push(cur); cur = ''; } out.push(w.slice(0, cols)); w = w.slice(cols); }
    if (!cur) cur = w; else if ((cur + ' ' + w).length <= cols) cur += ' ' + w; else { out.push(cur); cur = w; }
  }
  if (cur) out.push(cur);
  return out.length ? out : [''];
}
export const lrLine = (l, r, cols) => { l = ascii(l); r = ascii(r); return l.length + r.length + 1 > cols ? null : l + ' '.repeat(cols - l.length - r.length) + r; };
export function lrRows(l, r, cols) { // kiri/kanan; bila tidak muat, sisi kiri dibungkus dan nilai kanan tetap rata kanan
  const R = ascii(r), one = lrLine(l, R, cols); if (one !== null) return [one];
  const L = wrapCols(l, Math.max(8, cols - R.length - 1)), last = L.pop(), joined = lrLine(last, R, cols);
  return joined !== null ? [...L, joined] : [...L, last, ' '.repeat(Math.max(0, cols - R.length)) + R];
}
async function bitmapBytes(src, widthDots, align, maxHDots) {
  const im = await loadImage(src), scale = Math.min(widthDots / im.width, maxHDots / im.height);
  let w = Math.max(8, Math.round(im.width * scale)); w = Math.min(widthDots, Math.ceil(w / 8) * 8);
  const h = Math.max(1, Math.round(im.height * (w / im.width))), c = document.createElement('canvas'); c.width = w; c.height = h;
  const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, w, h); x.drawImage(im, 0, 0, w, h);
  const px = x.getImageData(0, 0, w, h).data, rb = w / 8, out = [0x1b, 0x61, align, 0x1d, 0x76, 0x30, 0x00, rb & 255, rb >> 8, h & 255, h >> 8];
  for (let yy = 0; yy < h; yy++) for (let bx = 0; bx < rb; bx++) { let byte = 0; for (let bit = 0; bit < 8; bit++) { const n = (yy * w + bx * 8 + bit) * 4, a = px[n + 3] / 255, gray = (px[n] * 299 + px[n + 1] * 587 + px[n + 2] * 114) / 1000 * a + 255 * (1 - a); if (gray < 150) byte |= 0x80 >> bit; } out.push(byte); }
  out.push(0x1b, 0x61, 0x00); return out;
}
export async function receiptEscPos(m) {
  const cols = m.g.cols, b = [], put = (...a) => b.push(...a), txt = s => { for (const ch of ascii(s)) b.push(ch.charCodeAt(0)); put(0x0a); };
  const al = n => put(0x1b, 0x61, n), bold = on => put(0x1b, 0x45, on ? 1 : 0), sep = () => txt('-'.repeat(cols));
  put(0x1b, 0x40);
  if (m.logo) { try { b.push(...await bitmapBytes(m.logo.src, Math.round(m.g.dots * m.logo.frac), { left: 0, center: 1, right: 2 }[m.logo.align], 200)); } catch (e) { console.warn('Logo tidak dapat dirender', e); } }
  al(1); bold(true); put(0x1d, 0x21, 0x01); wrapCols(m.title, Math.floor(cols / 2)).forEach(txt); put(0x1d, 0x21, 0x00); bold(false);
  m.tagline.forEach(t => wrapCols(t, cols).forEach(txt)); m.address.forEach(a => wrapCols(a, cols).forEach(txt)); if (m.phone) txt(m.phone);
  al(0); sep(); m.meta.forEach(([k, v]) => lrRows(k, v, cols).forEach(txt)); sep();
  m.items.forEach(i => { wrapCols(i.name, cols).forEach(txt); if (m.cfg.showSku && i.sku) txt('SKU: ' + i.sku); lrRows(`${i.qty} x ${i.price}`, i.total, cols).forEach(txt); });
  sep(); m.totals.forEach(([k, v, bd]) => { if (bd) bold(true); lrRows(k, v, cols).forEach(txt); if (bd) bold(false); });
  if (m.status) { al(1); bold(true); wrapCols(m.status, cols).forEach(txt); bold(false); al(0); }
  if (m.note) wrapCols('Catatan: ' + m.note, cols).forEach(txt);
  if (m.footer.length) { sep(); al(1); m.footer.forEach(f => wrapCols(f, cols).forEach(txt)); }
  if (m.qr) { try { b.push(...await bitmapBytes(m.qr.src, Math.round(m.g.dots * m.qr.frac), 1, 300)); if (m.qr.caption) { al(1); wrapCols(m.qr.caption, cols).forEach(txt); } } catch (e) { console.warn('Gambar bawah tidak dapat dirender', e); } }
  put(0x1b, 0x64, Math.max(1, m.cfg.feed)); if (m.cfg.cut) put(0x1d, 0x56, 0x41, 0x03);
  return Uint8Array.from(b);
}
export function toBase64(bytes) { let s = ''; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000)); return btoa(s); }
