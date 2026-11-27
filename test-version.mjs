// Memastikan versi tampilan (version.js), package.json, dan index.html konsisten.
import { readFileSync } from 'node:fs';
import { APP_VERSION } from './version.js';
const pkg = JSON.parse(readFileSync('package.json', 'utf8')).version;
const html = readFileSync('index.html', 'utf8');
const errs = [];
if (APP_VERSION !== pkg) errs.push(`version.js (${APP_VERSION}) != package.json (${pkg})`);
const hard = [...html.matchAll(/KASIR v(\d+\.\d+\.\d+)/g)].map(m => m[1]).filter(v => v !== pkg);
if (hard.length) errs.push('index.html masih berisi versi lama: ' + hard.join(', '));
if (errs.length) { console.error('GAGAL versi:\n  ' + errs.join('\n  ')); process.exit(1); }
console.log('✓ versi konsisten: ' + pkg);
