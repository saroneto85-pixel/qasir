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
