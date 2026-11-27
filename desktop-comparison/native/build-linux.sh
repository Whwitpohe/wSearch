#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
case "$(uname -m)" in x86_64) arch=x64;; aarch64) arch=arm64;; *) exit 2;; esac
dest="bin/linux-$arch"
mkdir -p "$dest"
c++ -std=c++17 -O2 -s linux.cpp -o "$dest/wsearch-capture" $(pkg-config --cflags --libs x11 xrandr libpng gio-2.0)
