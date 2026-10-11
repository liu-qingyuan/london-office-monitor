# 执行验证记录

## 自动执行跨平台 CI（2026-10-11，用户后续授权）

用户明确要求自动运行上述 CI，本轮允许为此整合必要的公开源码／测试／项目记录并提交推送 `main`；此前“不提交推送／不触发 CI”是上一阶段边界，不再阻止这次测试。公开仓库使用标准 GitHub runner，不新增付费服务、模型／Google 额度、托管应用或分享权限。暂存采用明确的44文件公开清单，排除 `.pi/`、凭据、`var/`、`artifacts/` 和报告原件；保留个人未跟踪配置，不读取其内容。来源发现与 Presentation 的已有实现／fixtures 作为完整测试快照一同保留，不另行改造。

- 推送前复核：54项 Python＋TypeScript、wall2.65秒；三个 Feature staged 指纹一致、`git diff --cached --check` 通过，高置信凭据特征扫描无命中（不声称能识别所有秘密格式）。
- 入口：[Portable runtime](https://github.com/liu-qingyuan/london-office-monitor/actions/workflows/portability.yml)，push 自动触发；macOS／Ubuntu／原生 Windows × Python3.12／3.13 共六组。运行 ID／逐组结果待实际执行后写入，不用配置存在或本机 GREEN 冒充远程结果。
- 测试不读取用户 key、不登录个人 SDK、不调用真实 Google／模型；固定 runtime 仅 `--version`，应用服务器 `--no-agent`，SerpAPI 与 SDK 交互为明确 fixture，7项 UI smoke 不代替完整真实地图性能或实时模型验收。此前独立 Focused Closure 仍未完成，CI 不自动替代它。

## 跨平台运行与后端凭据接入（2026-10-11，新验证）

- 用户明确授权将软件适配 macOS／Linux／原生 Windows 并补测试。本轮复用既有发现／Market／Codex Adapter，不增依赖、搜索／模型额度、正式指标或发布权限，不提交推送／触发 CI，不恢复暂缓的地图性能任务。起始 HEAD 与已有 WIP 的公开源码快照保存在 `var/runs/cross-platform/baseline/`；只审查本次增量，不接管其他未提交内容。局部跨进程调用变化的8张当前／目标 Mermaid 图与取舍见 [ADR 0003](adr/0003-portable-discovery-backend.md)。
- **实现**：取消启动时 Unix-only 导入；receipt 在 POSIX／Windows 分别使用真实平台文件锁，保持授权、计数、单请求尝试、互斥和原子替换；JSON 使用 UTF-8。CLI／父后端可用 `SERPAPI_API_KEY`，只在 macOS 复用既有专用 Keychain。网页发现的实际 key 留在父后端，MCP 使用请求级认证 loopback JSON 桥接；SDK／MCP key 环境仍为空，不暴露 key 读取操作或修改预算／topic／context 的能力。网络使用标准／显式代理或直连，取消固定7897。原 npm 检查改由 Node 执行，共用平台 venv 路径，不需要 Bash；原10／30／60秒与退出余量保留。
- **离线业务与启动**：`cd frontend && npm run check:quick` 本机实际 **54项 Python＋TypeScript 通过，wall2.11秒**。包括真实 HTTP／CLI／MCP 子进程、真实本地桥接配合 fixture SerpAPI／SDK、4个独立 Python 进程竞争同一剩余额度、错误 scope／无效 capability／重复请求、key／短期 capability 不进入应用配置证据与业务输出、完成及 SDK thread 启动失败后的监听清理。真实固定 Codex CLI `--version` 启动，仅验证0.162.0可执行，不认证、不读个人配置、不调用模型。额外配置回归 guard 捕获并阻止三个浏览器测试文件的旧 Unix-only Python 启动路径；这个静态检查不是 native Windows 证明。Windows byte-lock／缺 Unix 模块、macOS Keychain 返回值属于明确的模拟／fixture，不是读取真实 key 或原生 Windows 结果。
- **真实 UI／地图融合**：本机专用 production Python 8018＋项目 Chromium，无 Agent／搜索调用。`check:focused -- tests/market.spec.ts tests/discovery.spec.ts -g 'real API provides|real City values|question suggestions|offline Agent errors|reading the real candidate pool|only explicit discovery'` **6项通过、wall13.88秒**，AI 筛选 DTO 为 fixture，真实候选池仅只读。`OFFICE_USER_RENDERER=1 ... tests/left-detail.spec.ts -g 'buildings and labels' --workers 1` 修复3处遗留像素解码启动路径后，**真实 Metal 地图1项通过、wall14.66秒**，保留真实建筑／标签、选中与恢复、genuine missing；1600热态聚焦1项 **wall12.45秒**、1600冷启动聚焦1项 **wall10.54秒**通过，原 crop／amber 像素谓词、100ms／1000ms及2s／10s断言不变。浏览器 User-Agent 的 Windows 字样来自 Playwright 的设备预设，实际 host／renderer 为 Mac／Apple M5 Pro Metal，不作 native Windows 证据。synthetic Python conflict 的平台 Python 路径 **1项通过、wall9.31秒**，明确合成快照、未写入正式数据。不是一次完整35项地图回归，也不是跨硬件／性能阶段重新验收；旧 SwiftShader RED 保留。
- **原生平台矩阵**：新增 `.github/workflows/portability.yml`，macOS／Ubuntu／Windows × Python3.12／3.13，锁定安装、原生业务／HTTP／MCP／预算竞争、无认证 runtime 版本、build 和7项 UI smoke（其中1项 synthetic）。工作流尚未提交运行，Windows／Linux 产品状态为 **待实际执行**。本机没有可用的 Docker server，因此未在本机运行 Linux 容器；没有用模拟或 Mac 的 GREEN 冒充 native Linux／Windows 验收。
- **实时模型／SerpAPI**：本轮 **0次真实搜索／模型调用**，没有读取实际钥匙串内容、复制个人 Codex 配置、重开 receipt 或索取／写入 key。已有 Free Plan／价格／余额核验只是历史记录，不作未来额度保证；本次不消耗它。
- **RED 与证据**：`var/runs/cross-platform/tests/` 保存缺 fcntl 启动、Windows锁、非 Mac 缺 key、固定代理、网页后端桥接缺失与无 Bash 检查的 RED→GREEN，以及当前命令日志。首次无 Bash fixture 错把 npm 的基本 shell 也移除，已单独保留并修正，不当作产品 RED；修正后实际复现 `bash: command not found`。首次新 `.mjs` 引入的 TS7016 已补对应声明并重验。浏览器原始报告／trace 在 `artifacts/checks/20261011T145729387Z-43997/`、`20261011T145941789Z-44331/`、`20261011T150038017Z-44492/`。这些本次材料不包含真实凭据。阻断遗漏的配置 guard RED→GREEN 及修复后执行在 `tests/16-all-browser-launchers-red.log`、`17-all-browser-launchers-green.log`、`18-fixed-roof-path.log`、`19-fixed-hot-path.log`、`20-fixed-cold-path.log`；最新真实地图材料分别在 `artifacts/checks/20261011T153701625Z-51475/`、`20261011T153716389Z-51567/`、`20261011T153728945Z-51664/`。
- **Review／收口边界**：以起始公开 WIP 快照作 fixed point，本次22文件增量范围与记录在 `var/runs/cross-platform/review/`。Standards 独立初审 accepted、无阻断；Spec 独立初审唯一 High 为地图测试残留3处 Unix 路径、方向 wrong。主流程已用同一平台入口作最小修复并保留断言、覆盖和预算，通过上述 RED→GREEN／真实定向执行。两个原 reviewer 的 resume 均返回 Agent not found；达到四次 review 调用上限，不另启替代 reviewer，**独立 Focused Closure 未完成，clean 未执行**，不称双轴最终验收通过。Feature fingerprint 仅表明文档与当前源码一致，不是这个缺失 Closure 的替代。

## 显式来源发现增量（2026-10-11，新验证）

- 用户授权小步实施，先资料与 AI 工具、空间精度后置；不走新 Spec／Tickets／Ralph。复用 CodexAdapter／认证与现有 Agent 面板，增加独立候选库存／发现 profile；不改正式 snapshot／GeoJSON、不引入数据库或自动发布。原市场六工具与 Web Search disabled 保留，发现 thread 不用于普通会话。
- **离线业务**：RED→GREEN 覆盖只读 HTTP 库存、完整 URL／出现存储、预算耗尽前阻断凭据／网络、key echo 不保留、隔离 SDK profile、引用绑定、启动失败保留以及跨域／extra fields 拒绝。原 `check:quick` 初次通过35项＋类型、wall1秒；首轮完整入口通过38项；收尾修复后最新通过 **42项 Python＋类型／production build**（含同期 Presentation 测试），快速入口wall2秒、完整入口wall58秒，没有模型调用。
- **真实地图融合／端到端**：`OFFICE_USER_RENDERER=1 npm run check:full` 首次 **35/35 浏览器检查通过、命令wall57秒**，证据 `artifacts/checks/20261011T130726-22898/`；收尾补丁后再经原完整入口35/35通过、wall58秒，日志 `artifacts/discovery/20261011-source-first/closure-guards/full-final.log`；Apple M5 Pro／ANGLE Metal、正常动画，既有真实背景、拾取／颜色、冷热态、缺失／错误与 UI scope 保留。包含真实候选库存读取与合成 AI 筛选 DTO 区分，不把后者当实时模型。SwiftShader整套本轮未重做，历史RED／未执行及用户暂缓决定保留。
- **真实双通路／模型 UI**：`live-source-1` 实际约29秒、HTTP200，单个发现轮真实调用 `google_search_sources` 和 native Web Search；Google backend metadata完成，原生SDK可见1个搜索项、2条query、30次URL出现，底层HTTP次数未知。短ref绑定thread／turn／工具item，模型选中三条机构入口可精确关联本轮工具metadata；不是模型编造URL。真实地图背景上的截图已检查。证据：`artifacts/discovery/20261011-source-first/live-source-1/{input,http-response,execution}.json` 与 `real-source-ui.png`；typed journal在 `var/runs/discovery/native-ac4c183067d842a899eb2d84c901b133/`。
- **普通市场模型验证**：`live-market-1` 实际约16秒、HTTP200，真实 `compare_periods` 得到 City prime achieved rent 98.6→105.26 £/sq ft、Python变化6.75%，没有发现工具进入普通会话。输入／HTTP响应／执行及截图在同目录 `live-market-1/`；不是fixture／replay，也不宣称更多SDK／语义案例全覆盖。
- **采集结果与限制**：六题真实Google批量metadata采集约54.22秒，196次URL出现／145个不同字符串，涵盖八个检索意图但含偏题、旧资料与URL变体。应用双通路后完整库存为 **187个URL字符串／247次出现**，AI筛选的Savills／CBRE／Carter Jonas仅为未核验资料入口，不是已获准全文、真实最新指标或验证后的统计覆盖。搜索不把选中City写成地理覆盖，也没有任意地点定位／楼级行情。完整Google响应、输入与失败阶段在 `var/discovery/evidence/`；未保存原始account body／邮箱或key。
- **收尾只读审查／修复**：独立审查复现三个问题：URL编码key可写入rawJSON、证据目录创建失败时活动发现会话未清理、空原生结果被标成metadata已收集。四个新增离线公开Seam回归得到3个FAIL＋1个ERROR后修复：先解析并检查JSON／URL编码key再保存；证据setup纳入清理边界、返回安全evidence_unavailable并保存not_executed记录；零候选run／topic分别表示completed_no_candidates／metadata_unavailable，完成搜索不冒充抓到了来源。42项快速／完整及35项硬件浏览器通过。原RED和GREEN记录在 `closure-guards/`。独立审查只读、无外部调用；本批真实双通路／市场轮发生在补丁前，补丁后未绕过Google／market子额度追加live，本记录不把离线结果冒充最新网络执行。
- **预算／失败保留**：共享receipt现为 **Google8/8、Codex2/3**（native1＋market1），没有自动重试、续约或付费fallback；保留一轮native，不自行耗尽。Google现场新搜索需另行获准预算。前两次浏览器入口检查因尚未实现控件而在总截止中断，诊断保留实际输入并显示浏览器启动约221ms、等待缺失控件；随后显式可见性断言取得两项真实RED，再实现后6秒聚焦GREEN，未放宽总timeout或删除地图。证据 `artifacts/checks/20261011T123009-7483/`、`20261011T123204-9279/`、`20261011T123345-9655/`、`20261011T123728-12367/` 及 `artifacts/discovery/20261011-source-first/browser-diagnostic/focused-launch.log`。历史独立 Closure、用户最终业务／视觉验收不由本增量自动关闭。


## Presentation 目录收拢（2026-10-11，新验证）

- 本轮任务是提交前收拢演示实现并同步 feature 记录。评测要求为可运行 Python Agent PoC＋面向业务团队的 3–6 页 slides；保留五页英文内容、版式、依赖、参数和产物路径。生成／打印实现归入 `presentation/`，原 `scripts/` 命令为兼容入口；ZIP 打包职责保持原样。没有改动应用、地图、业务数据、模型权限或其他搜索 WIP。
- 局部 Mermaid Gate：不需要图。仅将既有 Presentation Implementation 归位，公开 CLI、Market Interface、依赖方向、生成／打印顺序及状态语义均保持不变，没有引入新 Seam 或通用渲染框架。
- TDD：首先运行新增的入口／五页一致性测试，因 `presentation/build_slides.py` 尚不存在得到真实 RED；迁移后三个聚焦测试通过，覆盖实际新旧 CLI、五页内容／讲稿、明确标注的截图与状态 fixture、错误输入不产生交付文件。
- **离线业务检查**：`cd frontend && npm run check:quick` 实际通过 **38 项 Python 测试＋TypeScript 检查**，输出 `quick wall: 2s`、退出 0，日志在 `artifacts/presentation-consolidation-20261011/quick-check.log`。fixture 中的 Verified 标签仅用于测试展示输入，不是产品／模型验收。
- **演示生成／打印**：真实执行原命令和新命令，专用 Chromium 打印；PPTX、HTML、PDF 均五页。baseline／modified／rollback 独立副本的 HTML hash、PPTX 文本／讲稿、PDF 文本及五张 slide PNG hash 全部一致；五页打印截图已逐页检查。原始 SHA-256、完整命令／输入／stdout／stderr／退出状态、差异和可执行回滚保存在 `artifacts/presentation-consolidation-20261011/`。回滚只在另一副本测试，工作区保留迁移后的实现；既有经审阅 PPT／PDF／截图没有被本轮测试覆盖。
- **真实地图融合／端到端**：本轮未新执行。**实时模型实测**：本轮未调用。演示打印、fixture、类型检查和历史 GPU 记录均不替代这些验收；本轮没有重生成最终提交 ZIP 或更改分享权限。
- 对应当前事实与受管路径见 `docs/features/presentation.md`，操作导航见 `presentation/README.md`。数值解释文案的进一步参数化及跨项目工具提取留待提交后的独立改进。

**工程样机；用户已认可当前性能结果，本阶段收口，剩余优化暂缓。** 阶段认可不意味着 SwiftShader 完整回归、新模型实测、全部产品验收或 Issue #1 原独立 Closure 通过。以下保留各轮原执行结果和失败；历史状态／60秒目标以本节最新决定为准。数据为 Savills 2024 / 2025 年末快照，不是实时行情。

来源：[Issue #1](https://github.com/liu-qingyuan/london-office-monitor/issues/1)、[性能 Spec #2](https://github.com/liu-qingyuan/london-office-monitor/issues/2)、`docs/spec.md`、`docs/contracts.md`。历史首版审查 fixed point 为 `d1cf15b`，不是当前 WIP 的固定基线；记录日期 2026-10-10 Asia/Shanghai，执行文件使用 UTC。

## 当前决定：取消60秒硬门槛，剩余工作暂缓

- 用户确认 `0177481` 的现有实现足够，本性能阶段不再继续优化；完整无模型回归不设60秒或其他替代硬上限。既有用户体验及快速／聚焦目标不变，权威要求见 `docs/specs/map-performance.md`／Spec #2。
- #3／#4 已关闭。#5 保持 open、`ready-for-human`，明确标记暂缓；软件完整闭环、窄屏信息卡遮挡关闭入口、关闭／复位后的 overflow 断言补强仅保留记录，用户重新授权前不自动实施、拆票或恢复 Ralph。
- 已测试 GPU 的33项完整 GREEN 仍有效；SwiftShader 原截止失败和13项未执行仍未获完整验证，不改写报告或以放宽 timeout 伪造原目标通过。当前检查命令保留原实现，`check:full` 仍有原截止，本阶段不要求继续用软件整套证明60秒。
- 本次只修改决定／入口文档和 GitHub 状态，离线业务、真实地图融合／E2E、实时模型均未新执行。原测试、trace、截图、profile、逐次样本不改动；原 #1 的审查和模型／交付待办不由阶段认可自动关闭。

## Ticket #5 Ralph 执行记录（历史：硬件绿色增量；软件闭环未完成）

本轮 fixed point `185ed43a4592b4a1dc8887da4cd67cc94cfead0b`。只修改既有测试组织、npm 命令和验证文档，不改生产 Module／Interface／状态机；本票局部 Mermaid Gate 为“不需要图”。环境为 Mac17,9 / Apple M5 Pro / 64GiB / 18 logical CPUs、Node 25.9.0、Python 3.12.13、项目 Playwright 1.64 / Chromium 156.0.8078.4；生产 bundle `index-DekzR4Sk.js`，DPR 1，正常动画，1600×1000／390×844。所有服务器独立绑定 8018、`--no-agent`；数据仍为 Savills 两期真实历史摘录，背景为 OpenFreeMap。

### 已交付的完整增量

- `frontend/package.json` 复用 unittest／tsc／Vite／Playwright，增加 `check:quick`、`check:focused -- <file> [-g ...]`、`check:full`。计时从 npm 命令启动至退出，包括本轮 build、服务器／浏览器、失败截图／trace 和 JSON／HTML 报告；整数 `SECONDS` 留退出余量，Playwright 全局截止扣除此前构建时间，超限返回非零。依赖／浏览器安装不计时。普通编辑只用最短相关层，完整层用于阶段收尾。
- `check:focused`／`check:full` 每次建立唯一 `artifacts/checks/<UTC>-<PID>/`，不覆盖首失败。所有 tests（包括 CI）关闭自动重试；原 `test:e2e` 保留。两个 worker 的每个测试仍有独立 context，不共享 page／storage；三次独立性能验收显式使用 `OFFICE_PERFORMANCE_REPEAT=1 --workers 1`。完整层默认逐场景一次，**不是取消三次性能验收**。
- 必要覆盖只去重，不取消真实地图：首次 GPU 点击、详情占位／尺寸／重复选择、切换 West End 与关闭保留相机合到尺寸流程；真实 3D／比例尺／空间来源合到冷启动；窄屏全景／复位合到触屏布局；City 区内屋顶、范围外不误染、切走恢复、Canary Wharf 标签与 missing 合为一条真实地图选择流程。每条仍从新的真实页面／Python HTTP 开始。九导航板块改为打开工作区后直接切换，关／开、键盘和触屏仍有独立覆盖。像素判据与 crop 不变，PNG 用既有 Pillow 在应用 GPU 进程外解码。
- 加入明确标注的临时 synthetic conflict：由 Python Market 在临时快照产生 null／conflict，通过 UI 验证不是 missing、API error 或零值；不装入正式数据、不替代正常融合。原历史 Agent replay、准确工具输入／输出、回答范围、独立 Agent 胶囊和无 Agent 错误仍保留；这些不是模型实测。

| 最新命令／模式 | 命令 wall time | 结果 |
|---|---:|---|
| `npm run check:quick` | **1.21s** | 27 Python＋类型检查通过 |
| SwiftShader，选区／真实屋顶／恢复／missing 聚焦，单 worker | **25.01s** | 1 项通过；含 build／服务器／浏览器 |
| SwiftShader，九板块真实切换聚焦，单 worker | **13.65s** | 1 项通过；含 build／服务器／浏览器 |
| `OFFICE_USER_RENDERER=1 npm run check:full`，2 worker／Metal | **53.66s** | 27 Python＋类型／build＋**33/33 E2E 通过**，无重试、无跳过、真实地图在此计时内 |
| `npm run check:full`，2 worker／SwiftShader | **57.66s** | 全局 deadline，**16 pass、4 明确跳过用户性能专用项、13 未执行**；退出 1，不是整套 GREEN |

最新完整 Metal 命令保留九导航、真实 Market HTTP、图表／来源、missing／synthetic conflict／Not connected、API error、正常／失败底图、WebGL 不可用、窄屏、真实 GPU 拾取与投影、颜色／恢复、原生拖拽／旋转／相机复位、历史 replay。命令内用户热态反馈上界最多 68ms、完整呈现最多 573.6ms；冷启动业务最多 428.3ms、可探索背景最多 4528.2ms；pending 故障在导航 **14981.9ms** 呈现明确降级，继续真实数据与 GPU 选择。故障注入的 10 秒背景失败不因降级变成正常通过。

### 单 worker 的固定输入三次用户验收

各命令仍包含 build／启动／证据；桌面／窄屏热态命令分别 **20.80／18.16s**，冷启动分别 **18.19／15.20s**。热态目标视图预热且样本的 vector requests 全为空；冷启动三次各用新 context、HTTP cache disabled，不宣称 OS／CDN／GPU 冷缓存。Metal renderer、DPR 1、正常动画不变。反馈用可信输入 timestamp／Chromium Event Timing；完成帧上界以实际 compositor 截图返回时间保守计量，真实屋顶像素／相机响应验证几何与呈现，不以 handler／ready flag／单次 rAF 代替。

| 视窗／输入 | 反馈上界 ms（三次） | 完整呈现上界 ms（三次） |
|---|---|---|
| 1600×1000／导航 | 36, 36, 36 | 456.9, 162.1, 152.6 |
| 1600×1000／列表 | 36, 44, 36 | 516.5, 523.6, 514.4 |
| 1600×1000／GPU 地图 | 36, 36, 36 | 565.3, 569.8, 570.1 |
| 390×844／触屏导航 | 60, 60, 36 | 152.8, 141, 73.4 |
| 390×844／触屏列表 | 52, 44, 52 | 496.7, 490.8, 498.3 |
| 390×844／GPU tap | 52, 52, 52 | 519.7, 513.8, 504.5 |

| 视窗 | 业务呈现上界 ms（三次） | 首次背景呈现上界 ms（三次） | 可探索呈现上界 ms（三次） |
|---|---|---|---|
| 1600×1000 | 371.7, 400.1, 408.1 | 3785.2, 3794.1, 4088.7 | 4348.9, 4358.8, 4663.4 |
| 390×844 | 360.3, 374.5, 381.5 | 2896.1, 2624.8, 2622.9 | 3398.8, 3120.6, 3123.2 |

### 保留的失败与停止边界

- 初始完整用户命令 **58.77s** 截止只完成 14/40；2 worker 仍只有 21/40。减少重复采样后 32/37；3 worker 完成覆盖但 pending 有实际超限：状态在 14801.7ms 写入，之后 107ms／440ms long tasks，不能把状态写入当提示帧。保留首失败 trace，不以重跑覆盖它；最终硬件维持 2 worker。
- 定向 SwiftShader 九板块 profile `_resizeCanvas` self 累积 **9884.8ms**；这是连续开／关的采样，不是单次用户延迟。改为同一打开工作区内切换后，聚焦命令 **22.65→13.65s**。真实布局开／关覆盖仍由独立尺寸、键盘、触屏流程承担，没有关闭正常 3D、提高超时或提前降级。
- 软件并发 4 的探针一度 29 项完成／1 未执行，后续也暴露同尺寸 25 秒超时；3 worker 仍截止且有未执行场景，不能挑最快一遍转绿。已撤回更高并发，最终默认仍为 2 worker。最新软件冷启动功能样本业务 668.1／604.6ms、可探索 9575.9／6782.5ms；更早 4 worker 的业务 9921.7ms／可探索 12491.8ms 失败全部保留，**不满足用户性能验收，也不以软件 GREEN 冒充硬件**。
- 去重时新加入窄屏信息卡二次点击曾被卡片遮挡，原 trace 保留；关闭改用同一已聚焦按钮的真实 Enter，不用 force click 或生产状态 setter。窄屏信息卡遮住鼠标关闭入口记作 Low follow-up，未扩大为生产 UI 修复。
- 只清理确认 cwd 为本仓库 frontend、PPID 1 的历史 orphan Playwright worker 57304 及其专用浏览器 57305；不操作其他项目进程／浏览器。没有新依赖、业务 Interface、数据源、持久化、发布权限或模型调用。

本轮已到单上下文停止边界，提交的是硬件三层反馈与保留全部覆盖的完整绿色增量，**#5 不关闭，转回 `needs-triage`**。剩余建议：以这里的真实软件 2 worker 输入和最小 profile 为起点，重新确定软件渲染闭环可达路径；若需要改变生产渲染生命周期，则重新确认局部 Gate／范围，不继续在本票堆并发、harness 或放宽预算。本轮不新建 Ticket、不自动扩建 backlog。

原件：`artifacts/ticket-5/` 保存每条命令 log、原始 baseline／profile／探针和 `summary.json`；唯一 `artifacts/checks/20261010T204318-73958/` 是最后 Metal 完整报告，`20261010T204422-74316/` 是最后软件截止报告，三次样本报告见四条 `final-hot-user-*`／`final-cold-user-*` 日志中打印的目录。JSON 保留每次输入、环境、resource／navigation timing、真实网络 URL／缓存标志、全部样本、错误和 trace；源文件 SHA256 在本地 summary 绑定，不包含凭据。旧原件不被新报告覆盖。

**分别报告**：离线业务与类型通过；真实地图融合／E2E 的 Metal 完整层通过，SwiftShader 完整层仍 RED；实时模型 **未执行**。用户视觉／业务验收、Issue #1 原独立 Closure 仍未完成，本票双轴 review 也不能冒充它。

## Ticket #4 冷启动／降级（用户 GPU 场景通过，整套仍未验收）

固定点 `589d7cf`，生产 bundle `index-BPGZ-NYB.js`；环境为 Mac17,9 / Apple M5 Pro / 64GiB / 18 logical CPUs、Node 26.4、Python 3.12.13、项目 Chromium 156.0.8078.4 / Playwright 1.64、DPR 1、正常动画。使用本项目独立服务器 `--no-agent` 和专用浏览器；数据是 Savills 两期真实历史快照，背景是 OpenFreeMap / OpenMapTiles。没有新依赖、数据、HTTP／工具／认证合同或模型请求。

- **原始基线与 RED**：新 context、HTTP cache disabled，没有 page/storage 复用；不宣称 OS、CDN、网络路线或 GPU 进程冷缓存。桌面业务呈现 358.5 / 295.6 / 286.2ms，可探索背景 4249.3 / 4207.6 / 4331.7ms。窄屏修正可见业务滚动和原视口外取样点后分别为 344.5 / 367.3 / 387.8ms、2946.5 / 3086.2 / 2969.7ms。700ms bundle delay + 始终 pending 的 remote style 明确故障注入捕获导航第 15 秒仍 Loading 的有效 RED；切换 Vacancy 又捕获 Catalog 503 错误被清空的独立 RED。
- **定向 profile 与实现**：背景就绪等待真实建筑源及实际渲染几何；地图不因 Catalog／Market 失败停止读取真实空间背景。首次选择几何随后绑定，不新增测试 setter。MarketMap 内部以 navigationStart 计时，最晚 14.8 秒启动明确降级，给真实提示／selector 帧留 200ms；不是 10 秒前提前关闭 3D。首次 100ms 余量的修复仍失败，profile 显示 fallback 字体／shader 初始化约 78ms，状态虽在 14901.9ms 写入，首次绘制跨过截止。明确 vector/style 错误立即降级，glyph/sprite 不误判；无 WebGL 明确不可渲染、仍保留真实列表与来源。Workspace 先发本地请求，Catalog 错误与 Market 错误分别拥有，切换板块不清掉 Catalog 失败。公共 Interface、相机、历史口径与独立 Agent 不变。

用户 renderer 为 **ANGLE Metal / Apple M5 Pro**，每次新的 context 和禁用缓存，从同一个 navigationStart 计时。真实 Rents 点击／窄屏两触、滚动到真实值与两期图表后的 compositor 截图给业务呈现上界；真实背景截图后输入 Zoom、等待正常动画并捕获另一张 composed frame 给“可探索”上界。建筑屋顶 patch 像素和实际相机变化证明真实空间背景，不以响应、ready flag、单次 rAF 或静态图替代。保留全部三次，不用平均或最快值：

| 视窗 | 业务呈现上界 ms（三次） | 首次背景呈现上界 ms（三次） | 可探索呈现上界 ms（三次） |
|---|---|---|---|
| 1600×1000 | 396.9, 401.2, 409.6 | 3874.4, 4218.5, 4093.0 | 4410.5, 4751.7, 4633.2 |
| 390×844 | 371.7, 387.7, 400.8 | 2654.2, 2543.1, 2690.4 | 3107.3, 2993.5, 3143.6 |

- **异常与最短反馈**：`user-focused-final.log` 含两视窗各一次真实正常背景、pending／vector 失败及真实 GPU fallback 拾取，命令启动至退出 **29.75 秒**，全部通过，无自动重试。pending 截图提示截止 **14986.9ms**（相关合并运行另次 **14977.1ms**），背景的 10 秒失败仍保留为故障，不因降级变成正常通过。先前 GPU 拾取测试遗漏 Reset，导致把视口外 City 坐标当输入，已保留失败并使用真实 Reset／边界检查修正；未改生产拾取。`final-user-faults.log` 四项 **9.79 秒通过**：vector 明确失败（101.3ms 提示帧上界）、无 WebGL／真实列表与来源、Market 503／非 missing、Catalog 503／导航后仍错误且实际背景继续。`user-geometry-regression.log` **22.21 秒通过**，保护同尺寸不重新分配画布、布局变化后的真实 GPU 拾取、建筑内区黄色／外区不误染／切走恢复。
- **SwiftShader 单独记录**：初次桌面诊断业务 **6182.9 / 6141.0ms**，可探索 **9489.8 / 10177.9ms**，30 秒截止前仅执行两次；原失败与 CPU profile 保留（`_resizeCanvas` self 约 2.1 秒）。软件不是用户 GPU，**没有满足用户 2／10 秒预算**。软件功能回归每种视窗一次真实背景、相机／屋顶／业务帧，聚焦记录 `meetsUserColdBudgets:false`；后续同一软件进程已有故障场景后的相关运行，两次业务为 547.5 / 521.8ms、可探索为 8863.4 / 6088.3ms，记录 true，但不能覆盖原始失败或充当三次用户验收。用户模式保持两视窗各三次和严格 2／10 秒断言。`swiftshader-functional-focused.log` 正常窄屏＋第三方背景失败／真实选择 **15.83 秒通过**；相关完整软件文件 `swiftshader-related-complete.log` **32.27 秒，6 pass、6 明确跳过**（四个用户三次重复、两个用户呈现时延案例），不是整仓库 GREEN。软件正常／故障功能覆盖保留，跳过项由上述真实硬件运行验证。
- **完整运行限制**：最新硬件合并相关 13 项在 **60.30 秒**截止，5 pass、8 未执行；后续场景未返回完整结果，不能称 13 项通过。已用上面的独立命令完成相关覆盖，但不把分段结果冒充一次整套 GREEN；整仓库 60 秒反馈组织／已知硬件合并挂起仍属于 #5。本票未放宽门槛或运行自动重试。
- **离线业务与模型**：`final-quick.log` 为 **27 项 Python + 类型检查／production build，通过，1.44 秒**。实时模型 **未执行**；没有重放冒充新调用。用户视觉／业务验收、Issue #1 原独立 Closure 仍未完成。

原始证据保留于 `artifacts/ticket-4/`：全部 baseline／RED／首修复失败／最终逐次 JSON、完整网络 URL 与响应缓存标志、navigation/resource timing、真实输入截图、CPU profile、原始 trace、命令 wall time。`final-cold-user-*.json` 对应上表；fixture 的 £157.51 typo、无 WebGL 测试误选报告 context quote、TypeScript overload 错误也保留，明确不当作产品失败。八张局部 Mermaid 图与最终知识归属／时序／状态一致，200ms 呈现余量只是 Map Implementation，未增加 Interface。

## Ticket #3 热态修复（逐场景通过，整体仍未验收）

验证基于 `7a3729b` 之后的本票改动，记录目录 `artifacts/ticket-3/`；不把下方历史基线当作本次结果。环境：Darwin arm64 / Mac17,9、Apple M5 Pro、64GiB、18 logical CPUs；项目 Playwright 1.64 / Chromium 156.0.8078.4、DPR 1、真实 OpenFreeMap、Savills 两期历史快照、正常动画。Desktop Chrome 的 UA 是测试设备预设，不代表主机是 Windows。生产 bundle `index-CRpY5R40.js`，无新依赖／数据／HTTP／工具／认证／模型调用。

- 先捕获原相机场景 **48.92 秒**及同尺寸选择 **33.53 秒／25 秒 test timeout**；真实输入、失败截图／trace、CPU 原件均保留。定向采样中 MapLibre vertex/index `bufferData` 累积约 **5.74 秒**，空间筛选约 **68ms**，不是单次输入时延。移除重复 resize 不能独自解决；MSAA 单变量 probe 改善了软件渲染。随后真实切换（不是重复同一已选区）揭示 data-driven paint expression 会 relayout，才改为固定 feature-state。
- 最终地图 Module 唯一拥有按实际尺寸／DPR 去重的同步与正常 **350ms**聚焦／复位；输入确认先呈现，随后按原点击世界坐标进行真实 GPU pick。真实 Polygon parts 保留来源足迹／高度，使用内部数字 part IDs 与 feature-state 改色，不把合并 MultiPolygon 或 part ID 当物业。选择不重传几何；可见源几何变化在 idle 生命周期处理。原生瓦片缓存有 128 上界，窄屏系数 5→8 的依据是保留过的 City 瓦片淘汰／non-hot 样本。Workspace 消费原相机回调，不在普通展示中调用重型 debug。
- `acceptance-desktop.log`／`acceptance-mobile.log`：生产、专用 headed Chromium **ANGLE Metal / Apple M5 Pro**；真实导航打开、从 Midtown / Fringe 切回 City 的列表及地图输入各三次。两个布局与 City 目标已预热，测量中所有目标 vector requests 均为空；先前 non-hot 样本未丢弃。下面保留全部测量，不用平均值或重试：

| 视窗／输入 | 三次反馈上界 ms | 三次完整呈现上界 ms |
|---|---|---|
| 1600×1000／导航 | 36, 36, 36 | 185.9, 343.4, 181.1 |
| 1600×1000／列表 | 44, 36, 36 | 519.7, 511.5, 510.3 |
| 1600×1000／GPU 地图 | 36, 36, 36 | 574.5, 570.1, 575.5 |
| 390×844／触屏导航 | 60, 52, 52 | 161.9, 91.5, 140.9 |
| 390×844／触屏列表 | 52, 52, 52 | 500.1, 496.4, 498.0 |
| 390×844／GPU 地图 tap | 60, 52, 44 | 516.1, 516.4, 494.7 |

时钟从可信浏览器激活事件的 timestamp 起；反馈用 Chromium Event Timing（包含 queueing／下一呈现帧，量化加 4ms 上界），完整结果截止于实际 compositor 截图返回后的浏览器时间，包含尺寸／正常动画／截图开销。照片验证真实屋顶颜色、标签／选区及详情，不以 DOM、rAF 或 moving flag 代替完成帧。截图像素用既有 Python/Pillow 在测试进程外解码，避免在应用浏览器反复创建 2D/GPU 画布污染后续输入。命令启动至退出分别 **18.86／17.95 秒**；实际 Tools／回答范围仍与地图独立，两个场景 chat requests 均为 0。

- 离线业务：**27 项通过 + TypeScript**，`final-quick-check.log` 命令共 **0.97 秒**；production build 通过，原大 bundle warning 保留。
- 软件渲染专用回归：`final-swiftshader-focused.log` 为 **22.31 秒**，含 build、服务器／浏览器启动、profile／证据；真实同尺寸选择三次均无画布尺寸重写，关闭／重新打开后 GPU 拾取通过。`baseline-cpu-profile.json` 和 `final-cpu-profile.json` 保留原样，预热条件不同，不用 profile 差值冒充用户时延。
- 真实地图融合／功能覆盖：最新 SwiftShader 整套在 **150.34 秒** suite deadline 截止（**22 pass、2 显式跳过硬件专用场景、5 未执行**）；剩余 5 项原导航／离线 Agent UI 另次 **21.49 秒全部通过**。已执行覆盖包含真实内区建筑橙黄、南部范围外不误染、选择切走原区恢复、missing 不画零柱、真实布局／投影／GPU 拾取、四区聚焦、筛选不重置、原生手势／相机复位、键盘／触屏、九入口／原来源／重放。这是分段覆盖，**不是一次完整 GREEN，也没有满足 60 秒整体预算**。
- 硬件完整运行的 **28/29、96.19 秒**与 **28/29、104 秒**失败仍保留（分别发现首次反馈超限，以及 non-hot tile／窄屏预置高度竞态）；最后一次硬件全量在命令 175 秒截止只打印 8 pass，未完成。只清理核验过 cwd／专用浏览器路径的本项目 orphan 进程；这些记录不被专用 GREEN 覆盖。整套组织、超预算／挂起反馈属于 #5，冷启动／15 秒降级属于 #4，本票不宣称已交付它们。
- 实时模型：**未执行**；历史 Run 重放／离线错误不是新模型实测。用户视觉／业务验收与 Issue #1 原独立 Closure 保持未完成。本票八图仍完整，目标架构／时序已在 #3 正文细化为原生输入确认与 GPU pick，公共 Interface 与知识归属不扩大。

## 集成详情与地图性能（修复前 main 基线，未验收）

相关实现和测试已按用户授权保存为 main 代码基线 `52d205ad700a6940dfee015a21c2795a27d8d29c`；初始化约定与状态文档另行提交。基线带已知 RED，目的是让后续修复可重复定位，不把提交当作性能通过。当前保持三个 Tickets，不新建分支或 worktree，不自动启动 Ralph。

- 该基线包含真实布局占位的左侧集成详情、独立选择颜色，以及拆分底图 Polygon／MultiPolygon 足迹的原生建筑渲染。橙黄色只表示选择，建筑不代表逐栋市场指标；最新版本尚无全量复验或用户视觉接受。
- 最近完整浏览器运行为 **26 项：24 通过、2 超时，约 5.9 分钟**；该运行早于最新原生建筑替换，原记录为 `artifacts/left-detail/e2e.log`，不能绑定为最新版本通过。
- 该基线原生建筑版本的聚焦回归有两个失败，见 `artifacts/left-detail/camera-navigation-native-parts.log`：相机约 49.2 秒，在 Reset map 后等回初始 pose 时超时；板块约 39.5 秒，在历史 event-card 数量检查时超时。记录的是症状，不是已证明的根因或修复。
- 已有 TypeScript／production build 成功记录 `artifacts/left-detail/build.log`，但它们不证明时延、真实建筑颜色或完整端到端达标。准备本次 main 基线提交时重新执行离线 Python 测试 **27 项通过（0.704 秒）**及 TypeScript 检查，日志为 `artifacts/specs/initialization-python-check.log`、`initialization-typecheck.log`；没有调用模型。
- `artifacts/left-detail/cpu-profile.json` 与 `cpu-profile-summary.json` 保存一次 SwiftShader 序列的采样：`_resizeCanvas` 累积 self time 约 16.7 秒，两个 `bufferData` 热点合计约 9 秒，建筑区域筛选约 0.09 秒。不是单次输入到可见结果的延迟，也不是硬件 GPU 验收；相关失败 traces／截图原件保留。
- 最新预算及测量口径以 `docs/specs/map-performance.md`／Spec #2 为准，完整无模型回归已收紧为 **60 秒**。三个 Tickets 保留：[#3](https://github.com/liu-qingyuan/london-office-monitor/issues/3)、[#4](https://github.com/liu-qingyuan/london-office-monitor/issues/4)、[#5](https://github.com/liu-qingyuan/london-office-monitor/issues/5)，#5 依赖前两条。预算尚未证明可达，不以改大超时、删覆盖、假地图或重试转绿验收。
- 本次更新初始化约定、角色说明、文档／预算和已知状态，并按用户授权在 main 保存相关既有 WIP 基线：离线业务 27 项与类型检查通过，真实地图融合／端到端未重跑，实时模型实测未执行。已知浏览器失败仍保留，不声明性能已修复；历史重放、设计图解析或文档检查不冒充产品验收。

捕获慢症状后先保留真实输入，建立最小复现与定向 profile，再继续修改；普通编辑跑最短必要验证，完整层用于阶段收尾。应用市场 Agent 仍为六工具只读；编码 Agent 的完整开发权限见根 `AGENTS.md`，两种角色不混用。

## visionOS 图标列与原栏展开（历史已通过版本，非当前 WIP）

用户提供 `test1.png`，明确否定圆球入口：默认是整列 icon，hover 原栏展开名称。前一版单一 orb 是助手误解；测试通过不能替代用户意图或视觉验收。[校正前八图 Gate](https://github.com/liu-qingyuan/london-office-monitor/issues/1#issuecomment-6096668251) 已发布。

- 读取了用户图和 Apple 官方 [collapsed](https://developer.apple.com/tutorials/images/com.apple.HIG/visionos-tab-bar-collapsed@2x.png) / [expanded](https://developer.apple.com/tutorials/images/com.apple.HIG/visionos-tab-bar-expanded@2x.png) 示意，以及 [WWDC23](https://developer.apple.com/videos/play/wwdc2023/10076/) 对注视展开/移开收回的原说明。网页用 hover/focus，不是眼动跟踪或原生 SwiftUI。Apple 建议轻量顶级导航不多于六项；此 PoC 保留九个已确认业务入口并分组，不宣称完全复刻原生平台。
- 位置/方向单独通过真实 production 复现：旧图标列 x=1328/1600，不是靠右；回归要求 x>1500 真实失败，保留于 `artifacts/right-expansion/direction-before.*` 与 `direction-red.log`。该次为纯 CSS 定位/排列修正，未改 Interface 或状态机，无需新增八图；当前门限同时保护图标贴右、右边界固定、名称出现在图标左侧与图标坐标稳定。
- 实际 RED：旧圆球方案的 `#workspace-nav` **Expected visible / Received hidden**，全部真实导航 icon 被隐藏。现在移除 orb、额外菜单与 pinned 状态；同一条玻璃栏始终可见，桌面 **64px → 248px** 展开文字。用户进一步要求图标贴页面右侧、文字向左展开；当前已改为 trailing 固定图标列，九个 icon 的 x/y 不变，不再给左列在右边预留一块空白。没有装饰性标题/标语；hover 不开数据、不改指标、不调用模型，移开收回。点击后已选内容保留，仍 hover 时文字保持、移开才收回。
- 键盘 focus 显示名称、Enter 选板块、Escape 收回/关闭，返回当前 icon 不立即误展开。小屏为同一组图标的水平可滚动栏，第一触显示名称、下一触明确选择。中途发现 Touch end 也产生 pointerleave，误收回名称；保留 `touch-before.*` 后只对 mouse leave 收窄，真实触屏回归通过。
- **27 Python tests、21 browser tests、TypeScript/Vite build 通过**，包含实际地图拾取/建筑/相机/底图失败、真实 Market HTTP、九板块既有数据/context 与未接入标记、keyboard/touch/短视窗、production blur，以及原 Run 数据/工具输入输出重放。不是 21 个模型测试。
- production **8017**：默认 **64×458px / 9 icons**，展开 `blur(30px) saturate(1.45)`、29px 圆角、`rgba(79,100,115,0.38)`，父 dock backdrop 为 none。已读取默认/展开/租金/移动图复核；Agent 保留原 blur 与独立数值图表/完整工具输出。**CSS 玻璃风，不是原生 Liquid Glass 或完整光学折射**。
- 最新产物 **`artifacts/right-expansion/`**：`default-map-production.png`、`hover-navigation-production.png`、单独的 `navigation-collapsed.png` / `navigation-expanded.png`、macro/rents/supply-section、mobile-rail/navigation/drawer、recorded-answer/tool-output production 截图。1600px 实际页面中默认栏 **x=1512、right=1576**（距右边24px），展开前后 icon 均 **x=1523/y=281**，名称右边界 **1513** 小于 icon 左边界 **1523**，证实向左展开且图标不动。`production-verification.json` 为 **model_requests_this_script=0、replayed_requests=1、errors=[]、passed=true**（执行 `2026-10-10T11:12:49.627Z`）。chat 在 SDK 前拦截；旧 Run 重放不是新的 live 模型验证。该目录保留方向 RED、完整21项E2E/build/Python日志与最后7项方向/材质聚焦回归；早期 column/touch failure保留在 `artifacts/icon-column/`。
- 本轮仅前端/测试/操作脚本/文档，**新增模型调用/依赖为 0**，没有新增数据图层、研究、发布、持久化或 HTTP 权限。已有 preview 未重启；没有刷新演示包、提交推送或分享。旧 orb 截图保留于 `artifacts/vision-sidebar/`，明确非当前界面/用户验收。视觉/业务验收和独立 Closure 仍待完成。

## 单一玻璃图标与板块导航（前次误解，已被用户否定）

助手将用户「只留 icon、悬浮展开」误解为单个圆球入口，做出以下方案；用户随后明确否定，以最新图标列校正为准。以下保留真实工程验证与边界，不表示该设计获认可。

依据当时「只留一个 icon、悬浮展开」的错误解释，先完成导航样式与板块，不扩大研究或数据能力。[实施前八图 Gate](https://github.com/liu-qingyuan/london-office-monitor/issues/1#issuecomment-6094179403) 已发布。已读取 visionOS 图、[iPhone Duo 参考文章](https://www.uisdc.com/raise-the-bar-with-iphone-duo)与其中的分组/溢出/面板示意，重新提取并读取中/英文测评的一页全文；外部图片仅参考，不进入源码或交付包。

- **实际 RED**：悬停旧入口后 `.inspector` **Expected hidden / Received visible**，即 hover 错误打开整块数据而不是导航。失败图/trace 保存在 `artifacts/vision-sidebar/hover-before.png` / `.zip`，原日志 `hover-red.log`。修复后 hover 仅展开名称，移出收回，入口位置不变；选择板块才打开独立内容，离开导航不关闭已选内容。
- 默认右侧一个 **58×58px** 圆形玻璃 Explore 图标，触屏为 54×54px；导航按市场指标/报告 context/地图分组，只有一个选中板块。支持 fine mouse、keyboard focus/Enter/Escape、触屏两步选择，短视窗菜单可滚动，不丢掉末尾入口。关闭返回入口焦点不会立即误展开菜单。
- 九入口为 **Submarkets / Rents / Vacancy & availability / Leasing activity / Supply pipeline / Macro economy / Demand drivers / News & events / Map layers**。租金/空置继续原 Python 数据；报告按原 `notes.kind` 展示，不推断成数值序列或当前地图选中区指标。可租赁率、take-up、供应量化序列、宏观、ESG/hybrid 和新兴新闻明确 **Not connected**；这是接入状态，非创建 missing observation、0 或假趋势。Layers 只复用原指标镜头，不冒充已实现新图层。
- **27 Python tests、21 browser tests、TypeScript/Vite build 通过**。21 项使用真实 Market HTTP、明确标记的原 Run 重放/离线 Agent fixture，并非 21 次模型实测。新增导航回归覆盖 hover 无副作用、实际报告 kinds/数值、keyboard dismissal、短视窗和原触屏流程；原地图真实拾取/相机、底图失效、Agent 数据图表/精确工具输入输出继续通过。
- 本项目 production 8017 截图与实际 CSS 检查：导航 **`blur(30px) saturate(1.45)`、29px 圆角、`rgba(79,100,115,0.47)`**，父 dock 不设 backdrop filter；Agent 保留原独立采样。已读取默认、hover、宏观/租金、mobile 导航/内容截图复核。是 CSS 液态玻璃风的 blur、半透明、高光与阴影，**不是原生 Apple Liquid Glass 或完整光学折射**。
- `scripts/capture_agent_ui.mjs` 最新输出在 **`artifacts/vision-sidebar/`**：默认、hover-navigation、macro/rents/supply-section、mobile-rail/navigation/drawer、recorded-answer/tool-output production PNG，`production-verification.json` 为 **model_requests_this_script=0、replayed_requests=1、errors=[]、passed=true**。所有 chat 在 SDK 前拦截，未知请求 abort；重放仍使用 Run `03856fc9-2409-43f4-a2df-97bb9c62e37d`，没有重新生成回答。
- 本轮 **新增模型调用/依赖为 0**，Python/快照/SDK 权限不改。已有 preview 进程保持运行，没有重启或清除其内存会话。截图脚本前后保存的 accepted local run count 均 **7**、最新 id 均 `ad5806d3-7ed9-419a-b637-015c29fa28d3`；这是当前本地记录数量，不推断调用总量、发起者或追加授权。旧九次助手尝试不是当前仍剩额度的证明。
- build/Python/E2E/production-capture logs 均在该目录；仍有大 bundle warning 与底图失效测试的预期 style-fallback warning。未刷新 PPT/PDF/ZIP、未提交推送或分享；**产品视觉/业务验收与独立 Closure 仍待完成**。

## 市场悬浮栏与可见 Agent 数据（前次迭代）

用户要求右侧按需展开，并指出 Agent 只有定性 prose/OK 标签、看不到数据和工具返回。范围与当前/目标八图先记录于 [本轮 Gate](https://github.com/liu-qingyuan/london-office-monitor/issues/1#issuecomment-6093713611)。

### 实际故障与修复

- 原始用户 Run **`03856fc9-2409-43f4-a2df-97bb9c62e37d`**：问题询问 City average prime achieved rent 的两期变化，context 是 Canary Wharf / Grade A / 2024-YE。模型实际调用 `compare_periods(city, prime_rent, 2024-YE, 2025-YE)`，Python 返回 £98.60 → £105.26/sq ft、+6.75%，机构公布 +6.8%。明确问题优先是原合同，不是 AI 把 Canary Wharf 误查成 City；原界面将地图选中范围和回答范围混在了一起。
- 浏览器 RED 实际得到：`£105.26 / sq ft` 的元素存在但 **hidden**；工具真实 trace 有 `output`，Adapter 却只返回 name/arguments/ok。现在按实际 facts/calculations 标出回答范围，保留提交时问题/选择，默认显示数值/单位/两期条形图/比较，并将 AI 解读独立呈现。
- Codex Adapter 对既有 `POST /api/chat` 的 `tool_calls` 增加 **实际业务 output**，保留成功/失败；不附 SDK 事件/config/账户/trace 路径。前端显示真实返回计数，展开精确 arguments、业务值摘要与完整 JSON。旧保存响应缺字段时明确不可用，不从 selected facts 伪造整次工具返回。数值 guard、六工具、MCP 权限和 Market 计算均未修改。
- 右侧 **Markets** 栏默认收起；fine mouse hover 预览、离开收起，点击固定；关闭/Escape、键盘确认及触屏点击打开/关闭经过实际浏览器验证。原始常开面板 RED 保存在 `artifacts/drawer-agent/rail-before.*`。地图不因面板状态重置。
- 展开 Agent 图层曾被父层 backdrop root 隔断采样，虽然 computed blur 正确，截图仍见锐利建筑。将实际玻璃表面放到胶囊与回答层，父容器不设 backdrop-filter；production 确认回答层 `blur(26px)` / 25px 圆角，祖先为 `none`，截图检查真实模糊。市场截图另等待真实 opacity=1，不把过渡动画中途帧当最终效果；早期截图保留为 `*-inflight.png`。

### 验证与边界

- **27 Python tests、17 browser tests、TypeScript/Vite build 通过**。新增两个 Python 回归校验实际 output 与原 Run 重放；新增四浏览器回归覆盖悬浮栏、原 Run 的可见数据/准确输入输出/显式地图聚焦、真实 Market 缺失 payload 无零柱及触屏开关。完整套件还包括既有地图实际拾取、建筑 extrusion、相机/筛选、底图失效、窄屏和离线 Agent 错误。
- **不是 17 个真实模型测试**：Market 用真实 Python HTTP；City Agent 用明确标记的原 Run 重放，经过真实 `grounded_answer` / `BusinessTools.call` 逐项核对。缺失 Agent 展示用真实 Market payload 加测试 prose，并明确是 offline fixture。
- `scripts/capture_agent_ui.mjs` 在本项目 production 地址捕获地图、hover、触屏和真实历史 Run 的重放界面；所有 `/api/chat` 均在送往 SDK 前拦截，非约定问题直接 abort。最新 `artifacts/drawer-agent/production-verification.json`：**model_requests_this_script=0、replayed_requests=1、errors=[]、passed=true**，真实 WebGL2/interleaved、可见建筑 feature 查询数 829（不是独立楼栋数）。
- 主要截图：`default-map-production.png`、`hover-market-production.png`、`recorded-answer-production.png`、`recorded-tool-output-production.png`、`mobile-rail-production.png`、`mobile-drawer-production.png`，均在 `artifacts/drawer-agent/`。`answer-before.*` 保留 hidden 数据故障；各 RED/GREEN、完整 build/E2E/Python logs 均在该目录。
- **本轮新增模型调用 0**，不自动重试；用户手测 Run 在原九次助手模型尝试之外，旧 `9/10` 是历史记录，不能当作当前仍剩一轮的授权。没有重跑 `live_ui.mjs` 双轮，仅做语法检查；重放不是新 SDK 实测，不证明未来所有定性语义正确。
- 为启用 Adapter 新字段，核验 PID 与 cwd 后仅优雅重启本项目 preview；当前 PID 见 `var/map-preview.pid`，日志 `var/map-preview-drawer.log`。旧进程的内存会话失效，刷新 UI 开新会话；旧 trace/turns/认证保留，未读复制凭据。
- 数据/Market/认证/SDK 权限不变，新依赖为 0；**未实施研究或自动发布、未提交推送、未刷新 PPT/PDF/ZIP、未上传分享**。仍有大 bundle warning与预期 style-fallback warning，不作性能/跨平台承诺。用户视觉/业务验收和原独立 Closure 仍待完成。

## 悬浮玻璃与 Agent 胶囊（前次展示迭代）

用户继续否定不透明白色侧栏，本轮仅改前端布局、样式和 Agent 展示状态：地图铺满视窗，右侧变为有边距/圆角/背景模糊的半透明深蓝灰玻璃浮窗；Agent 独立置于顶部居中单行胶囊，聚焦展开、主动提交、关闭/Escape 收起保留内容，市场详情不再互斥隐藏。该材质是 CSS 玻璃风，不是原生 Apple Liquid Glass 或光学折射实现。

- 公开 DOM、真实后端和 production 静态资源验证：**25 Python tests、13 browser E2E、TypeScript/Vite build 通过**。13 项含既有 10 项与新增玻璃覆盖布局、胶囊展开/关闭不自动请求、production blur 回归三项。真实地图鼠标点击与底图失效还各重复三次通过。
- 起始 RED：地图宽度仅 1218px/1600px 且白底固定侧栏；问题输入隐藏在侧栏。替换后地图实际满宽，面板有边距、25px 圆角、背景 `rgba(20,34,50,0.58)` 与真实 `blur(26px)`，上下文、单位及来源保留。
- 截图发现 production 背景纹理仍锐利。开发样式有 blur，但构建后的标准 `backdrop-filter` 被压缩掉，仅留 WebKit 属性；production 回归确实得到 `none`。将标准属性放在 vendor 属性之后，构建保留两者，真实浏览器计算值和截图均确认 blur 生效。单纯减小透明度不是这一 bug 的修复。
- 浮层布局变更曾让相机信息按钮挡在 West End 的默认拾取点；将非互动读数设为 pointer-transparent，相机控件回到底部，再以真实鼠标验证。画外导航留在市场浮窗之外。
- 最新 production 截图：`artifacts/glass-ui/desktop-collapsed.png`、`desktop-agent-expanded.png`、`mobile.png`；`production-verification.json` 记录零 pageerror、**零 `/api/chat` 请求**。`build.log`、`e2e.log`、`python-tests.log` 为本轮真实命令记录；`production-material-before-fix.json` 保留 CSS 失败诊断，`before-opaque-sidebar.png` 为原界面。
- SDK/权限、Python/业务 JSON 未改，新依赖/模型调用均为 **0**。旧 live model 记录不作此胶囊的模型验证；只静态检查 `scripts/live_ui.mjs`。已有本地服务继续提供重建后的资源。
- 用户视觉/业务验收仍待确认；独立 Closure、旧候选 PPT/ZIP 状态不变，未提交推送、未分享上传。

## 地图重做验证（前次迭代）

仅改既有地图/界面及其操作脚本，不改 Python、市场 JSON、SDK 权限或研究发布机制；新增依赖 **0**、新增模型调用 **0**。实施前当前/目标八张 Mermaid 图与范围见 [Issue #1 地图 Gate](https://github.com/liu-qingyuan/london-office-monitor/issues/1#issuecomment-6089904973)。

- `unittest`：**25 项通过**；TypeScript + Vite production build 通过，仍有大 bundle warning，非生产性能验收。
- 真实 Python + 项目独立 Chromium / SwiftShader：**10 项 E2E 通过**。验证实际建筑 extrusion/可见 feature、四区域镜头聚焦、原生拖拽/右键旋转、缩放/俯仰/俯视/复位、切换指标不重置镜头、真实悬停/点击、两期图表/单位/原文、缺失无零柱、底图失败、窄屏无横向溢出、Agent 按需触发及离线错误。
- 真实地图鼠标点击与底图失效各重复 **3 次通过**（共 6 用例），不是列表点击替代地图拾取。
- 最终 production `http://127.0.0.1:8017` 页面实际运行。`verification.json` 记录 WebGL2、共享 canvas、55°俯仰、四选择几何、可见建筑 feature 查询数 **2443**；这不是去重楼栋数/实测高度覆盖。无 pageerror，无 `/api/chat` 请求；Agent 入口仍启用。
- 起始 RED：旧版本不存在 3D 建筑层。实现中还捕获比例尺漏加、浮点精度/动画未结束断言及偶发 click 丢失；最终点击由 MapLibre 原生 click 交给 deck 公共 GPU `pickObject`，避免两套 canvas 手势路由竞争。等待真实相机停止后再计算测试坐标，不使用固定 sleep 或模型重试。前次失败 trace/screenshot 保留在 `artifacts/map-redesign/pointer-before-camera-settle.*`。
- 最新代码的模型调用**未重跑**。`scripts/live_ui.mjs` 仅适配 Agent 页签和地图缩放，已做 `node --check`；旧双轮结果不能当成新 UI 的模型实测。
- 建筑体量为 OpenFreeMap / OpenMapTiles 空间背景；没有楼栋市场值或实测几何保证。地图依赖外部服务，z14 以下按底图缩放层级显示足迹而非新增虚构高度。示意选择框不是官方统计边界。
- 视觉/业务验收待用户确认；**未更新 PPT/PDF/交付 ZIP、未提交推送、未上传 Drive**。旧候选产物不代表新地图。

本地证据：`artifacts/map-redesign/verification.json`、`build.log`、`e2e.log`、`pointer-repeat.log`、`python-tests.log`；截图 `london-overview-production.png`、`london-source-production.png`、`canary-wharf-gap.png`、`mobile.png`。测试日志保留正常大 bundle/style-fallback warnings。

## 首版验证结果（历史记录）

| 项目 | 实际输入/命令 | 结果与边界 |
|---|---|---|
| Python | `.venv/bin/python -m unittest discover -s tests -v` | **25 项通过**。真实 localhost HTTP 与 MCP stdio；金额/时期错绑、缺失/冲突/零基数、quoted value、工具参数、账户环境等公开 Seam 覆盖。合成输入只在临时目录/内存中，不是模型实测。 |
| Python 来源核验 | 两份报告的 `Market().verify_source(...)` | 2024 的 5 条、2025 的 7 条短摘录全部匹配，11 个源值与摘录解析一致。不是最新报告发现，也不自动证明全部元数据或定性叙述。 |
| 前端构建 | `cd frontend && npm run build` | TypeScript 与 Vite production build 通过。主 bundle 较大有 warning；无生产性能承诺。 |
| 离线地图 E2E | `cd frontend && npm run test:e2e` | **6 项通过**，真实 Python API、独立 Chromium/SwiftShader WebGL2、interleaved shared canvas、真实鼠标悬停/点击、时期/指标/详情/原文、缺失及底图失效；**不调用模型**。正常与失效地图两场景还连续重复三次通过。 |
| 独立项目重建 | 仅复制 tracked/staged 源码，新 .venv/node_modules：`uv sync --frozen --python 3.12`、tests、`npm ci`、build、`serve --no-agent` | 新环境依赖、production UI 与真实 HTTP 通过，City 为 105.26、Canary Wharf 为 null。副本/自建进程清理。**同主机与缓存，不是跨 OS/容器验收**；最新运行见 `clean-environment.json`。 |
| 官方 SDK 登录/模型 | `london-office status` / `models` | 独立 profile **authenticated:true, subscription**；配置的 `gpt-6.1-sol` 在可用模型列表。凭据只由 SDK 管理，未读取或复制认证文件；无 API key fallback。 |
| 真实 CLI/SDK | `scripts/live_smoke.py` 与定向真实 probe | City/West End prime +6.75%/+5.78%、机构 +6.1% 差异、两期原文及 City vacancy −0.9 个百分点均核验。**原三轮 CLI run 第三轮被 guard 拒绝，原记录保留，不能称整次脚本已通过**。 |
| 真实网页多轮 | `node scripts/live_ui.mjs` | **两轮实际 POST /api/chat 通过**，City overall vacancy −0.9 个百分点、Canary Wharf prime null/missing；真实 compare_periods/market_query，保持相同 SDK session_id，显示 run_id、解释、工具与证据。未 mock、未重试。 |
| 五页英文演示 | build_slides + dedicated Chromium print | PPTX/HTML/PDF 各恰好 **5 页**，PPTX 5 组 notes；共用 Market Interface 数值/计算，真实地图截图。五页打印截图检查，功能模型状态有实际证据后才标 Verified。 |

真实模型功能覆盖汇总为 `artifacts/live-verification.json`：**9/10 轮已用，5 个接受回答、4 个拒绝回答**。元数据查询不计模型生成；一次 SDK 交互可以有多次模型/工具请求，轮次不是 token/费用上限。当前停止模型调用，保留失败，不用全部通过的美化计数。

## 失败、定位与回归

1. **地图首次点击**：旧版在可拾取 local style 上再切 remote style，首次 West End 鼠标点击曾失败；改为先加载最终 style 再挂 deck。真实点击与底图失效各连续三轮通过，没有替换成列表点击。
2. **数值错绑 High**：旧 prose 白名单允许把年份 £2025 或其他区 £166.61 写为 City 租金。保留这些真实攻击文本及中英拼写金额/warnings 旁路，RED 后修复；模型文本只做定性解释，数字和其区域/指标/时期/单位/来源绑定由本轮 Python 对象展示。定性语义不是自动证明，需人工审阅。
3. **MCP 路由阻断**：首两次真实请求无业务工具，回答拒绝。只查本项目 SDK inventory，确认六工具 connected；stderr 明确 `code-mode host is disabled`。0.162.0 使用内部 host 路由 MCP，恢复 host 后**同一真实问题**实际执行 Python 工具并得到 City 105.26。模型 code_mode/js_repl/shell/browser 等仍禁用；不是另一模型运行时。配置回归覆盖 host 开启与模型执行能力禁用。
4. **缺失解释误拦截**：真实第三轮曾报 unsupported_number；另一次定向实测捕获确切文本“缺失…不代表租金为零”，被误当作零值声明。用原始输出重现，允许否定零值的缺失原则，仍拒绝“租金为零”的正面数值声明。聚焦回归与当前两轮真实 UI 通过。

固定配置依据 [0.162.0 官方 schema](https://github.com/openai/codex/blob/rust-v0.162.0/codex-rs/core/config.schema.json)。SDK 工具禁用表不来自个人配置；真实工具 inventory、路由失败和成功输出是本地证据。不是只根据 schema 声称权限链验证完毕。

## 工程审查与未关闭事项

Standards reviewer `9a2ceec0-5d18-4ed` 与 Spec reviewer `3cf80a80-fb79-498` 均方向 **accepted**，但发现数值错绑 High。主流程已补 RED/GREEN 回归并修复。冻结 changed-files 后只运行一次 Clean，删除旧 `_numbers` 与未用 imports，范围前后一致。

Focused Closure 并行 resume 原 reviewers 均返回 **Agent not found（已清理）**。本轮四次 review 调用预算已用完；没有替代 reviewer/第三轮全量 review，因此独立 Closure **未完成**。后续实时诊断修复由公开测试与实际调用验证，但不伪称 reviewer 重新确认。Issue #1 保留打开供人类复核，不自动启动 Ralph/批量 backlog。

未声称：跨机器/跨平台完整验收、最新市场/实时新闻、精确报告 GIS、建筑级指标或实测高度覆盖、全自动报告入库、模型所有语义无误、其他运行时已实现。首版未验证 3D；本轮地图空间背景验证单列于上方。

## 证据与交付边界

- `artifacts/source-verification.json`：官方 URL、执行时间/hash、12 摘录匹配。
- `artifacts/right-expansion/e2e.log`：完整二十一个浏览器回归（真实 Market HTTP、离线 Agent/原 Run 重放）。通用 `artifacts/playwright-results/results.json` / `report/` 为最近一次七项方向/材质聚焦运行，不能把它当作21项完整报告；`london-map.png` 为实际地图，首版截图不作新界面验收。
- `artifacts/clean-environment.json`：新环境命令/exit code/真实 HTTP/零模型调用；`.log` 是本地完整输出，不默认打包。
- `artifacts/live-smoke.json`：保留原三轮脚本的两次成功和最后拒绝；`live-ui.json`：当前真实双轮网页；`live-verification.json`：功能覆盖与失败计数汇总。
- `artifacts/model-debug/`、`var/runs/`：原始诊断/工具/拒绝输出，仅本地，不进入默认包；不是 fixture 冒充模型。
- `artifacts/presentation/`：五页产物与展示状态 JSON。状态声明不能自证通过，截图也不替代实际模型工具证据。

无认证文件、个人 Codex/Pi 配置、测评原附件或完整第三方报告进入源码/默认包。Google Drive 接收者/分享权限仍待确认，未上传。公开包由评审方配置自己的账户运行，不提供公网托管 Agent。
