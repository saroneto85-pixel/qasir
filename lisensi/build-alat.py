"""Menyusun lisensi/pembuat-kode-aktivasi.html (satu file, offline) dari alat-template.html + lisensi-core.mjs.
Jalankan ulang setiap kali lisensi-core.mjs berubah: python3 lisensi/build-alat.py"""
import re
from pathlib import Path

here = Path(__file__).parent
core = (here / "lisensi-core.mjs").read_text(encoding="utf-8")
core = re.sub(r"^export (async function|function|const)", r"\1", core, flags=re.M)
html = (here / "alat-template.html").read_text(encoding="utf-8").replace("/*__CORE__*/", core)
(here / "pembuat-kode-aktivasi.html").write_text(html, encoding="utf-8")
print("Tersusun:", here / "pembuat-kode-aktivasi.html")
