// Memastikan versi tampilan (version.js), package.json, dan index.html konsisten.
import { readFileSync } from 'node:fs';
import { APP_VERSION } from './version.js';
const pkg = JSON.parse(readFileSync('package.json', 'utf8')).version;
const html = readFileSync('index.html', 'utf8');
const errs = [];
if (APP_VERSION !== pkg) errs.push(`version.js (${APP_VERSION}) != package.json (${pkg})`);
const hard = [...html.matchAll(/KASIR v(\d+\.\d+\.\d+)/g)].map(m => m[1]).filter(v => v !== pkg);
if (hard.length) errs.push('index.html masih berisi versi lama: ' + hard.join(', '));
// Setiap halaman di navigasi samping harus punya kotak di Menu Utama beranda (navigasi samping tersembunyi di HP).
const side = [...html.matchAll(/<button data-page="([a-z]+)" class="nav/g)].map(m => m[1]).filter(p => p !== 'dashboard');
const tiles = new Set([...html.matchAll(/dashboard-menu-card" onclick="showPage\('([a-z]+)'\)/g)].map(m => m[1]));
const missing = side.filter(p => !tiles.has(p));
if (missing.length) errs.push('halaman tanpa kotak di Menu Utama beranda: ' + missing.join(', '));
if (errs.length) { console.error('GAGAL versi:\n  ' + errs.join('\n  ')); process.exit(1); }
console.log(`✓ versi konsisten: ${pkg}; ${side.length} halaman semuanya ada di Menu Utama beranda`);
