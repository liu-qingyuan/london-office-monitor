# 执行验证记录

**工程样机，当前性能基线尚未获性能或用户产品验收。** 以下先列当前已知失败，再保留此前版本的历史 GREEN 和首版 SDK 记录；不能把它们当作最新实现通过。独立审查 Closure 仍未完成。数据为 Savills 2024 / 2025 年末历史快照，不是最新/实时行情。

来源：[Issue #1](https://github.com/liu-qingyuan/london-office-monitor/issues/1)、[性能 Spec #2](https://github.com/liu-qingyuan/london-office-monitor/issues/2)、`docs/spec.md`、`docs/contracts.md`。历史首版审查 fixed point 为 `d1cf15b`，不是当前 WIP 的固定基线；记录日期 2026-10-10 Asia/Shanghai，执行文件使用 UTC。

## 集成详情与地图性能（当前：未验收）

相关实现和测试已按用户授权保存为 main 代码基线 `52d205ad700a6940dfee015a21c2795a27d8d29c`；初始化约定与状态文档另行提交。基线带已知 RED，目的是让后续修复可重复定位，不把提交当作性能通过。当前保持三个 Tickets，不新建分支或 worktree，不自动启动 Ralph。

- 当前代码包含真实布局占位的左侧集成详情、独立选择颜色，以及拆分底图 Polygon／MultiPolygon 足迹的原生建筑渲染。橙黄色只表示选择，建筑不代表逐栋市场指标；最新版本尚无全量复验或用户视觉接受。
- 最近完整浏览器运行为 **26 项：24 通过、2 超时，约 5.9 分钟**；该运行早于最新原生建筑替换，原记录为 `artifacts/left-detail/e2e.log`，不能绑定为最新版本通过。
- 最新原生建筑版本的聚焦回归仍有两个失败，见 `artifacts/left-detail/camera-navigation-native-parts.log`：相机约 49.2 秒，在 Reset map 后等回初始 pose 时超时；板块约 39.5 秒，在历史 event-card 数量检查时超时。记录的是症状，不是已证明的根因或修复。
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
