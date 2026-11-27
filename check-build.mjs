// Memeriksa HASIL build (bukan kode sumber): halaman yang masuk ke APK harus memuat semua kotak Menu Utama
// dan nomor versi yang sama dengan package.json. Pakai: node check-build.mjs <folder-web> [label]
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
const dir = process.argv[2] || 'dist', label = process.argv[3] || dir;
const ver = JSON.parse(readFileSync('package.json', 'utf8')).version;
const errs = [];
const htmlPath = join(dir, 'index.html');
if (!existsSync(htmlPath)) { console.error(`GAGAL [${label}]: ${htmlPath} tidak ada`); process.exit(1); }
const html = readFileSync(htmlPath, 'utf8');
const src = readFileSync('index.html', 'utf8');
const want = [...src.matchAll(/dashboard-menu-card" onclick="showPage\('([a-z]+)'\)/g)].map(m => m[1]);
for (const p of want) if (!html.includes(`showPage('${p}')`)) errs.push(`kotak Menu Utama '${p}' tidak ada`);
for (const p of ['bahan', 'hpp']) if (!html.includes(`showPage('${p}')`)) errs.push(`kotak Menu Utama '${p}' tidak ada`);
const assets = join(dir, 'assets');
const js = existsSync(assets) ? readdirSync(assets).filter(f => f.endsWith('.js')).map(f => readFileSync(join(assets, f), 'utf8')).join('\n') : '';
if (!js.includes(`"${ver}"`) && !js.includes(`'${ver}'`)) errs.push(`versi ${ver} tidak ditemukan di JavaScript hasil build`);
if (!js.includes('Stok Bahan Baku') && !html.includes('Stok Bahan Baku')) errs.push('modul Stok Bahan Baku tidak ikut ter-build');
if (errs.length) { console.error(`GAGAL [${label}]:\n  ` + [...new Set(errs)].join('\n  ')); process.exit(1); }
console.log(`✓ [${label}] build berisi ${want.length} kotak Menu Utama (termasuk Stok Bahan Baku & HPP Menu) dan versi ${ver}`);
