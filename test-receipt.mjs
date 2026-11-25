// Uji model struk, tata letak proporsional, ESC/POS (lebar kolom) dan PDF (dengan jsPDF tiruan).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { normReceipt, receiptModel, fitImage, wrapCols, lrRows, ascii, paperGeom, fillPlaceholders, whenText, rupiah, receiptPDF, receiptHTML, receiptEscPos, RC_DEFAULTS } from './receipt.js';

let ok = 0; const t = (c, m) => { assert.ok(c, m); ok++; };
const tx = { invoice: 'INV-77918881', date: '2026-11-25', time: '10.38.38', cashier: 'Pemilik', customer: '', type: 'Dine In', payment: 'Tunai', note: '',
  items: [{ name: 'Rendang', sku: 'RND-1', qty: 1, price: 50000 }, { name: 'Nasi rendang', sku: 'NSR-1', qty: 1, price: 15000 }, { name: 'Rendang', sku: 'RND-2', qty: 1, price: 9000 }], subtotal: 74000, discount: 0, total: 74000, paid: 100000, change: 26000 };
const store = { name: 'Dapur Bumbu Lengkep', address: 'Jl. Lapter depan Bandara Silampari Kota Lubuklinggau', phone: '0812-3456', logo: 'data:image/png;base64,AAAA' };

// proporsi logo: persegi tidak boleh digepengkan; gambar lebar dibatasi tinggi
const sq = fitImage(72, 0.45, 1, 40); t(Math.abs(sq.w - sq.h) < 1e-9 && Math.abs(sq.w - 32.4) < 1e-9, 'logo persegi tetap persegi (32,4 mm)');
const wide = fitImage(72, 1, 4, 40); t(Math.abs(wide.w / wide.h - 4) < 1e-9 && wide.h <= 18.0001, 'logo lebar proporsional');
const tall = fitImage(72, 1, 0.25, 40); t(tall.h === 40 && Math.abs(tall.w / tall.h - 0.25) < 1e-9, 'logo tinggi dibatasi tinggi maks, rasio tetap');

// pengaturan: bawaan, data lama (footer), kertas
t(normReceipt({}).footer === 'Terima kasih telah berbelanja' && normReceipt({}).paper === 80, 'bawaan');
t(normReceipt({ footer: 'Sampai jumpa' }).footer === 'Sampai jumpa', 'footer lama terbaca');
t(normReceipt({ receipt: { paper: '58', copies: 9, feed: -3 } }).paper === 58 && normReceipt({ receipt: { copies: 9 } }).copies === 3 && normReceipt({ receipt: { feed: -3 } }).feed === 0, 'batas nilai');
t(paperGeom(normReceipt({ receipt: { paper: 58 } })).cols === 32 && paperGeom(normReceipt({})).cols === 48, 'kolom per kertas');

// model: footer bebas + placeholder, tempo, diskon
const m = receiptModel(tx, store, normReceipt({ receipt: { footer: 'Terima kasih\nTelp {telepon} - {kasir}\n\nIG @dapurbumbu', tagline: 'Masakan Sumatera' } }));
t(m.footer.length === 3 && m.footer[1] === 'Telp 0812-3456 - Pemilik' && m.footer[2] === 'IG @dapurbumbu', 'footer multi baris + placeholder, baris kosong dibuang');
t(m.tagline[0] === 'Masakan Sumatera' && m.logo && m.logo.frac === 0.45, 'slogan & logo');
t(!m.totals.some(r => r[0] === 'Diskon') && receiptModel({ ...tx, discount: 5000, total: 69000 }, store, normReceipt({})).totals.some(r => r[0] === 'Diskon' && r[1] === '- Rp 5.000'), 'diskon tampil bila ada');
t(receiptModel(tx, store, normReceipt({ receipt: { alwaysDiscount: true } })).totals.some(r => r[0] === 'Diskon'), 'diskon selalu tampil');
const tempo = receiptModel({ ...tx, payment: 'Tempo / Kasbon', paid: 0, change: 0 }, store, normReceipt({}));
t(tempo.status.startsWith('BELUM LUNAS') && !tempo.totals.some(r => r[0] === 'Bayar'), 'tempo: belum lunas, tanpa bayar/kembali');
t(receiptModel(tx, store, normReceipt({ receipt: { showLogo: false, showAddress: false, showPhone: false, showCashier: false, showInvoice: false } })).meta.every(r => !['Kasir', 'No. Nota'].includes(r[0])), 'sembunyikan kolom');
t(whenText(tx) === '25/11/2026 10:38' && rupiah(74000) === 'Rp 74.000' && rupiah(-5000) === '-Rp 5.000', 'format tanggal/rupiah');
t(fillPlaceholders('{nota} {tanggal}', tx, store) === 'INV-77918881 25/11/2026 10:38', 'placeholder');

// ESC/POS: tidak ada baris melebihi kolom, ASCII saja
t(wrapCols('Ayam bakar bacem utuh dengan sambal terasi pedas', 32).every(l => l.length <= 32), 'pembungkus kolom');
t(lrRows('1 x Rp 85.000', 'Rp 85.000', 32).every(l => l.length <= 32) && lrRows('Subtotal', 'Rp 74.000', 32)[0].length === 32, 'baris kiri-kanan pas kolom');
t(lrRows('1 x Rp 1.250.000.000 sangat panjang sekali teks', 'Rp 1.250.000.000', 32).every(l => l.length <= 32), 'baris panjang dibungkus');
t(ascii('Café — Rp×1') === 'Cafe - Rpx1', 'ASCII aman printer');
globalThis.document = undefined;
const esc58 = await receiptEscPos(receiptModel(tx, { ...store, logo: '' }, normReceipt({ receipt: { paper: 58, footer: 'Terima kasih\nSelamat menikmati' } })));
const text = Buffer.from(esc58).toString('latin1');
t(esc58[0] === 0x1b && esc58[1] === 0x40, 'inisialisasi printer'); t(/Rendang/.test(text) && /Selamat menikmati/.test(text), 'isi struk');
t(esc58.at(-4) === 0x1d && esc58.at(-3) === 0x56, 'perintah potong kertas'); 
const noCut = await receiptEscPos(receiptModel(tx, { ...store, logo: '' }, normReceipt({ receipt: { cut: false } }))); t(!Buffer.from(noCut).includes(Buffer.from([0x1d, 0x56, 0x41])), 'potong dapat dimatikan');

// PDF dengan jsPDF tiruan: tinggi menyesuaikan isi, logo proporsional, tidak keluar dari kertas
const ops = [];
class FakeDoc {
  constructor(o) { this.w = o.format[0]; this.h = o.format[1]; this.size = 8; ops.length = 0; ops.push({ op: 'page', w: this.w, h: this.h }); }
  setFont(f, s) { this.style = s; } setFontSize(s) { this.size = s; } setLineWidth() {} setLineDashPattern() {}
  getTextWidth(s) { return String(s).length * this.size * 0.5 * 0.3528; }
  splitTextToSize(s, w) { const out = []; let cur = ''; for (const wd of String(s).split(' ')) { const nx = cur ? cur + ' ' + wd : wd; if (this.getTextWidth(nx) <= w || !cur) cur = nx; else { out.push(cur); cur = wd; } } out.push(cur); return out; }
  text(s, x, y, o) { ops.push({ op: 'text', s, x, y, a: o?.align, size: this.size, style: this.style }); }
  line(x1, y1, x2, y2) { ops.push({ op: 'line', x1, y1, x2, y2 }); }
  addImage(src, f, x, y, w, h) { ops.push({ op: 'img', x, y, w, h }); }
  output() { return new Blob(['x']); }
}
globalThis.Image = class { set src(v) { this.width = 800; this.height = 800; setTimeout(() => this.onload(), 0); } };
const doc = await receiptPDF(m, FakeDoc);
const page = ops.find(o => o.op === 'page'), img = ops.find(o => o.op === 'img');
t(page.w === 80 && page.h < 200 && page.h > 60, `tinggi PDF mengikuti isi (${page.h.toFixed(0)} mm)`);
t(Math.abs(img.w - img.h) < 1e-6, 'logo persegi di PDF tetap persegi (tidak gepeng)');
t(ops.filter(o => o.op === 'text').every(o => o.y < page.h) && ops.filter(o => o.op === 'text').every(o => o.a === 'right' ? o.x <= 80 : o.x >= 0), 'semua teks di dalam halaman');
t(ops.some(o => o.op === 'text' && o.s === 'IG @dapurbumbu'), 'footer multi baris di PDF');
const mA = await (await import('./receipt.js')).attachAspects(receiptModel(tx, store, normReceipt({ receipt: { logoSize: 'sedang' } })));
const ih = receiptHTML(mA); t(/width:32\.40mm;height:32\.40mm/.test(ih), 'HTML: logo persegi 32,4 x 32,4 mm persis');
t(receiptHTML(m).includes('Dapur Bumbu Lengkep') && receiptHTML(m).includes('Telp 0812-3456'), 'HTML pratinjau');
fs.writeFileSync('/tmp/pdf-ops.json', JSON.stringify(ops));
console.log(`✓ ${ok} pemeriksaan struk lulus`);
