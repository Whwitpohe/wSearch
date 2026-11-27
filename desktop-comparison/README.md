# wSearch 桌面宿主实验

Tauri 2 + Rust 和 Bun + Electrobun 两个截图原型，按平台共用同一个原生截图组件。托盘快捷键为 Ctrl+Alt+Shift+S。

在 macOS 14+ 上安装 Xcode 命令行工具、Rust、Bun、zstd，然后在本目录执行 `bash build-unix.sh`。Windows x64 执行 `./build-windows.ps1`。Linux 构建需要 GTK、WebKitGTK 4.1、X11/XRandR、libpng、GIO 等开发库。

[Mac 实机任务](MAC-TASK.md) · [Mac 回报](results/mac/REPORT.md)

[Windows Tauri 隐藏窗口预热实现与实测](WARM-WINDOWS.md)
