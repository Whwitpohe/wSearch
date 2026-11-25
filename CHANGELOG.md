# 更新记录

## 15.8.1 · 2026-11-25

[中英双语发布说明](docs/releases/15.8.1.md) · [发布日志及下载](https://github.com/Whwitpohe/wSearch/releases/tag/15.8.1) · [多语言介绍页](https://whwitpohe.github.io/wSearch/#changes)

- **整图翻译**。配置支持图像的 OpenAI 兼容、Anthropic 或 Gemini 模型后，框选屏幕区域即可将译文显示在原图对应的位置。发送给模型的内容为选中的截图。
- **框选后执行动作**。在快捷键设置中给翻译、画笔、复制或保存分别绑定组合键。动作选择器支持分类和搜索。
- **OCR 和设置**。切换 OCR 引擎会打开对应的配置面板，在线模型支持获取和搜索模型列表。代理设置按模式显示所需字段。
- **桌面界面**。设置、日志和 AI 输入区支持深浅主题。Windows 11 的主要窗口保留原生标题栏按钮，并可使用 Mica 材质。
- **性能**。文本翻译按需载入语言识别模型，连续屏幕翻译等待上一轮结束后再刷新，录屏提示减少了重复的进程间通信。

Windows 安装程序使用独立的 wSearch 应用标识，首次使用时可以沿用已有的 eSearch 配置。发布页按平台列出本版本可下载的文件和 SHA-256 校验值。

### 2026-11-26 · 补充平台安装包

| 系统 | 架构 | 包格式 |
| --- | --- | --- |
| macOS | Apple Silicon（ARM64）、Intel（x64） | DMG、ZIP |
| Linux | x64、ARM64 | AppImage、DEB、RPM、tar.gz |

两个 Mac 架构的 ZIP 和两个 Linux 架构的 tar.gz 均已从公开发布页下载，并在对应的原生运行器上解包、启动和确认版本号。macOS 包未经过 Apple Developer ID 签名或公证。[构建记录](https://github.com/Whwitpohe/wSearch/actions/runs/45661625688) · [启动验证](https://github.com/Whwitpohe/wSearch/actions/runs/45663261734) · [全部安装包 SHA-256](https://github.com/Whwitpohe/wSearch/releases/download/15.8.1/SHA256SUMS.txt)
