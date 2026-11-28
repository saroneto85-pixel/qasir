"""
Menerapkan paket update KASIR yang diunggah lewat github.com (Add file -> Upload files).

Mencari KASIR_UPDATE_*.zip / KASIR_SOURCE_*.zip di akar repo atau folder update/, lalu:
  - mengekstrak isinya ke repo (folder teratas KASIR_SOURCE_x/ dibuang bila ada);
  - TIDAK menimpa lisensi/kunci-publik.txt yang sudah berisi kunci;
  - TIDAK menyalin berkas .github/workflows/* (token Actions tidak boleh mengubah workflow) —
    berkas yang berbeda dicantumkan di ringkasan agar diperbarui manual;
  - menolak berkas rahasia (*.p12, *.jks, cadangan kunci lisensi) dan path berbahaya;
  - menghapus zip yang sudah diterapkan.
Keluaran: ringkasan Markdown ke $GITHUB_STEP_SUMMARY (bila ada) dan ke stdout.
Kode keluar 0 = sukses (ada/tidak ada perubahan), 1 = zip rusak.
"""
import fnmatch
import os
import shutil
import sys
import zipfile
from pathlib import Path, PurePosixPath

root = Path(sys.argv[1] if len(sys.argv) > 1 else ".").resolve()
def version_key(p: Path):
    """KASIR_UPDATE_2_14_0.zip -> (2, 14, 0); paket lama diterapkan lebih dulu."""
    nums = [int(x) for x in __import__("re").findall(r"\d+", p.stem)]
    return (nums, p.name)


zips = sorted({*root.glob("KASIR_UPDATE_*.zip"), *root.glob("KASIR_SOURCE_*.zip"), *root.glob("update/*.zip")}, key=version_key)
SECRET = ["*.p12", "*.jks", "*.keystore", "*.p12.base64.txt", "KASIRDBL-kunci-lisensi-CADANGAN*.json"]
lines, workflow_manual, applied, skipped = [], [], [], []


def has_key(p: Path) -> bool:
    if not p.exists():
        return False
    return any(l.strip() and not l.strip().startswith("#") for l in p.read_text(encoding="utf-8", errors="ignore").splitlines())


if not zips:
    print("Tidak ada paket update untuk diterapkan.")
    sys.exit(0)

for z in zips:
    try:
        zf = zipfile.ZipFile(z)
        names = [n for n in zf.namelist() if not n.endswith("/")]
    except zipfile.BadZipFile:
        print(f"::error::{z.name} rusak / bukan zip. Unggah ulang.")
        sys.exit(1)
    tops = {n.split("/", 1)[0] for n in names}
    strip = len(tops) == 1 and next(iter(tops)).startswith("KASIR_SOURCE_") and all("/" in n for n in names)
    for n in names:
        rel = n.split("/", 1)[1] if strip else n
        pp = PurePosixPath(rel)
        if not rel or pp.is_absolute() or ".." in pp.parts or rel.startswith(".git/"):
            skipped.append(f"{rel} (path tidak aman)")
            continue
        if any(fnmatch.fnmatch(pp.name, pat) for pat in SECRET):
            skipped.append(f"{rel} (berkas rahasia — tidak boleh di repo)")
            continue
        dest = root / rel
        data = zf.read(n)
        if rel.startswith(".github/workflows/"):
            if not dest.exists() or dest.read_bytes() != data:
                workflow_manual.append(rel)
            continue
        if rel == "lisensi/kunci-publik.txt" and has_key(dest):
            skipped.append(f"{rel} (kunci publik Anda dipertahankan)")
            continue
        if dest.exists() and dest.read_bytes() == data:
            continue
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_bytes(data)
        if rel not in applied:
            applied.append(rel)
    zf.close()
    z.unlink()
    lines.append(f"- Paket **{z.name}** diterapkan dan zip-nya dihapus.")

upd = root / "update"
if upd.is_dir() and not any(upd.iterdir()):
    upd.rmdir()

out = ["## Terapkan paket update KASIR", *lines, "", f"**{len(applied)} berkas diperbarui.**"]
if applied:
    out += ["<details><summary>Daftar berkas</summary>", "", *[f"- `{a}`" for a in sorted(applied)], "", "</details>"]
if skipped:
    out += ["", "Dilewati:", *[f"- `{s}`" for s in skipped]]
if workflow_manual:
    out += ["", "### ⚠️ Perbarui manual di github.com (berkas workflow)",
            "Token Actions tidak diizinkan mengubah workflow. Untuk setiap berkas berikut: buka di github.com → ikon pensil → "
            "hapus semua isi → tempel isi berkas yang sama dari paket zip → Commit changes.",
            *[f"- `{w}`" for w in workflow_manual]]
text = "\n".join(out) + "\n"
print(text)
if os.environ.get("GITHUB_STEP_SUMMARY"):
    with open(os.environ["GITHUB_STEP_SUMMARY"], "a", encoding="utf-8") as f:
        f.write(text)
if os.environ.get("GITHUB_OUTPUT"):
    with open(os.environ["GITHUB_OUTPUT"], "a", encoding="utf-8") as f:
        f.write(f"changed={'true' if applied else 'false'}\nworkflows={' '.join(workflow_manual)}\n")
