"""Terapkan ikon KASIR ke proyek Android hasil `cap add android`.

Penyebab ikon robot hijau: template Capacitor membawa ikon bawaan (ic_launcher*.png, ic_launcher_round*.png,
ic_launcher_foreground di mipmap/drawable-v24 serta ic_launcher_round.xml). Workflow lama hanya menimpa sebagian,
sehingga ikon bawaan tetap dipakai launcher (terutama ikon bulat). Skrip ini menghapus SEMUA ikon bawaan lebih dulu,
lalu memasang ikon KASIR (logo-dbl.png) untuk ikon adaptif, ikon bulat, dan ikon lama."""
import glob, os, shutil
RES = 'android/app/src/main/res'
BR = 'android-branding'
for pat in ['mipmap-*/ic_launcher*', 'drawable*/ic_launcher*', 'mipmap-*/ic_launcher_foreground*']:
    for f in glob.glob(f'{RES}/{pat}'):
        if os.path.isfile(f): os.remove(f)
for d in ['mdpi', 'hdpi', 'xhdpi', 'xxhdpi', 'xxxhdpi']:
    os.makedirs(f'{RES}/mipmap-{d}', exist_ok=True)
    for n in ['ic_launcher.png', 'ic_launcher_round.png']:
        shutil.copy(f'{BR}/mipmap-{d}/{n}', f'{RES}/mipmap-{d}/{n}')
os.makedirs(f'{RES}/mipmap-anydpi-v26', exist_ok=True)
for n in ['ic_launcher.xml', 'ic_launcher_round.xml']:
    shutil.copy(f'{BR}/mipmap-anydpi-v26/{n}', f'{RES}/mipmap-anydpi-v26/{n}')
os.makedirs(f'{RES}/drawable-nodpi', exist_ok=True)
shutil.copy(f'{BR}/drawable-nodpi/ic_launcher_foreground.png', f'{RES}/drawable-nodpi/ic_launcher_foreground.png')
os.makedirs(f'{RES}/values', exist_ok=True)
shutil.copy(f'{BR}/values/ic_launcher_background.xml', f'{RES}/values/ic_launcher_background.xml')
# drawable/ic_launcher_background.xml bawaan (vektor) bentrok dengan warna kita -> sudah terhapus oleh pola 'drawable*/ic_launcher*'
man = 'android/app/src/main/AndroidManifest.xml'
t = open(man, encoding='utf-8').read()
import re
t = re.sub(r'android:icon="[^"]*"', 'android:icon="@mipmap/ic_launcher"', t)
t = re.sub(r'android:roundIcon="[^"]*"', 'android:roundIcon="@mipmap/ic_launcher_round"', t)
t = re.sub(r'android:label="[^"]*"', 'android:label="KASIR"', t, count=1)
open(man, 'w', encoding='utf-8').write(t)
print('Ikon KASIR terpasang')
