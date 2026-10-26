# 顺水意流 / floward · 已确认图标

`floward-icon-master.png` 是用户于 2026-10-26 明确确认的蓝色水流、无文字、圆角方形图标原稿，保留生成结果的完整像素。它是 PNG 位图，没有伪装为 SVG 的矢量源文件。

运行 `npm run icons`，由项目已安装的 Tauri CLI 从该原稿导出 `src-tauri/icons/` 中的 PNG、ICO 等格式。应用窗口、托盘和 NSIS 安装器引用该目录；页面 favicon 与 README 也引用对应 PNG。

旧图标的真正 SVG 原稿原样保存在 `legacy/app-icon.svg`，仅作历史保留，不再是当前图标入口。应用实际支持范围仍以 Windows 实现和验证为准，生成器附带的其他平台尺寸不代表这些平台已获产品支持。

对外名称为「顺水意流 / floward」。兼容性标识保留：应用 ID `local.floward.v2`、数据目录 `.floward/floward-v2.db`、前端内部包名 `floward-v2`、Rust 包名与可执行文件 `floward`、本机固定入口 `release/current/naozha.exe`。Windows 安装器产品名使用 `floward`，与既有 `Floward` 路径仅大小写不同。
