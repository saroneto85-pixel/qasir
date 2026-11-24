// Pembuat file .xlsx ringan tanpa dependensi (ZIP "store" + SpreadsheetML), dengan gaya dasar:
// judul, header hijau, format Rupiah, tanggal dd/mm/yyyy, persen, baris total tebal, lebar kolom.
//
// buildXlsx([{ name, title?, note?, widths?: number[], rows: Cell[][] }]) -> Blob
// Cell: string | number | null | { rp } | { d } | { pct } | { b } | { h } | { brp } | { n }
//   rp = Rupiah (#,##0)   d = tanggal "YYYY-MM-DD"   pct = persen (0.35 -> 35%)
//   b = teks tebal        h = header tabel           brp = Rupiah tebal (total)   n = angka biasa

const enc = new TextEncoder();
const CRC = (() => { const t = new Uint32Array(256); for (let i = 0; i < 256; i++) { let c = i; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[i] = c >>> 0; } return t; })();
const crc32 = bytes => { let c = 0xffffffff; for (let i = 0; i < bytes.length; i++) c = CRC[(c ^ bytes[i]) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const u16 = n => [n & 255, (n >>> 8) & 255];
const u32 = n => [n & 255, (n >>> 8) & 255, (n >>> 16) & 255, (n >>> 24) & 255];

export function zipStore(entries, mime = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet') {
  const local = [], central = []; let offset = 0;
  const DOS_TIME = 0, DOS_DATE = (46 << 9) | (1 << 5) | 1; // 2026-01-01 (tanggal DOS valid)
  for (const [name, content] of entries) {
    const nb = enc.encode(name), data = enc.encode(content), crc = crc32(data);
    const lh = new Uint8Array([0x50, 0x4b, 3, 4, ...u16(20), ...u16(0x0800), ...u16(0), ...u16(DOS_TIME), ...u16(DOS_DATE), ...u32(crc), ...u32(data.length), ...u32(data.length), ...u16(nb.length), ...u16(0), ...nb]);
    local.push(lh, data);
    central.push(new Uint8Array([0x50, 0x4b, 1, 2, ...u16(20), ...u16(20), ...u16(0x0800), ...u16(0), ...u16(DOS_TIME), ...u16(DOS_DATE), ...u32(crc), ...u32(data.length), ...u32(data.length), ...u16(nb.length), ...u16(0), ...u16(0), ...u16(0), ...u16(0), ...u32(0), ...u32(offset), ...nb]));
    offset += lh.length + data.length;
  }
  const csize = central.reduce((a, x) => a + x.length, 0);
  const end = new Uint8Array([0x50, 0x4b, 5, 6, ...u16(0), ...u16(0), ...u16(entries.length), ...u16(entries.length), ...u32(csize), ...u32(offset), ...u16(0)]);
  return new Blob([...local, ...central, end], { type: mime });
}

const X = v => String(v ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
export const colName = n => { let s = ''; while (n) { const r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = Math.floor((n - 1) / 26); } return s; };
const serial = d => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(d || '')); return m ? Date.UTC(+m[1], +m[2] - 1, +m[3]) / 86400000 + 25569 : null; };

// indeks gaya (lihat STYLES di bawah)
const S = { def: 0, head: 1, rp: 2, date: 3, bold: 4, brp: 5, pct: 6, title: 7, note: 8, num: 9 };
const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="1"><numFmt numFmtId="164" formatCode="dd/mm/yyyy"/></numFmts>
<fonts count="5"><font><sz val="10"/><name val="Arial"/></font><font><b/><sz val="10"/><name val="Arial"/></font><font><b/><sz val="10"/><color rgb="FFFFFFFF"/><name val="Arial"/></font><font><b/><sz val="13"/><color rgb="FF176B3A"/><name val="Arial"/></font><font><i/><sz val="9"/><color rgb="FF666666"/><name val="Arial"/></font></fonts>
<fills count="4"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF176B3A"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFE8F3EC"/><bgColor indexed="64"/></patternFill></fill></fills>
<borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left style="thin"><color rgb="FFCCCCCC"/></left><right style="thin"><color rgb="FFCCCCCC"/></right><top style="thin"><color rgb="FFCCCCCC"/></top><bottom style="thin"><color rgb="FFCCCCCC"/></bottom><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="10">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
<xf numFmtId="0" fontId="2" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>
<xf numFmtId="3" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1"/>
<xf numFmtId="164" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center"/></xf>
<xf numFmtId="0" fontId="1" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"/>
<xf numFmtId="3" fontId="1" fillId="3" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1"/>
<xf numFmtId="10" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1"/>
<xf numFmtId="0" fontId="3" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="0" fontId="4" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1"/>
</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;

function cell(v, ref, plain = false) {
  if (v === null || v === undefined || v === '') return plain ? '' : `<c r="${ref}" s="${S.num}"/>`;
  const str = (text, s) => `<c r="${ref}" s="${s}" t="inlineStr"><is><t xml:space="preserve">${X(text)}</t></is></c>`;
  const numc = (num, s) => (Number.isFinite(num) ? `<c r="${ref}" s="${s}"><v>${num}</v></c>` : `<c r="${ref}" s="${s}"/>`);
  if (typeof v === 'number') return numc(v, S.num);
  if (typeof v === 'string') return str(v, S.num);
  if ('rp' in v) return numc(Number(v.rp), S.rp);
  if ('brp' in v) return numc(Number(v.brp), S.brp);
  if ('pct' in v) return numc(Number(v.pct), S.pct);
  if ('n' in v) return numc(Number(v.n), S.num);
  if ('d' in v) { const s = serial(v.d); return s === null ? str(v.d || '', S.num) : numc(s, S.date); }
  if ('b' in v) return str(v.b, S.bold);
  if ('h' in v) return str(v.h, S.head);
  return '';
}

function sheetXml({ title, note, widths = [], rows }) {
  const all = [];
  if (title) all.push([{ t: title }]);
  if (note) all.push([{ nt: note }]);
  if (title || note) all.push([]);
  let headerRow = 0;
  rows.forEach(r => { all.push(r); });
  const body = all.map((r, ri) => {
    const cells = r.map((v, ci) => {
      const ref = colName(ci + 1) + (ri + 1);
      if (v && typeof v === 'object' && 't' in v) return `<c r="${ref}" s="${S.title}" t="inlineStr"><is><t>${X(v.t)}</t></is></c>`;
      if (v && typeof v === 'object' && 'nt' in v) return `<c r="${ref}" s="${S.note}" t="inlineStr"><is><t>${X(v.nt)}</t></is></c>`;
      if (v && typeof v === 'object' && 'h' in v && !headerRow) headerRow = ri + 1;
      return cell(v, ref);
    }).join('');
    const ht = r.some(v => v && typeof v === 'object' && 'h' in v) ? ' ht="30" customHeight="1"' : '';
    return `<row r="${ri + 1}"${ht}>${cells}</row>`;
  }).join('');
  const cols = widths.length ? `<cols>${widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('')}</cols>` : '';
  const pane = headerRow ? `<sheetViews><sheetView workbookViewId="0"><pane ySplit="${headerRow}" topLeftCell="A${headerRow + 1}" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>` : '';
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${pane}${cols}<sheetData>${body}</sheetData></worksheet>`;
}

export function buildXlsx(sheets) {
  const list = sheets.length ? sheets : [{ name: 'Data', rows: [] }];
  const names = list.map((s, i) => String(s.name || 'Sheet' + (i + 1)).replace(/[\\/?*[\]:]/g, ' ').slice(0, 31));
  const ct = `<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${list.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>`;
  const rels = '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>';
  const wb = `<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${names.map((n, i) => `<sheet name="${X(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets></workbook>`;
  const wr = `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${list.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}<Relationship Id="rId${list.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`;
  return zipStore([['[Content_Types].xml', ct], ['_rels/.rels', rels], ['xl/workbook.xml', wb], ['xl/_rels/workbook.xml.rels', wr], ['xl/styles.xml', STYLES], ...list.map((s, i) => [`xl/worksheets/sheet${i + 1}.xml`, sheetXml(s)])]);
}
