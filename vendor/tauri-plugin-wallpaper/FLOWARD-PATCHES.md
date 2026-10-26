# Floward local source patches

Upstream: https://github.com/meslzy/tauri-plugin-wallpaper at 867f97eedf64231df64c3f062f0fb6ceee6c9f4f, MIT. Original input.rs is retained. Windows now uses input_gate.rs via module path.

The application reports visible interaction rectangles. The mouse hook handles only those regions, yields cached desktop icon and label rectangles to Shell, assigns one owner per gesture, forwards correct wheel coordinates/modifier state, and requests keyboard focus only on an application mouse press. Keyboard events remain native; raw-input forwarding is not installed in parallel. The existing attachment and reattachment mechanisms remain upstream code.

Icon rectangle reads use the documented ListView messages on the desktop's SysListView32, with a separate bounded cache thread. This does not read user files or business databases. Actual native input and display behavior is recorded in docs/acceptance rather than inferred from this implementation.
# 2026-09-09 追加

- 只在应用区域按下时请求原生焦点，直接交给 WebView2 MoveFocus；绕开 Tao SetForegroundWindow 失败时的合成 Alt 回退。
- 显示器变化、休眠恢复与 Explorer 重建共用去重重挂载。按显示器名称重新取物理矩形；断开的屏幕隐藏并停止转发，重新连接后重建。
- 依据本地 Tauri 2.11.5/WebView2 0.38 源码及 Microsoft SetFocus 文档；实际未测试的热拔插/Win+D/IME边界继续明确记录。
