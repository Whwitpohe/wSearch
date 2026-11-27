#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
case "$(uname -m)" in arm64) arch=arm64;; x86_64) arch=x64;; *) exit 2;; esac
dest="bin/darwin-$arch"
mkdir -p "$dest"
xcrun swiftc -O -parse-as-library -target "$(uname -m)-apple-macos14.0" -framework AppKit -framework ScreenCaptureKit macos.swift -o "$dest/wsearch-capture"
