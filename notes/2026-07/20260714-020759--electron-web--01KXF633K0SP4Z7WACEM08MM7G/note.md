# Electron：用 Web 技术构建跨平台桌面应用

Electron 是把 Chromium 与 Node.js 嵌入同一运行时的开源桌面框架，使 HTML/CSS/JavaScript 能交付 Windows、macOS、Linux 上的本地应用。

## 核心讲解

**定义。** Electron（原 Atom Shell）是桌面应用运行时，而非普通浏览器或单纯 Node。打包时附带定制版 Chromium 与 Node；应用以独立桌面程序分发。

**双引擎。** Chromium 负责渲染与 Web 平台；Node.js 负责文件系统、进程与 npm 生态。二者经 Electron API 汇合，形成“Web UI + 本地能力”的产品形态。

**进程模型。**
- **主进程**：应用入口，管理窗口、菜单、系统级能力，可使用完整 Node API。
- **渲染进程**：承载界面；现代实践关闭 `nodeIntegration`，不在页面中直接暴露 Node。
- **预加载（preload）**：经 `contextBridge` 向页面暴露白名单 API，内部用 IPC 请求主进程。

**IPC。** 主进程与渲染进程隔离，通过 `ipcMain`/`ipcRenderer`（`on`/`send` 或 `handle`/`invoke`）协作。通道应视为受校验的公共接口；加载不可信内容时尤其要沙箱化。

**权衡。** 收益是跨平台与 Web 人才复用；成本是体积、内存基线与安全配置责任。与 Tauri、原生工具链等按体积、语言栈、系统 API 深度对照选型。

## 要点与易错点

- 心智模型优先记：**双引擎 + 主/预加载/渲染** 三边界，再学具体 API。
- 易错：渲染进程开启 `nodeIntegration` 并加载不可信页面，等于把宿主机能力交给网页脚本。
- 推荐默认：沙箱、关闭 Node 集成、开启 contextIsolation、窄 preload。
- 延伸：官方 Process Model、Security、Context Isolation 文档；用最小“建窗 + invoke”示例验证。
