# London Office Monitor

可运行的伦敦写字楼市场监测 PoC：**Python 处理来源与口径、查询和计算；官方 Codex Python SDK 调用受限业务工具；deck.gl + MapLibre 提供交互地图。** 不依赖个人 Pi Agent 配置，不集成 LiteLLM，也不宣称能无缝切换运行时。

## 首版范围与诚实限制

- Savills **2024 / 2025 年末**报告中的 City / West End 平均 prime 成交租金、平均 Grade A 租金和整体空置率；11 条真实历史观察。
- Python 比较两期数值、区分租金百分比与空置率百分点、保留机构公布同比与计算差异、处理缺失/冲突并给出原文。
- 地图悬停、点击、指标/时期切换、两期值、需求驱动/报告事件，以及按需 Agent 对话。
- Canary Wharf 与 Midtown / Fringe 缺少**同口径**资料时保留缺失。四个地图范围均为手绘选择区域，**不是官方报告边界或建筑级统计**。
- 历史报告摘录**不是实时/最新市场覆盖**；没有实时新闻流、精确 GIS、建筑高度覆盖或后台自动发现新报告的声明。
- 租金按原文 £/sq ft；计费周期未明示，不自行添加 per annum。Prime achieved、headline/top、Grade A 和不同空置群体不可互换。

本机已通过 **25 项 Python 测试、6 项离线地图 E2E 与真实订阅 SDK／网页双轮交互**；保留失败记录，原 CLI 三轮脚本未整次通过，独立 review Closure 尚未完成。完整证据和限制见 [`docs/verification.md`](docs/verification.md)。运行者需要自己的有效登录；未登录时显示明确错误，不用离线模板假装 AI。

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

GitHub Issues 是唯一需求/triage/backlog 入口，PR 正常 review；默认五标签与中文约定见 `docs/agents/`。本地 `AGENTS.md` 按用户 setup 规则被忽略；没有启动 Ralph 或批量创建 backlog。新数据定义、依赖、合同、付费调用和发布/分享权限变更需先确认。
