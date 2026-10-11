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

**用户已认可当前性能结果，本阶段收口；剩余软件渲染优化暂缓。** 地图阶段验收基线为 `0177481`：27 项 Python＋类型检查 **1.21 秒**通过；已测试的 Apple M5 Pro／Metal 完整真实地图回归 **33/33 通过，命令共53.66秒**。SwiftShader 完整运行仍是截止未完成（16 pass、4 明确跳过、13 未执行），不是完整 GREEN；不继续为本阶段追求完整回归 **60秒**硬目标，也不设替代上限。原始失败、全部样本与限制见 [`docs/verification.md`](docs/verification.md)。

[#3 热态交互](https://github.com/liu-qingyuan/london-office-monitor/issues/3)、[#4 冷启动／降级](https://github.com/liu-qingyuan/london-office-monitor/issues/4) 已关闭；[#5 验证反馈](https://github.com/liu-qingyuan/london-office-monitor/issues/5) 保持 open、`ready-for-human`，正文标明暂缓，等待用户另行决定是否恢复，不进入自动实施队列。最新决定以 [Spec #2](https://github.com/liu-qingyuan/london-office-monitor/issues/2)／[`正文镜像`](docs/specs/map-performance.md) 为准。继续使用 main，不新建分支或 worktree，不再次启动 Ralph。当前阶段认可不代表新模型实测、跨硬件保证或 Issue #1 原独立 Closure 已完成；后续功能／权限扩展仍须另行授权。

编码 Agent 的完整开发工具权限与应用市场 Agent 的六工具只读权限分开，见 [`AGENTS.md`](AGENTS.md)。初始化先读当前 Ticket 正文／评论、同一份 [`GLOSSARY.md`](GLOSSARY.md)、[`docs/contracts.md`](docs/contracts.md) 和相关 [`docs/adr/`](docs/adr/)，明确当前任务范围与已知失败；不因“工具能做”顺手扩大任务。

| Module／职责 | 定位入口 | 关键限制 |
|---|---|---|
| 数据与来源 | `london_office/data.py`、`london_office/source_pool.py`、`data/README.md` | 正式快照与独立未核验候选池分开；不自动发布行情 |
| 来源发现 | `london_office/discovery.py`、`london_office/discovery_bridge.py`、`docs/features/source-discovery.md` | 显式、有限预算的 Google metadata；原生搜索经 Codex Adapter 接入 |
| Market | `london_office/market.py` | Python 数值、口径、比较和 missing／conflict；HTTP 与工具共享同一业务表面 |
| HTTP Interface | `london_office/app.py`、`london_office/tools.py` | 原业务 JSON／六工具与独立发现合同；不把 SDK 对象传给 UI |
| Workspace | `frontend/src/main.ts`、`frontend/src/types.ts` | 导航、详情及回答范围；消费 Python 事实，不重算市场指标 |
| 地图 | `frontend/src/map.ts` | 私有尺寸／空间／渲染生命周期；真实建筑仅为空间背景 |
| Codex Adapter | `london_office/runtime.py`、`london_office/settings.py`、`london_office/mcp_server.py` | 应用 Agent 的 SDK、认证、工具权限及回答校验；不读取个人配置 |
| Presentation | `presentation/README.md`、`presentation/build_slides.py`、`presentation/print_slides.mjs` | 面向业务评审的五页英文演示；共用 Market 事实，独立生成与打印，旧脚本只保留命令兼容 |

捕获慢症状后先建立最小真实复现并做定向 profile，再继续修复；普通编辑跑最短必要验证，不每次跑全套。当前检查入口见下文与 `frontend/package.json`／`frontend/playwright.config.ts`，不另造运行器。TypeScript 编译通过不等于 HTTP 合同、权限或可见帧时延已验证。

## 快速启动

需要 Python 3.12 或 3.13、Node.js 22.12+（本次实测 25.9.0）、npm。联网安装依赖；底图依赖免费的 OpenFreeMap，没有地图 key。`uv.lock` 和 `frontend/package-lock.json` 固定版本，SDK/runtime 为 `0.162.0`。

**操作系统支持：** 项目按官方 Codex runtime 支持的 **macOS、Linux、原生 Windows**适配；SerpAPI 通过 HTTPS 验证 key，不限制操作系统。CLI／网页都可使用后端环境变量，macOS Keychain 是可选的本地安全存储方式，不是运行前提。

| 后端运行系统 | 实现与验收边界 |
|---|---|
| macOS | 已有本机验证；可复用已配置的专用 Keychain，也可用环境变量 |
| Linux | 使用同一环境变量路径和 POSIX receipt 文件锁；原生 CI 验证见下方工作流，不借用 Mac 结果 |
| Windows（原生 Python） | 使用环境变量、`.venv/Scripts/python.exe` 和 Windows receipt 文件锁；不需要 Mac、Bash 或 WSL。原生 CI 结果须单独确认 |

[跨平台 CI](.github/workflows/portability.yml) 覆盖三系统与 Python 3.12／3.13，包含无认证的固定 SDK runtime 启动、业务／HTTP／MCP／预算竞争测试及 UI smoke。添加工作流不等于各系统已通过；最新实际执行与未验证项见 [`docs/verification.md`](docs/verification.md)。它不证明实时搜索／模型或跨硬件地图性能。以下 `uv` 安装／启动命令可用于 Bash 和 Windows PowerShell。

### 自动跨平台测试（CI）

CI 会在 GitHub 的 macOS、Ubuntu、Windows 标准测试机上分别安装固定依赖并运行检查，无需自己准备三台电脑。公开仓库使用这些标准 runner 免费。它只运行无认证启动、离线业务／SDK fixture、build 和 UI smoke，不使用自己的 SerpAPI／Codex key，也不执行真实搜索或模型生成。

- 推送代码或创建 PR 后自动运行；手动重跑：仓库 **Actions → Portable runtime → Run workflow → main → Run workflow**。
- 已有 GitHub CLI 时也可执行 `gh workflow run portability.yml --ref main`，再用 `gh run list --workflow portability.yml` 查看结果。
- 共六种组合（3 个系统 × Python 3.12／3.13），并行执行；首次安装通常需数分钟。绿色只代表该次提交的这些检查通过，不等于实时模型或完整地图性能验收。

**历史指标、地图和普通市场问答不需要 SerpAPI key。** 只有 Google 来源发现需要；首次使用该功能先看下文 [SerpAPI key 配置与使用](#serpapi-key-配置与使用)。

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

没有 uv 时可用项目目录内的标准虚拟环境。macOS／Linux：

```bash
python3.12 -m venv .venv
.venv/bin/python -m pip install -r requirements.lock.txt
.venv/bin/python -m pip install --no-deps -e .
.venv/bin/python -m london_office serve --no-agent
```

Windows PowerShell（已安装 Python 3.12 launcher；也可使用自己的 Python 3.13）：

```powershell
py -3.12 -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.lock.txt
.\.venv\Scripts\python.exe -m pip install --no-deps -e .
.\.venv\Scripts\python.exe -m london_office serve --no-agent
```

前端仍需 `npm ci` 和 `npm run build`。不需要安装全局 Codex；Python SDK 使用已固定的 CLI runtime。

## 地图操作

- 拖动平移、滚轮缩放；右键拖动改变朝向与俯仰，触屏使用地图原生手势。
- 悬停示意区域查看名称、当前指标、时期与单位；点击区域聚焦并更新详情。右侧图标列 hover/focus 只展开同一栏的名称，移开收回；点击图标/名称才打开板块。桌面图标列固定在页面右侧，文字只向左展开，icon 坐标不变；键盘 Enter 选择、Escape 收起。小屏采用同一组 icon 的水平可滚动栏，触屏第一触显示名称、下一触明确选择。内容不会因移开鼠标而关闭，关闭按钮或 Escape 可返回地图。
- 地图底部提供缩放、旋转、倾斜、俯视与 **Overview** 复位；左侧指南针朝北复位，信息按钮解释空间数据来源与限制。
- 切换指标/时期不会重置镜头。两期条形图只展示真实已有值，缺失不画零柱、不补估计。
- 在集成详情展开年份来源，查看原始短摘录及出处。顶部 **Ask about this market…** 胶囊输入问题；聚焦/建议不发送模型请求，主动按箭头或 Enter 才发送。回答默认展示数值、图表、Python 比较、来源与 AI 定性解读；**Tools used** 可展开该次精确输入、返回摘要和完整 JSON。回答范围按实际证据标注，不借用地图选中标签；**View on map** 才显式聚焦对应范围。关闭或 Escape 收起并保留内容，已打开的集成详情不被替换；关闭展示不取消已主动提交的请求。不建立调查派单或自动研究发布流程。
- 底图失效时明确提示，仍保留真实市场数据与示意选择；不以静态截图/假城市代替 3D 服务。

地图阶段已包含集成左侧详情、选择及真实建筑着色和相关回归；用户认可本阶段性能结果，剩余优化暂缓。该地图迭代未新增 HTTP 合同、数据、研究/发布能力或模型调用；后续来源发现的独立增量见下节。材料/交互参考用户 `test1.png` 和 [Apple visionOS Tab bars](https://developer.apple.com/design/human-interface-guidelines/tab-bars)，使用 CSS blur、半透明、高光与阴影，不是原生 Apple Liquid Glass 或完整光学折射。前次 chat 的实际业务 `output` 扩展保留。旧 PPT/ZIP 未重新生成，旧截图不代表新界面；视觉与业务验收仍由用户确认。

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

认证由 SDK 存在仓库外的专用目录 `~/.local/share/london-office-monitor/codex`；代码不读取或复制个人 `~/.codex` 配置/凭据。订阅模式显式阻止继承 OPENAI_API_KEY / CODEX_API_KEY，SerpAPI key 也从 SDK 环境清空；普通问答只开放项目的六个只读工具，禁 shell、web search 和多 Agent。显式来源发现是下述隔离 profile，不扩大普通会话权限。运行工具证据在忽略的 `var/runs/`，会话只驻留内存，重启后失效。

**API key 与订阅独立按量计费。** 仅在自己接受费用时显式启用：

```bash
export LONDON_AUTH_MODE=api-key
export OPENAI_API_KEY='YOUR_OWN_KEY'  # 仅在自己终端设置；不要提交、截图或写入交付包
uv run london-office chat
```

`LONDON_CODEX_HOME` 可指定另一个仓库外专用目录；拒绝个人 `~/.codex` 或仓库内目录。其他配置见 `london_office/settings.py`；不从个人 Pi、全局配置或 .env 文件自动加载运行策略。

## 小步增量：显式来源发现

Agent 面板默认 **Historical market**，切为 **Discover sources** 并明确提交才调用受限 Google 工具和原生 Web Search。**View source pool** 只读已归档候选，不搜索、不调用模型。完整返回与 AI 筛选分开；八维 topic 是检索意图，旧资料／URL 变体／噪音都保留，不代表市场覆盖。标题／日期／snippet 标为未核验，既有历史数值与地图不被摘要覆盖。现行合同与限制见 [`docs/contracts.md`](docs/contracts.md)、[`docs/features/source-discovery.md`](docs/features/source-discovery.md)。

### SerpAPI key 配置与使用

SerpAPI 为这里的 **Google 搜索通路**提供 API，不是 OpenAI／Codex key，也不是地图 key；它不能替代网页 Agent 的 Codex 登录。**key 通过 HTTPS 请求由 SerpAPI 服务端校验，验证本身不依赖 macOS。** Keychain 只是本地安全存储／读取 key 的方式；当前后端的操作系统依赖见上文“操作系统支持”。

| 使用方式 | SerpAPI key 从哪里读取 | 其他前提 |
|---|---|---|
| `sources`／**View source pool** 查看已归档候选 | 不需要 key | 不搜索、不调用模型 |
| `collect-sources` 命令行采集 | 优先 `SERPAPI_API_KEY`，未设置时尝试下述 macOS Keychain | 已获准的 Google 预算；不需要模型登录 |
| 网页 **Discover sources** | 应用父后端读取 `SERPAPI_API_KEY`，macOS 未设置时可复用专用 Keychain；MCP 只代理受限搜索 | 已获准的 Google／Codex 预算及 Codex 订阅登录 |

#### 1. 获取 key，并确认运行前提

- 在 [SerpAPI 官网](https://serpapi.com/) 注册／登录自己的账户，从 [API key 管理页](https://serpapi.com/manage-api-key) 获取 key。**不要使用或索取项目作者的 key。**
- 当前实现只接受 **Active Free Plan、月费为 0 且月度／每小时均有剩余搜索额度**的账户；运行时会先查 Account API，再决定是否搜索。付费套餐、额度不明或耗尽都会被拒绝，不自动升级／重试。套餐与额度以自己的控制台为准。
- 还需准备**为本次运行由运行授权人明确批准、仍有剩余额度的预算文件（receipt）**；首次使用先确认授权并取得该文件。下文的 `YOUR_AUTHORIZED_RECEIPT.json` 是路径占位符，需替换成实际文件；仓库不附可直接使用的授权文件，目前也没有预算初始化命令。SerpAPI 账户额度不等于项目执行授权，不能通过复制旧 receipt、清零计数或重启来续约。
- **网络：** 默认使用标准代理配置（如 `HTTPS_PROXY`），未配置代理时可直接访问 SerpAPI；不固定本机端口。需要单独指定时设置 `LONDON_SERPAPI_PROXY=http://你的代理地址:端口`，显式空值表示直连。CLI／网页共用这个后端行为，仍禁重定向、自动重试和 endpoint fallback。

#### 2. 命令行采集：复用 Keychain 或使用环境变量

**macOS 已配置专用 Keychain 时，不需要重复输入 key。** 未设置 `SERPAPI_API_KEY` 时，直接运行下方采集命令，后端会复用已存的 key；首次配置见下节。

环境变量适用于三系统的 CLI 和网页，也是 Linux／Windows 的配置方式；macOS 已有 Keychain 时不用重复设置。请在准备启动应用的同一个终端中设置，不自动读取 `.env`。macOS／Linux 的 Bash／zsh 示例（按提示粘贴自己的 key，输入不回显，避免明文进入 shell 历史）：

```bash
printf 'SerpAPI API key: '
read -r -s SERPAPI_API_KEY
printf '\n'
export SERPAPI_API_KEY
```

Windows PowerShell 示例（不会把明文 key 写在命令历史中）：

```powershell
$secret = Read-Host 'SerpAPI API key' -AsSecureString
$credential = [System.Net.NetworkCredential]::new('', $secret)
$env:SERPAPI_API_KEY = $credential.Password
Remove-Variable secret, credential
```

准备好 key、网络与获准预算后执行；下面的多行写法适用于 Bash。PowerShell 使用同一参数写成一行，例如 `uv run london-office collect-sources --query 'Savills Central London office research' --topic rents --budget-file "$PWD/var/runs/YOUR_AUTHORIZED_RECEIPT.json"`：

```bash
# 替换成已获准且有剩余额度的实际预算文件；本命令会发起真实 Google 请求
uv run london-office collect-sources \
  --query 'Savills Central London office research' \
  --topic rents \
  --budget-file "$PWD/var/runs/YOUR_AUTHORIZED_RECEIPT.json"

uv run london-office sources         # 只读已保存来源池，不再搜索
```

若使用了环境变量，结束后可 `unset SERPAPI_API_KEY` 清除当前终端中的 key；这不会删除专用 Keychain 项。

支持的 `--topic`：`rents`、`vacancy`、`leasing`、`supply`、`submarkets`、`macro`、`demand`、`news`；可重复传入。候选运行记录默认保存在 `var/discovery/records/`，搜索证据在 `var/discovery/evidence/`，均不更新正式市场快照。

项目**不会自动读取 `.env`**；只把 key 写入 `.env` 不会生效。不要把 key 写入源码、README、预算文件、截图或交付包；也不要粘贴到网页问题框。

#### 3. 可选：macOS 专用 Keychain

macOS 用户可把 key 存入下面的专用项，替代环境变量；Linux／Windows 用户跳过本节。**首次配置只需做一次；已配置的用户无需重复输入或创建条目。** 正常复用只由后端读取，不打印 key、不传给模型，也不复制个人配置。

首次使用时，在 macOS 终端创建专用项，`-w` 必须放在最后，按提示输入自己的 SerpAPI key，不把明文写在命令中：

```bash
/usr/bin/security add-generic-password \
  -a london-office-research-lab \
  -s london-office-research-lab.serpapi \
  -w
```

这两个名称是当前代码固定的查找标识，不是 SerpAPI 登录账户。若条目已存在，在 macOS **钥匙串访问（Keychain Access）**中找到服务／项目名称 `london-office-research-lab.serpapi`、账户 `london-office-research-lab` 并更新密码；不要改成自己的邮箱，也不要开放所有应用读取权限。首次运行可能需要确认本项目后端的 Keychain 访问。

#### 4. 三系统启动网页来源发现

先设置本终端的 `SERPAPI_API_KEY`，或在 macOS 配置上节 Keychain；完成上文 [Codex 订阅登录](#用自己的账户启用-agent) 后，在仓库根目录启动。Bash：

```bash
export LONDON_AUTH_MODE=subscription  # 网页发现当前不支持 api-key 认证模式
export LONDON_DISCOVERY_BUDGET_FILE="$PWD/var/runs/YOUR_AUTHORIZED_RECEIPT.json"
uv run london-office serve           # 不加 --no-agent；前端需已完成 build
```

Windows PowerShell：

```powershell
$env:LONDON_AUTH_MODE = 'subscription'
$env:LONDON_DISCOVERY_BUDGET_FILE = "$PWD/var/runs/YOUR_AUTHORIZED_RECEIPT.json"
uv run london-office serve
```

应用父后端持有实际 key；发现 MCP 只拿到本次请求的短期本地搜索调用权。SDK／模型与 MCP 环境中的 `SERPAPI_API_KEY` 仍清空，key 不放进工具输入、SDK 配置／命令参数或文件。普通市场会话的六工具权限不变。结构与取舍见 [ADR 0003](docs/adr/0003-portable-discovery-backend.md)。

打开 **http://127.0.0.1:8017**，在 Agent 面板选择 **Discover sources**，输入检索需求并明确提交。只打开页面、切换模式或 **View source pool** 不会搜索。注意：配置该预算文件后，普通市场问答也计入它的 `market_validation` 模型子额度，并非只有来源发现才计数。

#### 常见问题

| 错误／现象 | 检查方式 |
|---|---|
| `discovery_authorization_required`／`invalid_discovery_budget` | 确认预算路径指向实际、获准且有效的文件；设置 key 不会创建授权 |
| `search_key_unavailable` | 检查启动 CLI／服务的终端是否已设置变量；macOS 也可检查上述两个 Keychain 标识及访问许可，不打印 key 排错 |
| `free_quota_unconfirmed` | 在 SerpAPI 控制台确认 Active Free Plan、价格与月度／每小时剩余额度；不要换成付费套餐绕过 |
| `search_budget_exhausted`／`model_budget_exhausted` | 项目获准额度已用完；另行申请预算，不清零或重开旧 receipt |
| `google_discovery_failed`／`search_http_error`／`search_provider_error` | 检查网络／所配置代理、key 有效性及服务状态；执行证据保存在专用运行目录，不自动重试 |
| `discovery_bridge_unavailable` | 本次请求的后端桥接已关闭或无法连接；不要把 key 加到 SDK／模型配置，不自动重试 |
| 网页只有原生搜索结果，Google 未确认 | 查看 **Actual Google tool execution** 中 Google 工具的实际错误；原生 Web Search 成功不等于 SerpAPI 配置成功 |

失败／超时仍可能占用已开始的搜索或模型额度。上述配置说明不是最新真实搜索验收；没有 key 或预算时，历史市场功能仍可使用。

### 当前来源发现验证状态

不会自动生成或重开预算。本仓库当前演示授权 receipt 的 Google **8/8** 已用完；Codex **2/3** 已用（来源发现一轮＋普通市场验证一轮），留有一轮原生额度，普通市场验证子额度已用完。该记录不是新使用者可直接复用的配额；新增 Google 搜索需另行批准预算。

最新真实 UI 双通路已通过：实际 Google 工具＋原生可见 metadata，187 个不同 URL 字符串／247 次出现、三个 AI 筛选的机构入口；并非这些资料已核验。普通市场真实 compare_periods 也通过。输入、运行与截图在 `artifacts/discovery/20261011-source-first/`；正式快照、原报告全文与定位能力未增加。用户明确不走新 Spec／Tickets／Ralph，以 Feature 小步迭代。剩余源内容／口径核验与精确空间关联分阶段完善。

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
npm run test:e2e                     # 原入口：独立服务器／SwiftShader，真实 Python API，无模型
npm run check:quick                  # ≤10 秒：Python＋类型；本机54项离线通过，不代替模型实测
# ≤30 秒：按改动传入原测试文件／-g；包含 production build、服务器、浏览器与证据
OFFICE_USER_RENDERER=1 npm run check:focused -- tests/left-detail.spec.ts -g 'same-size selections|buildings and labels'
npm run check:focused -- tests/left-detail.spec.ts -g 'buildings and labels' --workers 1
# 可选完整真实业务／地图检查；现有命令仍有原60秒截止，已不作本阶段硬门槛
OFFICE_USER_RENDERER=1 npm run check:full  # 最新固定机器 GPU 35 项完整 GREEN，58 秒（无模型）
npm run check:full                       # SwiftShader 对照，当前截止仍 RED；不冒充完整通过
# 固定输入三次独立用户采样；分别把 1600 替换成 390 再执行，两种视窗各一条命令
# --workers=1 隔离性能采样；正常动画、生产构建，不能用软件 renderer 替代
OFFICE_USER_RENDERER=1 OFFICE_PERFORMANCE_REPEAT=1 npm run check:focused -- tests/left-detail.spec.ts -g 'hot user-renderer selection 1600' --workers 1
OFFICE_USER_RENDERER=1 OFFICE_PERFORMANCE_REPEAT=1 npm run check:focused -- tests/cold-start.spec.ts -g 'cold startup 1600' --workers 1
cd ..
uv run python scripts/live_smoke.py  # 登录后真正执行 3 轮模型，实际工具与逐项检查
# 另一终端已启动 Agent-enabled serve 后，可选地真正调用 2 轮模型：
node scripts/live_ui.mjs             # 独立 Chromium；订阅模式、实际 UI、多轮和来源断言
# 不消耗模型额度：已启动本项目 serve 后，截图并重放保存的真实 Run
node scripts/capture_agent_ui.mjs    # 明确标记 replay；/api/chat 在发送给后端之前拦截
```

业务 Module 可独立测试；合成缺失/冲突/零基数只在临时测试目录，不进入正式数据。`verify` 只重查白名单原文摘录，不发现最新报告或自动更新快照。来源字段、使用限制和地理缺口见 [`data/README.md`](data/README.md)；Interface 见 [`docs/contracts.md`](docs/contracts.md)。

## 演示文稿与交付包

演示内容、PPTX／HTML 排版和 PDF 打印实现统一在 `presentation/`；`scripts/` 中的原生成／打印命令只是兼容入口。项目 ZIP 打包仍由 `scripts/package_delivery.py` 拥有。当前能力与限制见 [`Presentation feature 记录`](docs/features/presentation.md)。

```bash
uv run python presentation/build_slides.py
node presentation/print_slides.mjs
uv run python scripts/package_delivery.py
```

原命令 `uv run python scripts/build_slides.py` 与 `node scripts/print_slides.mjs` 保持可用，参数与产物路径不变。

需先安装项目专用 Chromium（上节命令）才能打印 PDF；打包要求齐全的经审阅验证产物，缺文件时明确停止。公开源码不附账户或预制通过状态。5 页英文 PPTX、HTML、PDF 和真实截图放在 `artifacts/`；生成选项与业务演示流程见 [`presentation/README.md`](presentation/README.md)。验证状态默认未验证；只能凭真实证据更新，截图不是模型调用证据。

交付脚本只打包公开源文件与明确批准的产物清单，排除凭据、个人配置、.venv、node_modules、浏览器/运行目录、完整第三方报告和测评原附件。**不会自动上传 Google Drive，也不会设置任何分享权限。** 包用于评审方自行配置账户运行，不提供托管公网应用。

## 后续迭代

数据 Module 拥有来源/标准化/证据；Market Module 拥有定义与比较；Codex Adapter 独占 SDK/认证/线程/事件转换；界面只消费业务 JSON。未来其他运行时需要新增并验证 Adapter，不重写数值工具或把 SDK 对象传给 UI。架构决策见 `docs/adr/`，术语见 `GLOSSARY.md`。

地图／数据／搜索／AI Agent 完整目标见 [架构说明](docs/architecture/search-data-map-agent.md) 和 [ADR 0002](docs/adr/0002-four-capabilities-and-spatial-mapping.md)。来源发现已按用户新授权接入；完整空间计划仍是 proposed，任意定位与正式行情动态接纳未实现。候选池可重读，不意味着正式 Market 快照已经无重启更新。地图软件渲染余项按用户决定暂缓。

GitHub Issues 是唯一需求/triage/backlog 入口，PR 正常 review；默认五标签与中文约定见 `docs/agents/`。`AGENTS.md` 是公开的项目初始化约定，已随源码保存。获授权的 Ralph 本轮已结束；#5 剩余工作按用户决定暂缓，不自动恢复循环、另拆票或扩展 backlog。新数据定义、依赖、合同、付费调用和发布/分享权限变更需先确认。
