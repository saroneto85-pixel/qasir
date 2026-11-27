// Pembaca .xlsx ringan tanpa dependensi (untuk impor data HPP / bahan baku).
// Berjalan di WebView Android & Node >= 18 (memakai DecompressionStream 'deflate-raw').
// Hanya membaca NILAI sel: untuk sel rumus dipakai nilai tersimpan (cache) bila ada.
//
// readXlsx(ArrayBuffer|Uint8Array) -> Promise<{ [namaSheet]: Array<Array<string|number|boolean|null>> }>

const dec = new TextDecoder();

async function inflateRaw(bytes) {
  const ds = new DecompressionStream('deflate-raw');
  const stream = new Blob([bytes]).stream().pipeThrough(ds);
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function unzip(buf) {
  const u8 = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  let eocd = -1;
  for (let i = u8.length - 22; i >= Math.max(0, u8.length - 65557); i--) {
    if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('Bukan file Excel (.xlsx) yang valid');
  const count = dv.getUint16(eocd + 10, true);
  let p = dv.getUint32(eocd + 16, true);
  const files = {};
  for (let k = 0; k < count; k++) {
    if (dv.getUint32(p, true) !== 0x02014b50) throw new Error('Struktur ZIP rusak');
    const method = dv.getUint16(p + 10, true);
    const csize = dv.getUint32(p + 20, true);
    const nlen = dv.getUint16(p + 28, true), elen = dv.getUint16(p + 30, true), clen = dv.getUint16(p + 32, true);
    const off = dv.getUint32(p + 42, true);
    const name = dec.decode(u8.subarray(p + 46, p + 46 + nlen));
    p += 46 + nlen + elen + clen;
    const lnlen = dv.getUint16(off + 26, true), lelen = dv.getUint16(off + 28, true);
    const start = off + 30 + lnlen + lelen;
    const raw = u8.subarray(start, start + csize);
    files[name] = { method, raw };
  }
  return {
    has: n => !!files[n],
    async text(n) {
      const f = files[n];
      if (!f) return null;
      if (f.method === 0) return dec.decode(f.raw);
      if (f.method === 8) return dec.decode(await inflateRaw(f.raw));
      throw new Error('Kompresi ZIP tidak didukung: ' + f.method);
    }
  };
}

const unesc = s => s.replace(/&(lt|gt|amp|quot|apos|#\d+|#x[0-9a-fA-F]+);/g, (_, e) =>
  e === 'lt' ? '<' : e === 'gt' ? '>' : e === 'amp' ? '&' : e === 'quot' ? '"' : e === 'apos' ? "'" :
  String.fromCodePoint(e[1] === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)));
const attr = (tag, name) => { const m = tag.match(new RegExp('\\s' + name + '="([^"]*)"')); return m ? unesc(m[1]) : null; };
const texts = xml => [...xml.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>|<t(?:\s[^>]*)?\/>/g)].map(m => unesc(m[1] || '')).join('');

export function colIndex(ref) {
  const m = String(ref).match(/^([A-Z]+)/);
  if (!m) return 0;
  let n = 0;
  for (const ch of m[1]) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

function parseSheet(xml, shared) {
  const rows = [];
  for (const rm of xml.matchAll(/<row\b([^>]*)>([\s\S]*?)<\/row>|<row\b([^>]*)\/>/g)) {
    const rAttr = rm[1] ?? rm[3] ?? '';
    const r = Number(attr('<x' + rAttr + '>', 'r')) || rows.length + 1;
    const row = [];
    for (const cm of (rm[2] || '').matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const a = '<c' + cm[1] + '>', body = cm[2] || '';
      const ref = attr(a, 'r'), t = attr(a, 't');
      const idx = ref ? colIndex(ref) : row.length;
      const vm = body.match(/<v>([\s\S]*?)<\/v>/);
      let v = null;
      if (t === 's') v = vm ? shared[Number(vm[1])] ?? '' : '';
      else if (t === 'inlineStr') v = texts(body);
      else if (t === 'str') v = vm ? unesc(vm[1]) : '';
      else if (t === 'b') v = vm ? vm[1] === '1' : null;
      else if (t === 'e') v = null;
      else if (vm) { const num = Number(vm[1]); v = Number.isFinite(num) ? num : unesc(vm[1]); }
      row[idx] = v;
    }
    rows[r - 1] = row;
  }
  for (let i = 0; i < rows.length; i++) if (!rows[i]) rows[i] = [];
  return rows;
}

export async function readXlsx(buf) {
  const z = await unzip(buf);
  const wb = await z.text('xl/workbook.xml');
  if (!wb) throw new Error('File bukan workbook Excel (.xlsx)');
  const relsXml = (await z.text('xl/_rels/workbook.xml.rels')) || '';
  const rels = {};
  for (const m of relsXml.matchAll(/<Relationship\b[^>]*>/g)) rels[attr(m[0], 'Id')] = attr(m[0], 'Target');
  const sharedXml = await z.text('xl/sharedStrings.xml');
  const shared = sharedXml ? [...sharedXml.matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g)].map(m => texts(m[1])) : [];
  const out = {};
  for (const m of wb.matchAll(/<sheet\b[^>]*>/g)) {
    const name = attr(m[0], 'name'), rid = attr(m[0], 'r:id');
    let target = rels[rid] || '';
    target = target.startsWith('/') ? target.slice(1) : 'xl/' + target.replace(/^\.\//, '');
    const xml = await z.text(target);
    if (xml) out[name] = parseSheet(xml, shared);
  }
  return out;
}
