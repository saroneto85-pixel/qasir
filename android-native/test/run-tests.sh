#!/bin/sh
# Uji inti sinkronisasi di JVM desktop (tanpa Android SDK).
set -e
cd "$(dirname "$0")/.."
OUT=$(mktemp -d)
javac -d "$OUT" src/main/java/id/kasmini/pos/sync/MiniJson.java src/main/java/id/kasmini/pos/sync/SyncMerge.java \
  src/main/java/id/kasmini/pos/sync/SyncStore.java src/main/java/id/kasmini/pos/sync/SyncCore.java \
  test/MemorySyncStore.java test/SyncCoreTest.java
java -cp "$OUT" SyncCoreTest
