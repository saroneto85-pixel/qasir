# Skrip ini dipanggil oleh workflow lama maupun baru, jadi ikon KASIR dipasang di sini juga (idempoten).
import runpy, os
_b = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'apply_branding.py')
if os.path.exists(_b): runpy.run_path(_b, run_name='__main__')
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
