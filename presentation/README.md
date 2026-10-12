# Kimi 演示材料

**PPT 成品的制作和修改全部交给 Kimi。其他 AI 只维护提示词、真实截图及素材说明，不生成、打印、重排或修改 PPT／幻灯片 PDF／HTML，也不新增演示生成器。** 这是用户当前约定，替代旧的仓库内自动生成流程。

## 使用

1. **已有 Kimi 成品**：把旧 PPT 与新增两张 `official-monitoring-*.png` 上传 Kimi，粘贴 [`中文增量修改`](kimi-update-zh-CN.md) 或 [`English revision`](kimi-update-en.md)。保留六页和原视觉风格，仅调整官方监测／定时／News卡片相关内容；若Kimi找不到旧成品先补上传。
2. **首次制作**：上传下面五张截图，选择完整 [`中文 prompt`](kimi-prompt-zh-CN.md) 或 [`English prompt`](kimi-prompt-en.md)。同一六页产品导览涵盖八维、架构、地图／区域／语言、AI与最新来源，两份事实和边界一致；截图保留真实原语言。
3. Kimi 返回可编辑 PPTX 和 PDF 后，由用户下载到 `artifacts/presentation/kimi-final/`（本地成品，不提交）。其他 AI只说明存放／上传方法；修改成品仍回交 Kimi。代码 ZIP 用 `uv run python scripts/package_delivery.py --snapshot` 单独打包，不制作PPT、不自动夹带旧演示或Kimi成品；用户将代码 ZIP 与选定成品手动上传Drive，自动上传与分享权限需另行授权。

## 相对旧方案的功能与范围变化

新增两个预置官方索引的发布链接检测（Savills Central London月报、Crown Estate新闻）、有轮数／期限／HTTP授权约束的macOS launchd定时、News只读状态／链接卡片及非AI的办公CRE关键词显示粗筛。Refresh status只GET档案，网页不控制定时或触发来源请求。Windows／Linux原生定时不支持，新卡片和源标题仍用英文原词。

旧稿“没有后台定时监测”需改为“有界macOS原生定时能力”。已有60秒／两轮OS触发证据，第二轮无新链接，任务已移除；素材stopped不能改成running。这不是永久监控、完整实时新闻流、AI消息核验或自动发布。新索引版次不等于发布日期／实际统计窗口，未知不补造；原11条核心地图观察及2024／2025-YE口径不变；最新另获明确授权接纳12条2026来源事实（4条UK宏观、8条Savills August办公），总研究132条／21份来源／105条短证据。相关板块增加Latest verified update组；这是显式接纳，不是监测链接自动发布，September报告版次与August实际窗口分开。没有最新更新组截图时仅用文字，不能伪造界面。

代码包不携带monitor运行档案、ui-config、计划或budget receipt，不复制原作者授权；新使用者初次News状态应是not_configured，需要操作者另行配置与取得授权。源码范围与合同以根README及 `docs/contracts.md` 为准。

## 可上传素材与出处

以下是已检查不含凭据的本项目真实界面图，不是完整第三方报告或报告图表。文件可直接上传；Kimi 无法通过本机路径自行读取它们。

| 文件 | 可解释的功能 | 出处与限制 |
|---|---|---|
| [`materials/map-zh-Hans.png`](materials/map-zh-Hans.png) | 简体中文入口、八维导航、City 选择、指标／时期、真实3D建筑背景 | 来自冻结交付副本 `20261011T202809039642Z-snapshot` 的独立 `--no-agent` 本地捕获；没有提交问题，不是本次模型或完整地图 E2E 验收 |
| [`materials/ai-answer-historical.png`](materials/ai-answer-historical.png) | 顶部问答入口、Historical market、Python 事实／比较与 AI 定性解读 | `artifacts/discovery/20261011-source-first/live-market-1/real-market-ui.png` 的历史真实运行截图；英文界面，不代表当前三语界面或新一轮实测 |
| [`materials/source-discovery-historical.png`](materials/source-discovery-historical.png) | Discover sources、AI 来源筛选、候选线索与未核验提示 | 同批 `live-source-1/real-source-ui.png` 的历史真实运行截图；metadata only，不证明原文／日期／地理覆盖已核验，也不是实时行情 |
| [`materials/official-monitoring-desktop.png`](materials/official-monitoring-desktop.png) | News入口、Official source monitoring、stopped、2/2、Refresh status、官方索引 | 从 `artifacts/monitoring/20261012-ui/news-current-desktop.png` 原字节复制；已有真实本机只读UI／档案捕获，不是本次新完整地图／模型验收或永久运行 |
| [`materials/official-monitoring-mobile.png`](materials/official-monitoring-mobile.png) | 390px手机查看News与监测状态 | 同批 `news-current-mobile.png` 原字节复制；移动显示能力，不是手机后台定时；新增标签与源标题保持英文 |

底图归属保留 OpenFreeMap、OpenMapTiles、OpenStreetMap；区域为手绘选择范围，建筑仅作空间背景，不是土地权属／楼栋行情。截图不能代替运行证据。可裁剪或添加对应语言的解释性标注，但不能改写实际结果、隐藏历史／未核验提示或制造不存在的 UI。

更新素材时只做用户授权的截图整理；需要真实模型／搜索的新图必须先有账户、预算及执行授权，不从旧图片或 fixture 冒充新实测。项目功能以根 README 和 `docs/contracts.md` 为准；数量、界面和截图可能过期，更新 prompt 时明确依据，不推断新能力。

## 已移除与历史档案

原英文／中文 PPT 生成器、HTML／PDF 打印器、兼容脚本及生成器测试不再使用，专用依赖一并移除。Presentation 现在只拥有这份说明、Kimi 提示词与经审阅的截图；不依赖 Market／SDK 来生成演示。

此前已交付的冻结 ZIP／PPT 和有日期的验证材料保留作历史档案，不覆盖、不作为当前产品介绍版。新的代码快照不带这些旧产物，也不把历史 GREEN 当作本轮离线、真实地图或实时模型验收。
