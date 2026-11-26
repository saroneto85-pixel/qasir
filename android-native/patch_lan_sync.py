"""
Memasang dukungan sinkronisasi LAN (Room + Ktor + NSD + Foreground Service) ke proyek Android
hasil `npx cap add android`. Aman dijalankan berulang (idempoten).

Yang diubah:
  android/build.gradle           -> plugin Gradle Kotlin
  android/variables.gradle       -> minSdkVersion minimal 26 (Android 8.0) untuk Ktor server
  android/gradle.properties      -> validasi target JVM Kotlin tidak menggagalkan build
  android/app/build.gradle       -> plugin kotlin-android, dependensi Ktor/Room/coroutines, packaging
  android/app/src/main/AndroidManifest.xml -> izin jaringan/NSD/foreground service, layanan, cleartext LAN
"""
import re
import sys
from pathlib import Path

KOTLIN_VERSION = "2.0.21"
KTOR_VERSION = "2.3.13"
ROOM_VERSION = "2.6.1"
COROUTINES_VERSION = "1.7.3"
MIN_SDK = 26

root = Path("android")
if not root.exists():
    sys.exit("Folder android/ tidak ditemukan. Jalankan `npx cap add android` lebih dulu.")


def patch(path: Path, fn):
    s = path.read_text()
    n = fn(s)
    if n != s:
        path.write_text(n)
        print("Diperbarui:", path)
    else:
        print("Sudah sesuai:", path)


# 1) build.gradle (root): classpath plugin Kotlin
def root_gradle(s: str) -> str:
    if "kotlin-gradle-plugin" in s:
        return s
    m = re.search(r"(\n(\s*)classpath ['\"]com\.android\.tools\.build:gradle:[^'\"]+['\"])", s)
    if not m:
        sys.exit("Tidak menemukan classpath Android Gradle Plugin di android/build.gradle")
    line = f"\n{m.group(2)}classpath 'org.jetbrains.kotlin:kotlin-gradle-plugin:{KOTLIN_VERSION}'"
    return s[: m.end()] + line + s[m.end():]


patch(root / "build.gradle", root_gradle)


# 2) variables.gradle: minSdkVersion >= 26
def variables(s: str) -> str:
    def bump(m):
        v = int(m.group(2))
        return f"{m.group(1)}{max(v, MIN_SDK)}"
    return re.sub(r"(minSdkVersion\s*=\s*)(\d+)", bump, s)


if (root / "variables.gradle").exists():
    patch(root / "variables.gradle", variables)


# 3) gradle.properties
def props(s: str) -> str:
    add = []
    if "kotlin.jvm.target.validation.mode" not in s:
        add.append("kotlin.jvm.target.validation.mode=warning")
    if "android.useAndroidX" not in s:
        add.append("android.useAndroidX=true")
    return s.rstrip("\n") + ("\n" + "\n".join(add) + "\n" if add else "\n")


gp = root / "gradle.properties"
if not gp.exists():
    gp.write_text("")
patch(gp, props)

# 4) app/build.gradle
APP_BLOCK = f"""

// ---- Sinkronisasi LAN KASIR (Room + Ktor + NSD) ----
apply plugin: 'kotlin-android'

android {{
    packaging {{
        resources {{
            excludes += ['META-INF/INDEX.LIST', 'META-INF/io.netty.versions.properties', 'META-INF/DEPENDENCIES',
                         'META-INF/LICENSE.md', 'META-INF/NOTICE.md']
        }}
    }}
}}

// Samakan target JVM Kotlin dengan Java (Capacitor memakai Java 21 di capacitor.build.gradle).
tasks.withType(org.jetbrains.kotlin.gradle.tasks.KotlinCompile).configureEach {{
    compilerOptions {{
        jvmTarget.set(org.jetbrains.kotlin.gradle.dsl.JvmTarget.fromTarget(android.compileOptions.targetCompatibility.toString()))
    }}
}}

dependencies {{
    implementation "org.jetbrains.kotlin:kotlin-stdlib:{KOTLIN_VERSION}"
    implementation "org.jetbrains.kotlinx:kotlinx-coroutines-android:{COROUTINES_VERSION}"
    implementation "io.ktor:ktor-server-core:{KTOR_VERSION}"
    implementation "io.ktor:ktor-server-cio:{KTOR_VERSION}"
    implementation "io.ktor:ktor-client-core:{KTOR_VERSION}"
    implementation "io.ktor:ktor-client-okhttp:{KTOR_VERSION}"
    implementation "androidx.room:room-runtime:{ROOM_VERSION}"
    annotationProcessor "androidx.room:room-compiler:{ROOM_VERSION}"
}}
"""


def app_gradle(s: str) -> str:
    if "Sinkronisasi LAN KASIR" in s:
        return s
    return s.rstrip("\n") + APP_BLOCK


patch(root / "app" / "build.gradle", app_gradle)

# 5) AndroidManifest.xml
PERMS = [
    "android.permission.INTERNET",
    "android.permission.ACCESS_NETWORK_STATE",
    "android.permission.ACCESS_WIFI_STATE",
    "android.permission.CHANGE_WIFI_MULTICAST_STATE",
    "android.permission.CHANGE_NETWORK_STATE",
    "android.permission.WAKE_LOCK",
    "android.permission.FOREGROUND_SERVICE",
    "android.permission.FOREGROUND_SERVICE_CONNECTED_DEVICE",
    "android.permission.POST_NOTIFICATIONS",
]
SERVICE = ('        <service android:name="id.kasmini.pos.sync.LanSyncService" android:exported="false" '
           'android:foregroundServiceType="connectedDevice" />\n')


def manifest(s: str) -> str:
    add = "".join(f'    <uses-permission android:name="{p}" />\n' for p in PERMS if f'"{p}"' not in s)
    if add:
        s = s.replace("<application", add + "    <application", 1)
    if "usesCleartextTraffic" not in s:
        # HTTP polos hanya dipakai di jaringan lokal toko (Ktor server <-> klien).
        s = s.replace("<application", '<application android:usesCleartextTraffic="true"', 1)
    if "LanSyncService" not in s:
        i = s.rfind("</application>")
        if i < 0:
            sys.exit("Tidak menemukan </application> di AndroidManifest.xml")
        s = s[:i] + SERVICE + "    " + s[i:]
    return s


patch(root / "app" / "src" / "main" / "AndroidManifest.xml", manifest)
print("Sinkronisasi LAN terpasang.")
