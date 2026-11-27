# Mac 实机任务：wSearch 桌面截图原型

分支 `codex/tauri-prewarm-mac-test`。请用 Mac 上的本地 Codex，在本机终端和图形会话里完成两套原型的构建、功能验证和对测。Windows 项目负责人的交接点是这个文件；Mac 的回报文件是 `results/mac/REPORT.md`。两个 Codex 账号可使用各自获准访问仓库的 GitHub 身份。

## 构建和范围

1. 先读分支最新提交，在 `results/mac/REPORT.md` 写入“已接单”、测试日期、待测提交、macOS / 芯片 / 显示器缩放，提交并推到本分支。无需写出设备名称、序列号或账号。
2. 在本目录运行 `bash build-unix.sh`。需要 macOS 14+、Xcode Command Line Tools、Rust、Bun、zstd。Tauri 和 Electrobun 使用同一个 `native/macos.swift`，包括 ScreenCaptureKit 抓屏、AppKit 选区和 PNG 写入剪贴板。保留实际构建日志中的版本；遇到 Swift、签名或包结构问题可在这条分支修复并记录。Windows 的隐藏窗口预热是 Windows 专项；请先测 macOS 已有实现。
3. 两版轮流启动，使用 Control+Option+Shift+S（Control，不是 Command），防止抢同一个快捷键。热键冲突时另测托盘入口并单列。首次屏幕录制授权、辅助功能/输入权限或系统对未公证应用的提示交给 Mac 使用者处理。

## 测量

- 使用自己的合成图案窗口、固定坐标和同一分辨率。A/B/B/A 交换顺序，每个版本至少 6 次有效拖框，单列首次。分别记录按键到屏幕上可操作的覆盖层、按键到看见拖框、松手到读到可粘贴的 PNG。用外部时钟、实际画面变化和一次成功拖动确认；只有应用日志或人工秒表时写明计时精度。
- 校验剪贴板 PNG 的实际像素、正向/反向拖框、Esc 取消、截图后底图改变仍复制冻结帧。覆盖内建 Retina 屏，有外接屏时加测不同缩放和非零屏幕原点。记录期望像素框和实际边界。提前保留可恢复的剪贴板内容，合成图以外的屏幕和用户数据不得写入仓库。
- 分别记录两版压缩包、解压后字节数、托盘空闲、截图期间整个进程组的采样峰值、打开和关闭相同说明页后的内存。尽可能使用 macOS physical footprint，记录浏览器子进程的归属；只能测 RSS 时单列。单位用 MiB 和 ms。与 Windows 私有工作集分开解释。
- 遇到阻塞，先推送“阻塞 + 具体错误 + 需要谁做什么”。没有真实桌面、权限或外接屏的项目填“未测”，不补估算数字。

## 双向回报

把结论、复现步骤、使用的提交 SHA 和限制写进 `results/mac/REPORT.md`，精简的逐次数据放在同目录的 `measurements.json`。只暂存有意发布的源码、报告、指标。每个阶段使用独立提交；推送前执行 `git pull --rebase`，然后普通 `git push origin HEAD:codex/tauri-prewarm-mac-test`。保留对方的新提交，不强推。有读权限但没有写权限时，通过有权使用的 fork 提交 PR 到该分支，然后把 PR 地址发给使用者。结束时回传报告链接及最后一个 commit SHA。
