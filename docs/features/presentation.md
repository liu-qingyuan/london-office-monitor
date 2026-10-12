---
{
  "paths": [
    "presentation/**",
    "scripts/package_delivery.py",
    "tests/test_delivery.py"
  ],
  "fingerprint": "sha256:8947cf499f8a37bdcddb3eb11053a637a956508800c4189b525e7d1e0b132a85"
}
---

# Kimi 演示素材与代码交付

## 当前行为

用户已将全部 PPT 制作和修改交给 Kimi；其他 AI 只维护 prompt、真实截图和出处／功能边界说明。`presentation/` 仅保存 README、中英完整六页产品导览prompt与旧Kimi成品的中英增量修改prompt，以及五张经检查的真实界面图；素材涉及八维、架构、地图／区域／语言、AI、主动来源发现与官方监测。新增两图是2026-10-12既有News桌面／手机截图原字节副本，保留stopped／2轮及未知日期；增量prompt明确两个官方索引、有界macOS定时、只读状态／非AI显示粗筛，另说明已授权接纳的12条2026事实与Latest verified update组（研究132条／21来源／105证据）；地图仍2024／2025-YE，不把索引自动发布或补齐新地图口径。成品由用户从 Kimi 下载到忽略的 `artifacts/presentation/kimi-final/`，后续修改仍由 Kimi 完成。当前流程与版本范围见 `presentation/README.md`，常驻权限约定在根 `AGENTS.md`。新代码ZIP不含monitor档案、计划、ui-config或预算授权，首次监测状态为not_configured，截图中已有配置／stopped不能冒充收件人运行状态。

旧英文／中文 PPTX／HTML 生成器、PDF 打印器、兼容脚本、生成器测试及 python-pptx 专用依赖已移除。应用、Market、HTTP／MCP 与地图不依赖演示材料，相关 Interface 未变。

`scripts/package_delivery.py` 默认和 `--snapshot` 均只打包当前公开代码、明确允许的静态输入和 Kimi 素材，不调用生成器、浏览器、模型或搜索。成品 PPT／幻灯片 PDF／HTML 与旧验收附件不进入新 ZIP，也不自动收录 Kimi 成品。按 UTC 时间保留独立版本及启动说明／文件哈希；拒绝源码与输出目录链接，发现打包期间公开源文件变化就停止。`tests/test_delivery.py` 通过真实 CLI 和专用临时仓库验证无 PPT 依赖的打包、素材白名单、敏感文件排除、哈希、并发编辑与失败保留；不用合成 fixture 冒充产品证据。

## 限制与剩余

材料图片有明确历史／冻结代码出处，不能代表最新界面、完整地图 E2E 或新一轮模型实测；来源发现图只是未核验 metadata，不是正式实时行情。更新图／prompt 时核对功能与日期，真实搜索／模型需要另行授权。截图不是报告图表，保留空间底图归属；不复制原报告或受限附件。

此前已交付的冻结 ZIP／PPT 及有日期的执行证据保留为历史档案，不覆盖、不追认当前产品。新代码 ZIP 的三类状态为未重新验证；打包和材料检查不替代离线业务、真实地图 E2E 或实时模型验收。没有 Kimi API 自动化、自动上传或自动共享；用户分别交付代码 ZIP 与选定成品，不提供托管应用。
