"""Menyetel versionName/versionCode APK dari package.json (mis. 2.9.0 -> versionName "2.9.0", versionCode 20900).
Dengan begitu APK baru selalu terpasang sebagai pembaruan dan Info Aplikasi Android menampilkan versi yang benar."""
import json, re, sys
from pathlib import Path

ver = json.loads(Path('package.json').read_text())['version']
m = re.fullmatch(r'(\d+)\.(\d+)\.(\d+)', ver)
if not m:
    sys.exit(f'Versi package.json tidak valid: {ver}')
code = int(m.group(1)) * 10000 + int(m.group(2)) * 100 + int(m.group(3))
p = Path('android/app/build.gradle')
s = p.read_text()
s2 = re.sub(r'versionCode\s+\d+', f'versionCode {code}', s)
s2 = re.sub(r'versionName\s+["\'][^"\']*["\']', f'versionName "{ver}"', s2)
if 'versionCode' not in s2:
    s2 = re.sub(r'(defaultConfig\s*\{)', f'\\1\n        versionCode {code}\n        versionName "{ver}"', s2, count=1)
p.write_text(s2)
print(f'Versi APK: versionName {ver}, versionCode {code}')
