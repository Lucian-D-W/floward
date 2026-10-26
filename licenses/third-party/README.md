# 第三方许可原文补充

此目录保存已锁定组件发行包遗漏的许可条款及来源。它补充上游声明，不将第三方组件改为项目自身的 GPL-3.0-only。

原文在 raw/；sources.json 按包名与精确版本映射到原文，并记录文件 SHA-256、上游位置和需说明的事实。生成器只在本地包没有许可文件时使用这些补充，不联网猜测新版本适用的条款。升级后若出现未覆盖的空声明，生成失败，不覆盖现有汇总。

.gitattributes 将许可原文固定为 LF，防止 Windows 检出时的自动换行转换破坏校验值；汇总仅规范显示换行和行尾空格，不改动保留的原文文件。

- tauri-plugin-wallpaper 的锁定提交只有 MIT 声明，没有独立 LICENSE 或版权行；补充文件使用 SPDX 标准 MIT 正文，去掉未填写的版权占位行。作者字段 Meslzy 按作者身份记录，没有编造版权年份或版权人。
- react-remove-scroll-bar 2.3.8 的 npm 发行包声明 MIT，但未带 LICENSE；其 npm gitHead 当前无法在上游解析。保留上游明确补加 LICENSE 的提交原文，不把它冒称为该 npm gitHead 的文件。
- selectors 使用源文件明确指向的 MPL-2.0 标准正文；UNIC 同时保留源文件中的真实版权行和上游 MIT / Apache 双许可原文。
- wallpaper 的原文名为 unlicense，已一并保留，并修正生成器识别规则。

运行 npm run notices 生成根目录 THIRD_PARTY_NOTICES.md，运行 npm run notices:check 核对；npm run test:notices 验证缺失条款、文件损坏和只检查模式的处理。
