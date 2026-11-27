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
