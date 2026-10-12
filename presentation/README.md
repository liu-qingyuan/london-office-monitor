# Kimi 演示材料

**PPT 成品的制作和修改全部交给 Kimi。其他 AI 只维护提示词、真实截图及素材说明，不生成、打印、重排或修改 PPT／幻灯片 PDF／HTML，也不新增演示生成器。** 这是用户当前约定，替代旧的仓库内自动生成流程。

## 使用

1. **已有 Kimi 成品**：把旧PPT与`product-floating-desktop.png`、`research-charts-desktop.png`、`research-charts-mobile.png`、`research-share-desktop.png`四张新版图上传Kimi，粘贴 [`中文增量修改`](kimi-update-zh-CN.md) 或 [`English revision`](kimi-update-en.md)。另上传`intake-form-mobile.png`说明新入口；合成接纳演示图仅可附测试标注作流程说明。保留六页及原演示风格，重点增加网页有限授权／原材料本批接纳，并保留已正确的浮层、图表、监测与最新事实说明；若Kimi找不到旧成品先补上传。
2. **首次制作**：从下面列表选用主视觉、图表与原材料表单；历史AI／发现／监测图按需附带，合成接纳图须显著标注测试。选择完整 [`中文 prompt`](kimi-prompt-zh-CN.md) 或 [`English prompt`](kimi-prompt-en.md)。同一六页产品导览涵盖八维、架构、地图／区域／语言、AI与最新来源，两份事实和边界一致；截图保留真实原语言。
3. Kimi 返回可编辑 PPTX 和 PDF 后，由用户下载到 `artifacts/presentation/kimi-final/`（本地成品，不提交）。其他 AI只说明存放／上传方法；修改成品仍回交 Kimi。代码 ZIP 用 `uv run python scripts/package_delivery.py --snapshot` 单独打包，不制作PPT、不自动夹带旧演示或Kimi成品；用户将代码 ZIP 与选定成品手动上传Drive，自动上传与分享权限需另行授权。

## 本轮新增：网页有限授权与原材料本批接纳

Discover sources可在网页明确设置Google次数、订阅caller轮次、有效分钟并授权搜索，状态／余额／期限只读，无需手改JSON或重启；仍需自己的账户和SerpAPI，次数不是内部HTTP／token／费用硬上限。旧grant不清零／自动续约，普通问答和研究入库不因此获授权。

Research intake支持自己的PDF／HTML／TXT＋scalar候选字段／短引文，先暂存，再单独批准不可变内容版本的本批；eligible才进入独立accepted overlay，模糊／冲突留理由判断，缺原文／预测冒充actual／不支持项不能人工越过。整批原bytes≤5MB，上传不等于在线机构认证或AI自动提取。动态重读原Market研究，不覆盖原JSON／YE地图／几何；研究变化后旧模型会话需重新明确提问。原材料／授权／overlay不提交或随ZIP分发。

新增原材料表单手机图为真实本机接口页面；桌面接纳演示虽为真实HTTP／存储／浏览器链，内容与110 GBP/sq ft是明确合成测试，不能作为市场观察或“新增第133条”事实。保留Synthetic字样、加合成演示注释。完整浏览器最新记录72通过／9失败／1跳过，未冒称完整GREEN；本轮仅离线业务／打包检查，不运行搜索／模型或扩大修复。

## 相对旧方案的功能与范围变化

新增两个预置官方索引的发布链接检测（Savills Central London月报、Crown Estate新闻）、有轮数／期限／HTTP授权约束的macOS launchd定时、News只读状态／链接卡片及非AI的办公CRE关键词显示粗筛。Refresh status只GET档案，网页不控制定时或触发来源请求。Windows／Linux原生定时不支持，新卡片和源标题仍用英文原词。

旧稿“没有后台定时监测”需改为“有界macOS原生定时能力”。已有60秒／两轮OS触发证据，第二轮无新链接，任务已移除；素材stopped不能改成running。这不是永久监控、完整实时新闻流、AI消息核验或自动发布。新索引版次不等于发布日期／实际统计窗口，未知不补造；原11条核心地图观察及2024／2025-YE口径不变；最新另获明确授权接纳12条2026来源事实（4条UK宏观、8条Savills August办公），总研究132条／21份来源／105条短证据。相关板块增加Latest verified update组；这是显式接纳，不是监测链接自动发布，September报告版次与August实际窗口分开。没有最新更新组截图时仅用文字，不能伪造界面。

代码包不携带monitor运行档案、ui-config、计划或budget receipt，不复制原作者授权；新使用者初次News状态应是not_configured，需要操作者另行配置与取得授权。源码范围与合同以根README及 `docs/contracts.md` 为准。

## 本次快速补充：新版图表与界面

更新桌面／手机条形图和桌面份额圆环原字节副本，新增本机产品主视觉。界面现在是全屏地图上的圆角半透明磨砂浮层，打开板块不挤窄地图，手机为底部浮层；图表和原事实／来源卡片并存，研究2026与地图2024–2025分开标记。这是呈现／交互更新，不增加行情、地理覆盖或模型能力。本轮同步更新中英增量prompt，不制作或修改PPT。

三张图来自 `artifacts/checks/20261012T011113905Z-30387/test-results/dashboard-visual-*/`，主视觉来自 `artifacts/ui/20261012-dashboard/product-floating-desktop.png`；相关测试使用真实Market HTTP，本机主视觉为实际产品捕获。依据Feature记载该轮局部6项通过，不作为完整地图、原生GPU拾取或实时模型验收；本轮未重跑这些检查。上次图已在旧ZIP／原artifacts保留。图片无凭据，保留来源／窗口／底图署名；不把未填圆环轨道转成新分类值。

## 可上传素材与出处

以下是已检查不含凭据的本项目真实界面图，不是完整第三方报告或报告图表。文件可直接上传；Kimi 无法通过本机路径自行读取它们。

| 文件 | 可解释的功能 | 出处与限制 |
|---|---|---|
| [`materials/map-zh-Hans.png`](materials/map-zh-Hans.png) | 简体中文入口、八维导航、City 选择、指标／时期、真实3D建筑背景 | 来自冻结交付副本 `20261011T202809039642Z-snapshot` 的独立 `--no-agent` 本地捕获；没有提交问题，不是本次模型或完整地图 E2E 验收 |
| [`materials/ai-answer-historical.png`](materials/ai-answer-historical.png) | 顶部问答入口、Historical market、Python 事实／比较与 AI 定性解读 | `artifacts/discovery/20261011-source-first/live-market-1/real-market-ui.png` 的历史真实运行截图；英文界面，不代表当前三语界面或新一轮实测 |
| [`materials/source-discovery-historical.png`](materials/source-discovery-historical.png) | Discover sources、AI 来源筛选、候选线索与未核验提示 | 同批 `live-source-1/real-source-ui.png` 的历史真实运行截图；metadata only，不证明原文／日期／地理覆盖已核验，也不是实时行情 |
| [`materials/official-monitoring-desktop.png`](materials/official-monitoring-desktop.png) | News入口、Official source monitoring、stopped、2/2、Refresh status、官方索引 | 从 `artifacts/monitoring/20261012-ui/news-current-desktop.png` 原字节复制；已有真实本机只读UI／档案捕获，不是本次新完整地图／模型验收或永久运行 |
| [`materials/official-monitoring-mobile.png`](materials/official-monitoring-mobile.png) | 390px手机查看News与监测状态 | 同批 `news-current-mobile.png` 原字节复制；移动显示能力，不是手机后台定时；新增标签与源标题保持英文 |
| [`materials/product-floating-desktop.png`](materials/product-floating-desktop.png) | 全屏地图、桌面磨砂浮层与不挤窄地图的实际布局 | 20261012-dashboard/product-floating-desktop.png原字节复制；本机产品主视觉，不是完整地图性能验收 |
| [`materials/research-charts-desktop.png`](materials/research-charts-desktop.png) | City／West End月度take-up条形图、浮层及来源窗口 | 20261012T011113905Z-30387的glass-charts-1600.png原字节复制；真实API页面，不作为本轮新验收 |
| [`materials/research-charts-mobile.png`](materials/research-charts-mobile.png) | 390px底部浮层与研究图表 | 同批glass-charts-390.png原字节复制；移动显示，不是手机后台调度 |
| [`materials/research-share-desktop.png`](materials/research-share-desktop.png) | 专业服务承租面积份额圆环、来源与分母 | 同批glass-ring-1600.png原字节复制；31%仍是已有研究事实，未填轨道不是新值 |
| [`materials/intake-form-mobile.png`](materials/intake-form-mobile.png) | 原材料上传表单与Research intake入口 | 20261012T173908381Z-25304/mobile-batch-admitted.png原字节复制；隔离目录／禁模型的实际接口页面，材料链是合成测试 |
| [`materials/intake-demo-synthetic-desktop.png`](materials/intake-demo-synthetic-desktop.png) | 暂存／单独批准后接纳状态，候选字段与原文 | 同批desktop-batch-admitted.png原字节复制；110与机构／材料为显式synthetic测试，只作操作流程，不能当真实行情；图中Loading不表示地图ready |

底图归属保留 OpenFreeMap、OpenMapTiles、OpenStreetMap；区域为手绘选择范围，建筑仅作空间背景，不是土地权属／楼栋行情。截图不能代替运行证据。可裁剪或添加对应语言的解释性标注，但不能改写实际结果、隐藏历史／未核验提示或制造不存在的 UI。

更新素材时只做用户授权的截图整理；需要真实模型／搜索的新图必须先有账户、预算及执行授权，不从旧图片或 fixture 冒充新实测。项目功能以根 README 和 `docs/contracts.md` 为准；数量、界面和截图可能过期，更新 prompt 时明确依据，不推断新能力。

## 已移除与历史档案

原英文／中文 PPT 生成器、HTML／PDF 打印器、兼容脚本及生成器测试不再使用，专用依赖一并移除。Presentation 现在只拥有这份说明、Kimi 提示词与经审阅的截图；不依赖 Market／SDK 来生成演示。

此前已交付的冻结 ZIP／PPT 和有日期的验证材料保留作历史档案，不覆盖、不作为当前产品介绍版。新的代码快照不带这些旧产物，也不把历史 GREEN 当作本轮离线、真实地图或实时模型验收。
