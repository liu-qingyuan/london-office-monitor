# London Office Monitor

可运行的伦敦写字楼市场监测 PoC：**Python 处理来源与口径、查询和计算；官方 Codex Python SDK 调用受限业务工具；deck.gl + MapLibre 提供交互地图。** 不依赖个人 Pi Agent 配置，不集成 LiteLLM，也不宣称能无缝切换运行时。

## 首版范围与诚实限制

- Savills **2024 / 2025 年末**报告中的 City / West End 平均 prime 成交租金、平均 Grade A 租金和整体空置率；11 条真实历史观察。
- Python 比较两期数值、区分租金百分比与空置率百分点、保留机构公布同比与计算差异、处理缺失/冲突并给出原文。
- **可探索伦敦 3D 地图**：地图铺满视窗，原生平移/缩放/旋转/俯仰、子市场悬停与聚焦、比例尺及总览复位。右侧是 **visionOS 风格玻璃图标列**：默认只显示九个导航 icon，同一栏 hover/focus 展开文字，移开收回；没有圆球入口或独立弹出菜单，点击才打开对应内容。板块为子市场、租金、空置与可租赁率、租赁、供应、宏观、需求、新闻、地图图层；只展示既有历史数据/报告 context，未接入的明确标注 **Not connected**，不是已实现全部指标。顶部 Agent 胶囊独立展开，默认显示 Python 数值/图表/计算与 AI 解读，可展开实际工具输入/输出。
- Canary Wharf 与 Midtown / Fringe 缺少**同口径**资料时保留缺失。四个地图范围均为手绘选择区域，**不是官方报告边界或建筑级统计**。
- 历史报告摘录**不是实时/最新市场覆盖**；没有实时新闻流、精确报告 GIS、实测建筑高度覆盖或后台自动发现新报告的声明。3D 建筑来自 OpenFreeMap / OpenMapTiles，只作空间背景，不代表逐栋租金/空置率；没有高度的建筑不由界面编造高度。
- 租金按原文 £/sq ft；计费周期未明示，不自行添加 per annum。Prime achieved、headline/top、Grade A 和不同空置群体不可互换。

## 实施入口与当前状态

**当前是未验收的性能基线，不是全部回归通过的版本。** 最新完整浏览器记录为 26 项、24 通过和 2 超时（约 5.9 分钟），发生在最新原生建筑渲染替换前；最新两项相机／导航聚焦回归仍失败，尚无最新全量或性能通过证明。此前 21 项浏览器 GREEN 只属于历史版本；本次准备 main 基线提交重跑的 27 项离线 Python 测试和类型检查通过，不证明端到端或性能达标。实时 SDK 历史记录不证明当前界面已实测，独立 review Closure 和用户产品验收仍未完成。具体已知失败、版本限制和原始证据以 [`docs/verification.md`](docs/verification.md) 为准。

相关实现／测试已保存为 main 代码基线 `52d205ad700a6940dfee015a21c2795a27d8d29c`，已知失败不因此变绿。当前使用 main，不新建分支或 worktree；代码提交不自动启动 Ralph。当前工作是先恢复既有地图性能，不扩展地区检索、研究或发布。权威要求见 [Spec #2](https://github.com/liu-qingyuan/london-office-monitor/issues/2)，正文镜像为 [`docs/specs/map-performance.md`](docs/specs/map-performance.md)：完整无模型回归上限已收紧为 **60 秒**，不是固定等待时间或已通过声明。保留 [#3 热态交互](https://github.com/liu-qingyuan/london-office-monitor/issues/3)、[#4 冷启动／降级](https://github.com/liu-qingyuan/london-office-monitor/issues/4)、[#5 验证反馈](https://github.com/liu-qingyuan/london-office-monitor/issues/5) 三票；#5 依赖 #3、#4。

编码 Agent 的完整开发工具权限与应用市场 Agent 的六工具只读权限分开，见 [`AGENTS.md`](AGENTS.md)。初始化先读当前 Ticket 正文／评论、同一份 [`GLOSSARY.md`](GLOSSARY.md)、[`docs/contracts.md`](docs/contracts.md) 和相关 [`docs/adr/`](docs/adr/)，明确当前任务范围与已知失败；不因“工具能做”顺手扩大任务。

| Module／职责 | 定位入口 | 关键限制 |
|---|---|---|
| 数据与来源 | `london_office/data.py`、`data/README.md` | 快照、摘录及引用校验；不自动发现或发布报告 |
| Market | `london_office/market.py` | Python 数值、口径、比较和 missing／conflict；HTTP 与工具共享同一业务表面 |
| HTTP Interface | `london_office/app.py`、`london_office/tools.py` | 既有业务 JSON 与六工具；不把 SDK 对象传给 UI |
| Workspace | `frontend/src/main.ts`、`frontend/src/types.ts` | 导航、详情及回答范围；消费 Python 事实，不重算市场指标 |
| 地图 | `frontend/src/map.ts` | 私有尺寸／空间／渲染生命周期；真实建筑仅为空间背景 |
| Codex Adapter | `london_office/runtime.py`、`london_office/settings.py`、`london_office/mcp_server.py` | 应用 Agent 的 SDK、认证、工具权限及回答校验；不读取个人配置 |

捕获慢症状后先建立最小真实复现并做定向 profile，再继续修复；普通编辑跑最短必要验证，不每次跑全套。当前检查入口见下文与 `frontend/package.json`／`frontend/playwright.config.ts`，不另造运行器。TypeScript 编译通过不等于 HTTP 合同、权限或可见帧时延已验证。

## 快速启动

需要 Python 3.12 或 3.13、Node.js 22.12+（本次实测 25.9.0）、npm。联网安装依赖；底图依赖免费的 OpenFreeMap，没有地图 key。`uv.lock` 和 `frontend/package-lock.json` 固定版本，SDK/runtime 为 `0.162.0`。

```bash
# 在仓库根目录
uv sync --frozen --python 3.12
cd frontend
npm ci
npm run build
cd ..
uv run london-office serve --no-agent
```

打开 **http://127.0.0.1:8017**。离线模式指“不调用模型”；指标查询使用随包的真实历史快照，联网底图失败时保留有提示的示意几何/指标列表。不得将这种模式称为实时模型实测。

没有 uv 时可用项目目录内的标准虚拟环境：

```bash
python3.12 -m venv .venv
.venv/bin/python -m pip install -r requirements.lock.txt
.venv/bin/python -m pip install --no-deps -e .
.venv/bin/python -m london_office serve --no-agent
```

前端仍需 `npm ci && npm run build`。不需要安装全局 Codex；Python SDK 使用已固定的 CLI runtime。

## 地图操作

- 拖动平移、滚轮缩放；右键拖动改变朝向与俯仰，触屏使用地图原生手势。
- 悬停示意区域查看名称、当前指标、时期与单位；点击区域聚焦并更新详情。右侧图标列 hover/focus 只展开同一栏的名称，移开收回；点击图标/名称才打开板块。桌面图标列固定在页面右侧，文字只向左展开，icon 坐标不变；键盘 Enter 选择、Escape 收起。小屏采用同一组 icon 的水平可滚动栏，触屏第一触显示名称、下一触明确选择。内容不会因移开鼠标而关闭，关闭按钮或 Escape 可返回地图。
- 地图底部提供缩放、旋转、倾斜、俯视与 **Overview** 复位；左侧指南针朝北复位，信息按钮解释空间数据来源与限制。
- 切换指标/时期不会重置镜头。两期条形图只展示真实已有值，缺失不画零柱、不补估计。
- 在集成详情展开年份来源，查看原始短摘录及出处。顶部 **Ask about this market…** 胶囊输入问题；聚焦/建议不发送模型请求，主动按箭头或 Enter 才发送。回答默认展示数值、图表、Python 比较、来源与 AI 定性解读；**Tools used** 可展开该次精确输入、返回摘要和完整 JSON。回答范围按实际证据标注，不借用地图选中标签；**View on map** 才显式聚焦对应范围。关闭或 Escape 收起并保留内容，已打开的集成详情不被替换；关闭展示不取消已主动提交的请求。不建立调查派单或自动研究发布流程。
- 底图失效时明确提示，仍保留真实市场数据与示意选择；不以静态截图/假城市代替 3D 服务。

当前 WIP 已包含集成左侧详情、选择及真实建筑着色和相关回归；性能仍待修复与验收，未新增 HTTP 合同、数据、研究/发布能力或模型调用。材料/交互参考用户 `test1.png` 和 [Apple visionOS Tab bars](https://developer.apple.com/design/human-interface-guidelines/tab-bars)，使用 CSS blur、半透明、高光与阴影，不是原生 Apple Liquid Glass 或完整光学折射。前次 chat 的实际业务 `output` 扩展保留。旧 PPT/ZIP 未重新生成，旧截图不代表新界面；视觉与业务验收仍由用户确认。

## 用自己的账户启用 Agent

```bash
uv run london-office login          # 在你自己的浏览器完成 SDK 登录
# 无浏览器回调时：uv run london-office login --device
uv run london-office status
uv run london-office models         # 核验账户可用模型，不调用模型生成
uv run london-office chat           # 多轮命令行交互，exit 结束
uv run london-office serve          # 启用网页按需对话，仍仅绑定 localhost
```

默认模型 `gpt-6.1-sol`，是否可用以实际账户为准；不可用时根据 `models` 输出显式设置 `LONDON_MODEL`，不自行选付费替代。默认每个进程最多 10 个交互轮次、单轮超时 120 秒；没有自动模型重试。SDK 内部一次交互可能包含多次模型/工具请求，该限制不是 token 或费用上限。

认证由 SDK 存在仓库外的专用目录 `~/.local/share/london-office-monitor/codex`；代码不读取或复制个人 `~/.codex` 配置/凭据。订阅模式显式阻止继承 OPENAI_API_KEY / CODEX_API_KEY；只开放项目的六个只读工具，禁用 shell、web search 和多 Agent。运行工具证据在忽略的 `var/runs/`，会话只驻留内存，重启后失效。

**API key 与订阅独立按量计费。** 仅在自己接受费用时显式启用：

```bash
export LONDON_AUTH_MODE=api-key
export OPENAI_API_KEY='YOUR_OWN_KEY'  # 仅在自己终端设置；不要提交、截图或写入交付包
uv run london-office chat
```

`LONDON_CODEX_HOME` 可指定另一个仓库外专用目录；拒绝个人 `~/.codex` 或仓库内目录。其他配置见 `london_office/settings.py`；不从个人 Pi、全局配置或 .env 文件自动加载运行策略。

## Python 查询、来源与验收

```bash
uv run london-office query --area city --metric prime_rent --period 2025-YE
uv run london-office compare --area west_end
uv run london-office brief --area city
uv run london-office verify savills-2025-q4
uv run london-office inspect your-own-market-report.pdf  # 仅提取，不自动认定为真实指标
uv run python -m unittest discover -s tests -v
cd frontend
PLAYWRIGHT_BROWSERS_PATH=./.pw-browsers npx playwright install chromium
npm run test:e2e                     # 独立服务器与 Chromium；真实 Python API，禁用模型
cd ..
uv run python scripts/live_smoke.py  # 登录后真正执行 3 轮模型，实际工具与逐项检查
# 另一终端已启动 Agent-enabled serve 后，可选地真正调用 2 轮模型：
node scripts/live_ui.mjs             # 独立 Chromium；订阅模式、实际 UI、多轮和来源断言
# 不消耗模型额度：已启动本项目 serve 后，截图并重放保存的真实 Run
node scripts/capture_agent_ui.mjs    # 明确标记 replay；/api/chat 在发送给后端之前拦截
```

业务 Module 可独立测试；合成缺失/冲突/零基数只在临时测试目录，不进入正式数据。`verify` 只重查白名单原文摘录，不发现最新报告或自动更新快照。来源字段、使用限制和地理缺口见 [`data/README.md`](data/README.md)；Interface 见 [`docs/contracts.md`](docs/contracts.md)。

## 演示文稿与交付包

```bash
uv run python scripts/build_slides.py
node scripts/print_slides.mjs
uv run python scripts/package_delivery.py
```

需先安装项目专用 Chromium（上节命令）才能打印 PDF；打包要求齐全的经审阅验证产物，缺文件时明确停止。公开源码不附账户或预制通过状态。5 页英文 PPTX、HTML、PDF 和真实截图放在 `artifacts/`；生成选项与业务演示流程见 [`presentation/README.md`](presentation/README.md)。验证状态默认未验证；只能凭真实证据更新，截图不是模型调用证据。

交付脚本只打包公开源文件与明确批准的产物清单，排除凭据、个人配置、.venv、node_modules、浏览器/运行目录、完整第三方报告和测评原附件。**不会自动上传 Google Drive，也不会设置任何分享权限。** 包用于评审方自行配置账户运行，不提供托管公网应用。

## 后续迭代

数据 Module 拥有来源/标准化/证据；Market Module 拥有定义与比较；Codex Adapter 独占 SDK/认证/线程/事件转换；界面只消费业务 JSON。未来其他运行时需要新增并验证 Adapter，不重写数值工具或把 SDK 对象传给 UI。架构决策见 `docs/adr/`，术语见 `GLOSSARY.md`。

GitHub Issues 是唯一需求/triage/backlog 入口，PR 正常 review；默认五标签与中文约定见 `docs/agents/`。`AGENTS.md` 是公开的项目初始化约定，已解除忽略以随源码保存；没有启动 Ralph。已有三个获用户批准的性能 Tickets，不自动新增或扩展 backlog。新数据定义、依赖、合同、付费调用和发布/分享权限变更需先确认。
