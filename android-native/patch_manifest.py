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
