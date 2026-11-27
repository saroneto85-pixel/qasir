# Skrip ini dipanggil oleh workflow lama maupun baru, jadi ikon KASIR dipasang di sini juga (idempoten).
import runpy, os
_b = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'apply_branding.py')
if os.path.exists(_b): runpy.run_path(_b, run_name='__main__')

# Pasang init script mirror Maven (mencegah galat 429 dari Maven Central). Aman dijalankan berulang.
import shutil, pathlib
_m = pathlib.Path(__file__).with_name('mirror.init.gradle')
if _m.exists():
    _d = pathlib.Path.home() / '.gradle' / 'init.d'; _d.mkdir(parents=True, exist_ok=True)
    shutil.copy(_m, _d / 'mirror.init.gradle'); print('Init script mirror Maven terpasang di', _d)
from pathlib import Path
p=Path('android/app/src/main/AndroidManifest.xml')
s=p.read_text()
perms='''    <uses-permission android:name="android.permission.READ_CONTACTS" />
    <uses-permission android:name="android.permission.BLUETOOTH" android:maxSdkVersion="30" />
    <uses-permission android:name="android.permission.BLUETOOTH_ADMIN" android:maxSdkVersion="30" />
    <uses-permission android:name="android.permission.BLUETOOTH_CONNECT" />
    <uses-permission android:name="android.permission.BLUETOOTH_SCAN" />
'''
if 'android.permission.BLUETOOTH_CONNECT' not in s:
    s=s.replace('<application',perms+'    <application',1)
p.write_text(s)

# ---- Sinkronisasi LAN (2.8.0) ----
# Dipasang dari sini juga, agar build tetap lengkap walau workflow lama hanya menyalin *.java
# dari folder utama (subfolder sync/ tidak ikut). Aman dijalankan berulang.
_here = pathlib.Path(__file__).resolve().parent
_src = _here / 'src' / 'main' / 'java' / 'id' / 'kasmini' / 'pos'
_dst = pathlib.Path('android/app/src/main/java/id/kasmini/pos')
_dst.mkdir(parents=True, exist_ok=True)
for _f in _src.glob('*.java'):
    shutil.copy(_f, _dst / _f.name)
if 'LanSyncPlugin' in (_src / 'MainActivity.java').read_text() and not (_src / 'sync' / 'LanSyncPlugin.kt').exists():
    raise SystemExit('GALAT: folder android-native/src/main/java/id/kasmini/pos/sync/ tidak ada di repository. '
                     'Unggah ulang seluruh isi KASIR_SOURCE_2_8_0 (termasuk subfolder sync/ dan .github/).')
if (_src / 'sync').is_dir():
    shutil.copytree(_src / 'sync', _dst / 'sync', dirs_exist_ok=True)
    print('Sumber sinkronisasi LAN disalin ke', _dst / 'sync')
_lan = _here / 'patch_lan_sync.py'
if _lan.exists():
    runpy.run_path(str(_lan), run_name='__main__')
_ver = _here / 'patch_version.py'
if _ver.exists():
    runpy.run_path(str(_ver), run_name='__main__')
