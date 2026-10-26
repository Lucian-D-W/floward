# 开发与构建

当前桌面目标为 Windows 11 x64。开发环境需要 Node.js 22.12 或更新版本、Rust MSVC 工具链、Visual Studio C++ Build Tools 与 WebView2；环境安装见 [Tauri 官方说明](https://v2.tauri.app/start/prerequisites/#windows)。

1. 在包含 `package.json` 的项目根目录安装锁定依赖：

   ```powershell
   npm ci
   ```

2. 启动桌面开发模式：

   ```powershell
   npm run tauri -- dev
   ```

3. 构建 Windows 程序与 NSIS 安装包：

   ```powershell
   npm run tauri -- build
   ```

   安装包输出到 `src-tauri/target/release/bundle/nsis/`。

`npm run dev` 提供浏览器界面调试；原生桌面挂载、托盘、文件对话框应使用 Tauri 桌面模式。

业务数据保存在 `%USERPROFILE%\.floward\floward-v2.db`。修改界面、录制素材或重建程序时保留已有数据；完整备份包含历史与设置，JSON 导出用于内容交换。

本机固定入口的发布由 `scripts/publish-current.ps1` 处理，它调用 `scripts/unify-entry.py` 统一程序副本与快捷方式。普通构建不会自动更新所有用户入口。
