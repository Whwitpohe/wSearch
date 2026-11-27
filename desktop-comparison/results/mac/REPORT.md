# macOS 实机回报

状态：**Tauri 已构建，等待应用录屏授权**。

- 测试日期：2026-11-27（新加坡时间）
- 待测提交：`a5b31728c562408889c5c48b8e03fcdf54dd0f1e`。恢复任务时分支新增 Windows Tauri 预热提交，已读取并纳入待测基线。macOS 路径仍按现有实现对测。
- 测试环境：macOS 27.3（26C5047e），Apple M1 Pro，16 GB 内存。内建 Retina 屏为 1512 × 982 逻辑点、2× 缩放、3024 × 1964 像素。当前检测到一台显示器。

任务及验收口径见 [MAC-TASK.md](../../MAC-TASK.md)。请在这里追加“已接单 / 阻塞 / 已完成”、待测 SHA、测试环境和结果。Windows 端通过读取本分支的新提交接收回报。

## 推送和录屏授权

状态：**阻塞**（2026-11-27）。接单提交已在本机创建。公开分支可以读取，`git pull --rebase` 成功，普通推送返回 `fatal: could not read Username for 'https://github.com': terminal prompts disabled`。GitHub CLI 未登录，正在等待使用者为可写原仓库或可操作 fork 的 GitHub 账号完成设备授权。

macOS 有本地图形会话。录屏权限预检返回 `false`，已请求使用者在系统设置中授权。用于发送测试按键和鼠标事件的权限预检返回 `true`。按约定，接单提交推送后才开始构建。两版构建、内存、热键延迟、Retina 剪贴板、反向拖框、Esc 和冻结帧目前均未测。未检测到外接屏，外接屏测试未测。

### 恢复任务

2026-11-27 复查，测量工具的屏幕录制和键鼠事件发送权限均已通过。当前只等待 GitHub 设备授权，以推送接单记录。

## Tauri 构建和首次权限检查

按使用者的最新指示，实机范围为 Tauri。接单提交已推送。以 `a5b31728c562408889c5c48b8e03fcdf54dd0f1e` 的源码完成 arm64 release 构建和 ad hoc 签名，`codesign --verify --deep --strict` 通过。构建日志记录 Xcode 27.2（27B52）、Apple Swift 6.4.2、rustc/cargo 1.100.0 和 Tauri 2.12.7。压缩包为 2,286,183 字节，解压后应用包常规文件合计 6,708,796 字节。

状态：**截图测试阻塞**。全局热键已注册并成功启动 `wsearch-capture`。首次触发的辅助进程退出码为 2，4.5 秒内未出现覆盖层，剪贴板未变化。macOS TCC 日志确认 `kTCCServiceScreenCapture` 拒绝了 `local.wsearch.tauritrial`。需要 Mac 使用者为 **wSearch Tauri Trial** 打开「屏幕与系统音频录制」权限，再重新启动应用。该次权限探针不计入截图延迟。

## Tauri 内存和包大小

| 状态 | Physical footprint 中位数（MiB） | 采样范围（MiB） |
| --- | ---: | ---: |
| 托盘空闲 | 15.03 | 15.03–15.03 |
| 说明页打开 | 62.38 | 62.27–65.44 |
| 说明页关闭后 | 46.64 | 46.60–46.88 |

每个状态取 7 个样本，说明页在打开和关闭后分别等待 2 秒再采样。使用 `proc_pid_rusage` 的 physical footprint，和 Windows 私有工作集分开解读。说明页打开时，WebContent、GPU、Networking 三个 WebKit 进程的系统 responsible PID 均指向 Tauri，已计入总量。关闭后 WebContent 退出，GPU 和 Networking 在采样窗口内仍在。进程明细见 [measurements.json](measurements.json)。

压缩包 2.18 MiB，解压后应用包常规文件 6.40 MiB。重新解压并验证签名通过。压缩包 SHA-256 为 `915fb743b6f5969a47c72182da86a2eb9be0987cb0e66605597ce39f8d361600`。

## 复现与当前范围

1. 在待测提交的 `desktop-comparison` 目录执行 `awk 'index($0, "(cd electrobun-host ") == 1 { exit } { print }' build-unix.sh | bash`，运行构建脚本的 Tauri 阶段。
2. 用 `open` 启动 `wSearch Tauri Trial.app`。启动参数 `WSEARCH_TRIAL_SHOW_UI=1` 显示说明页。给该应用录屏权限后，用 Control+Option+Shift+S 触发原生截图。
3. 内建 Retina 屏使用固定合成图案。正向拖框从 (400, 330) 到 (600, 450) 逻辑点，反向交换两端。期望 PNG 为 400 × 240 px，左上角 (800, 660)，右下角半开边界为 (1200, 900)。
4. 以单调时钟记录键鼠发送、ScreenCaptureKit 完整帧回调和剪贴板读到 PNG。截图进程组约每 20 ms 采样。首次授权失败只保留诊断记录。

Electrobun 和双版本 A/B/B/A 对测按最新范围取消。截图延迟、截图期间峰值、Retina 实际像素边界、正反拖框、Esc 和冻结帧待 Tauri 录屏授权。未检测到外接屏，混合缩放和非零屏幕原点未测。
