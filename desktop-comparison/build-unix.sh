#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
root="$PWD"
case "$(uname -m)" in x86_64) arch=x64;; arm64|aarch64) arch=arm64;; *) echo 'Unsupported CPU'; exit 1;; esac
case "$(uname -s)" in
 Linux) os=linux; native=linux; bash native/build-linux.sh;;
 Darwin) os=macos; native=darwin; bash native/build-macos.sh;;
 *) exit 2;;
esac
cargo build --locked --release --manifest-path tauri-host/Cargo.toml
out="$root/artifacts/tauri-$os-$arch"
mkdir -p "$out"
if [[ "$os" = macos ]]; then
    app="$out/wSearch Tauri Trial.app"
    mkdir -p "$app/Contents/MacOS"
    cp tauri-host/target/release/wsearch-tauri-trial "native/bin/$native-$arch/wsearch-capture" "$app/Contents/MacOS/"
    cp tauri-host/Info.plist "$app/Contents/"
    codesign --force --sign - "$app/Contents/MacOS/wsearch-capture"
    codesign --force --sign - "$app"
else
    cp tauri-host/target/release/wsearch-tauri-trial "native/bin/$native-$arch/wsearch-capture" "$out/"
fi
tar -czf "$out.tar.gz" -C "$root/artifacts" "$(basename "$out")"
(cd electrobun-host && bun install --frozen-lockfile && bun run build)
bundle="$(find electrobun-host/artifacts -maxdepth 1 -name "stable-$os-$arch-*.tar.zst" -print -quit)"
test -n "$bundle"
out="$root/artifacts/electrobun-$os-$arch"
mkdir -p "$out"
if [[ "$os" = macos ]]; then zstd -dc "$bundle" | tar -xf - -C "$out"; else zstd -dc "$bundle" | tar -xf - -C "$out" --strip-components=1; fi
tar -czf "$out.tar.gz" -C "$root/artifacts" "$(basename "$out")"
