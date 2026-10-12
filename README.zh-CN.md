# London Office Monitor

[English](README.md) | **简体中文**

可运行的伦敦写字楼市场监测 PoC：**Python 处理来源与口径、查询和计算；官方 Codex Python SDK 调用受限业务工具；deck.gl + MapLibre 提供交互地图。** 不依赖个人 Pi Agent 配置，不集成 LiteLLM，也不宣称能无缝切换运行时。

## 首版范围与诚实限制

- Savills **2024 / 2025 年末**报告中的 City / West End 核心租金／空置率11条历史观察，另有已获用户授权的**八维来源限定研究基线**：132条记录（原120条＋本轮12条2026核验事实）、21份来源、105条短证据、3项Python比较；7条许可／证据不足字段只列缺口，不发布其数值。
- Python 比较两期数值、区分租金百分比与空置率百分点、保留机构公布同比与计算差异、处理缺失/冲突并给出原文。
- **可探索伦敦 3D 地图**：地图铺满视窗，原生平移/缩放/旋转/俯仰、子市场悬停与聚焦、比例尺及总览复位。右侧是 **visionOS 风格玻璃图标列**：默认只显示九个导航 icon，同一栏 hover/focus 展开文字，移开收回；没有圆球入口或独立弹出菜单，点击才打开对应内容。板块为子市场、租金、空置与可租赁率、租赁、供应、宏观、需求、新闻、地图图层；八个市场板块展示已接纳研究的数值、实际窗口、地理范围、出处和限制；地图图层仍只用原三指标，不代表完整或实时市场覆盖。顶部 Agent 胶囊独立展开，默认显示 Python 数值/图表/计算与 AI 解读，可展开实际工具输入/输出。
- Canary Wharf 与 Midtown / Fringe 缺少**同口径**资料时保留缺失。四个地图范围均为手绘选择区域，**不是官方报告边界或建筑级统计**。
- 八维研究中的年度/Q4流量、存量、forecast、UK／样本背景和具名事件分别展示；它们独立于地图选择与YE筛选，不借用到楼栋。历史摘录**不是实时/最新市场覆盖**；新增官方索引检测和有界macOS定时能力，以及News板块的只读监测卡片；检测到的链接仍是线索，不是已核验实时新闻流或自动更新的市场值。没有精确报告GIS、实测建筑高度覆盖或自动发布新报告的声明。3D 建筑来自 OpenFreeMap / OpenMapTiles，只作空间背景，不代表逐栋租金/空置率；没有高度的建筑不由界面编造高度。
- 租金按原文 £/sq ft；计费周期未明示，不自行添加 per annum。Prime achieved、headline/top、Grade A 和不同空置群体不可互换。

## 实施入口与当前状态

**用户已认可当前性能结果，本阶段收口；剩余软件渲染优化暂缓。** 地图阶段验收基线为 `0177481`：27 项 Python＋类型检查 **1.21 秒**通过；已测试的 Apple M5 Pro／Metal 完整真实地图回归 **33/33 通过，命令共53.66秒**。SwiftShader 完整运行仍是截止未完成（16 pass、4 明确跳过、13 未执行），不是完整 GREEN；不继续为本阶段追求完整回归 **60秒**硬目标，也不设替代上限。原始失败、全部样本与限制见 [`docs/verification.md`](docs/verification.md)。

[#3 热态交互](https://github.com/liu-qingyuan/london-office-monitor/issues/3)、[#4 冷启动／降级](https://github.com/liu-qingyuan/london-office-monitor/issues/4) 已关闭；[#5 验证反馈](https://github.com/liu-qingyuan/london-office-monitor/issues/5) 保持 open、`ready-for-human`，正文标明暂缓，等待用户另行决定是否恢复，不进入自动实施队列。最新决定以 [Spec #2](https://github.com/liu-qingyuan/london-office-monitor/issues/2)／[`正文镜像`](docs/specs/map-performance.md) 为准。继续使用 main，不新建分支或 worktree，不再次启动 Ralph。当前阶段认可不代表新模型实测、跨硬件保证或 Issue #1 原独立 Closure 已完成；用户已明确批准本轮八维研究入库／现有应用更新，未来自动发布或付费调用不因此获授权。

编码 Agent 的完整开发工具权限与应用市场 Agent 的六工具只读权限分开，见 [`AGENTS.md`](AGENTS.md)。初始化先读当前 Ticket 正文／评论、同一份 [`GLOSSARY.md`](GLOSSARY.md)、[`docs/contracts.md`](docs/contracts.md) 和相关 [`docs/adr/`](docs/adr/)，明确当前任务范围与已知失败；不因“工具能做”顺手扩大任务。

| Module／职责 | 定位入口 | 关键限制 |
|---|---|---|
| 数据与来源 | `london_office/data.py`、`london_office/research_intake.py`、`london_office/source_pool.py`、`data/README.md` | 不变基线、明确授权的研究overlay和未核验metadata分开 |
| 来源发现 | `london_office/authorization.py`、`london_office/discovery.py`、`london_office/discovery_bridge.py`、`docs/features/source-discovery.md` | 网页有限授权、后端有效期守卫；metadata经Codex Adapter接入 |
| 官方监测 | `london_office/official_watch.py`、`london_office/monitor_schedule.py`、`london_office/monitoring_status.py`、`frontend/src/monitoring.ts` | 官方索引／有界macOS定时；News卡片只读档案，关键词仅显示粗筛，不写行情 |
| Market | `london_office/market.py` | Python 数值、口径、比较和 missing／conflict；HTTP 与工具共享同一业务表面 |
| HTTP Interface | `london_office/app.py`、`london_office/tools.py` | 原业务 JSON／六工具与独立发现合同；不把 SDK 对象传给 UI |
| Workspace | `frontend/src/main.ts`、`frontend/src/types.ts` | 导航、详情及回答范围；消费 Python 事实，不重算市场指标 |
| 地图 | `frontend/src/map.ts` | 私有尺寸／空间／渲染生命周期；真实建筑仅为空间背景 |
| Codex Adapter | `london_office/runtime.py`、`london_office/settings.py`、`london_office/mcp_server.py` | 应用 Agent 的 SDK、认证、工具权限及回答校验；不读取个人配置 |
| Presentation | `presentation/README.md`、`presentation/kimi-prompt-zh-CN.md`、`presentation/kimi-prompt-en.md`、`presentation/materials/` | PPT 仅由 Kimi 制作／修改；其他 AI 只提供 prompt、真实截图与说明，仓库不生成演示 |

捕获慢症状后先建立最小真实复现并做定向 profile，再继续修复；普通编辑跑最短必要验证，不每次跑全套。当前检查入口见下文与 `frontend/package.json`／`frontend/playwright.config.ts`，不另造运行器。TypeScript 编译通过不等于 HTTP 合同、权限或可见帧时延已验证。

## 快速启动

需要 Python 3.12 或 3.13、Node.js 22.12+（本次实测 25.9.0）、npm。联网安装依赖；底图依赖免费的 OpenFreeMap，没有地图 key。`uv.lock` 和 `frontend/package-lock.json` 固定版本，SDK/runtime 为 `0.162.0`。

**操作系统支持：** 项目按官方 Codex runtime 支持的 **macOS、Linux、原生 Windows**适配；SerpAPI 通过 HTTPS 验证 key，不限制操作系统。CLI／网页都可使用后端环境变量，macOS Keychain 是可选的本地安全存储方式，不是运行前提。

| 后端运行系统 | 实现与验收边界 |
|---|---|
| macOS | 本机及原生 CI 通过；可复用已配置的专用 Keychain，也可用环境变量 |
| Linux | 原生 Ubuntu CI 通过；使用同一环境变量路径和 POSIX receipt 文件锁 |
| Windows（原生 Python） | 原生 CI 通过；使用环境变量、`.venv/Scripts/python.exe` 和 Windows receipt 文件锁，不需要 Mac、Bash 或 WSL |

[跨平台 CI](.github/workflows/portability.yml) 的[首轮原生执行](https://github.com/liu-qingyuan/london-office-monitor/actions/runs/38155388215) **6/6通过**（提交 `a0c98a5`）：三系统各覆盖 Python 3.12／3.13，每组54项 Python测试、production build和7项 UI smoke，包含无认证的固定 SDK runtime 启动、HTTP／MCP与预算竞争。实际范围与未验证项见 [`docs/verification.md`](docs/verification.md)；它不证明真实账户登录／搜索／模型、所有文件系统、完整地图或跨硬件性能，也不证明 GitHub 虚拟机达到本机 quick／focused 时限。以下 `uv` 安装／启动命令可用于 Bash 和 Windows PowerShell。

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
- 在集成详情展开年份来源，查看原始短摘录及出处。顶部 **Ask about this market…** 胶囊输入问题；聚焦/建议不发送模型请求，主动按箭头或 Enter 才发送。回答默认展示数值、图表、Python 比较、来源与 AI 定性解读；**Tools used** 可展开该次精确输入、返回摘要和完整 JSON。回答范围按实际证据标注，不借用地图选中标签；**View on map** 才显式聚焦对应范围。关闭或 Escape 收起并保留内容，已打开的集成详情不被替换；关闭展示不取消已主动提交的请求。**研究入库**可暂存用户原材料和scalar候选，另行授权本批后接纳充分证据、留下模糊／冲突供判断、阻止缺原文项；不把检索摘要发布成事实。
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

默认模型 `gpt-6.1-sol`，是否可用以实际账户为准；不可用时根据 `models` 输出显式设置 `LONDON_MODEL`，不自行选付费替代。普通问答和legacy发现默认每进程最多10个交互轮次、单轮超时120秒；没有自动模型重试。明确网页发现由其有限grant的调用方轮次约束，批准新grant不需重启。SDK 内部一次交互可能包含多次模型/工具请求，该限制不是 token 或费用上限。

认证由 SDK 存在仓库外的专用目录 `~/.local/share/london-office-monitor/codex`；代码不读取或复制个人 `~/.codex` 配置/凭据。订阅模式显式阻止继承 OPENAI_API_KEY / CODEX_API_KEY，SerpAPI key 也从 SDK 环境清空；普通问答只开放项目的六个只读工具，禁 shell、web search 和多 Agent。显式来源发现是下述隔离 profile，不扩大普通会话权限。运行工具证据在忽略的 `var/runs/`，会话只驻留内存，重启后失效。

**API key 与订阅独立按量计费。** 仅在自己接受费用时显式启用：

```bash
export LONDON_AUTH_MODE=api-key
export OPENAI_API_KEY='YOUR_OWN_KEY'  # 仅在自己终端设置；不要提交、截图或写入交付包
uv run london-office chat
```

`LONDON_CODEX_HOME` 可指定另一个仓库外专用目录；拒绝个人 `~/.codex` 或仓库内目录。其他配置见 `london_office/settings.py`；不从个人 Pi、全局配置或 .env 文件自动加载运行策略。

## 小步增量：显式来源发现

Agent 面板默认 **Historical market**，切为 **Discover sources／发现来源**，输入问题、设置有限 Google 次数／订阅调用方轮次和有效期，再点击**授权本次额度并搜索**才创建授权并执行。箭头／Enter 仅使用已存在的活动授权，不会自动授权或续期。**View source pool** 只读已归档候选，不搜索、不调用模型。完整返回与 AI 筛选分开；八维 topic 是检索意图，旧资料／URL 变体／噪音都保留，不代表市场覆盖。标题／日期／snippet 标为未核验，既有历史数值与地图不被摘要覆盖。现行合同与限制见 [`docs/contracts.md`](docs/contracts.md)、[`docs/features/source-discovery.md`](docs/features/source-discovery.md)。

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
- 还需在网页明确批准有限次数和期限（第4步）；后端保存授权与启动次数，**不是购买凭证**。仓库和ZIP不附可继承的授权。SerpAPI账户额度不等于执行授权，不能复制旧receipt、清零计数或靠重启续约。CLI采集仍需其独立获准的receipt。
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

#### 4. 直接在网页授权

真实搜索需要**自己的Codex订阅登录、SerpAPI免费账户key，以及明确批准的有限本机授权**。按上文配置一次key，从仓库根目录执行`uv run london-office serve`；不加`--no-agent`，不切为API-key计费。

1. 打开 **http://127.0.0.1:8017**，展开Agent面板，切为 **Discover sources／发现来源**。
2. 输入问题，设置Google启动次数、订阅调用方轮次（各1–100）和有效期（1–1440分钟）。
3. 点击**授权本次额度并搜索**。网页显示活动／耗尽／过期／损坏状态、已开始／剩余次数及后端到期时间；每次搜索绑定具体授权。**不用手改预算JSON，也不用重启。**
4. 耗尽／过期后必须再次明确授权才会创建新额度，旧计数保留。搜索授权不授权普通市场模型问答或研究入库；caller turns不是内部HTTP、token或费用硬上限。

<details>
<summary>可选：旧终端receipt配置方式（网页授权不需要）</summary>

**仅选择旧配置入口时，另行明确授权并建立文件。** 下面同一条多行命令可在Bash/zsh或PowerShell运行；它只写本机配置，不搜索、不调用模型、不读取凭据。默认最多一次免费配额内Google搜索和一轮订阅来源发现；两个上限可在确认前改成你愿意授权的有限次数。终端显示上限后，只有手动输入`我授权`才创建新的唯一文件，不会覆盖/重置旧文件。

```bash
uv run python -X utf8 -c '
import json
from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4

google_cap = 1
discovery_turn_cap = 1
if not (type(google_cap) is int and type(discovery_turn_cap) is int and google_cap > 0 and discovery_turn_cap > 0):
    raise SystemExit("次数必须为明确的正整数；未创建授权文件。")
confirmation = input(f"授权本机最多{google_cap}次免费配额内Google搜索、{discovery_turn_cap}轮订阅来源发现；不使用按量API、不自动发布行情。确认请输入我授权：")
if confirmation.strip() != "我授权":
    raise SystemExit("未获授权；未创建文件，也未搜索。")
folder = Path("var/runs/discovery-authorized")
folder.mkdir(parents=True, exist_ok=True)
budget = folder / ("budget-" + uuid4().hex + ".json")
receipt = {
    "authorization": f"Local operator explicitly approved up to {google_cap} free-quota Google searches and {discovery_turn_cap} subscription source-discovery caller turns; no paid fallback, automatic renewal or market publication.",
    "authorized_at": datetime.now(timezone.utc).isoformat(),
    "serpapi_search_http_start_cap": google_cap,
    "serpapi_search_http_starts": 0,
    "account_http_starts": 0,
    "codex_turn_start_cap": discovery_turn_cap,
    "codex_turn_starts": 0,
    "codex_native_discovery_turn_start_cap": discovery_turn_cap,
    "codex_native_discovery_turn_starts": 0,
    "codex_market_validation_turn_start_cap": 0,
    "codex_market_validation_turn_starts": 0,
    "jobs": {}
}
with budget.open("x", encoding="utf-8") as output:
    json.dump(receipt, output, ensure_ascii=False, indent=2)
print("授权文件路径：", budget.resolve())
'
```

**接入后端并启动。** 把命令打印的实际路径填入下方环境变量；`YOUR_AUTHORIZED_RECEIPT.json`不是仓库现成文件。必须在**设置变量的同一个终端**启动应用；若8017旧服务已运行，先在它的原终端Ctrl+C，再启动配置后的服务。只刷新网页、修改`.env`或在另一个终端设置变量，都不会改变已运行后端的配置。Bash/zsh：

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

打开或刷新 **http://127.0.0.1:8017**，在Agent面板选择 **Discover sources／发现来源**，输入需求并明确提交；**View source pool／查看来源池**只是读取既有线索，不会搜索。可直接访问`http://127.0.0.1:8017/api/catalog`检查`agent.discovery_configured`是否为`true`；它只证明后端接到文件路径，不证明文件有效、已登录或还剩额度。

本例只授权来源发现：`codex_market_validation_turn_start_cap=0`，**不授权普通模型市场问答**；地图、Python市场查询和查看来源池仍可用。若还要模型市场问答，需要在自己的新授权里明确分配`codex_market_validation_turn_start_cap`及模型总上限，不能让来源发现授权隐含扩大权限。模型一次调用方轮次可能含内部多次模型/工具请求，原生搜索内部HTTP数不可硬计；该文件不是token/费用上限。

</details>

#### 常见问题

| 错误／现象 | 检查方式 |
|---|---|
| `discovery_authorization_required` | 在网页设置有限次数和期限，再明确授权；仅设置key或刷新页面不能授权搜索 |
| `discovery_authorization_expired` | 后端已阻止新的执行；继续搜索需新的明确授权，旧计数保留 |
| `search_key_unavailable` | 检查启动 CLI／服务的终端是否已设置变量；macOS 也可检查上述两个 Keychain 标识及访问许可，不打印 key 排错 |
| `free_quota_unconfirmed` | 在 SerpAPI 控制台确认 Active Free Plan、价格与月度／每小时剩余额度；不要换成付费套餐绕过 |
| “本次已授权的模型/搜索次数已用完”／`search_budget_exhausted`／`model_budget_exhausted` | 可继续查看来源池，或在网页明确批准新有限额度；不用重启，不清零旧计数，不自动重试 |
| `google_discovery_failed`／`search_http_error`／`search_provider_error` | 检查网络／所配置代理、key 有效性及服务状态；执行证据保存在专用运行目录，不自动重试 |
| `discovery_bridge_unavailable` | 本次请求的后端桥接已关闭或无法连接；不要把 key 加到 SDK／模型配置，不自动重试 |
| 网页只有原生搜索结果，Google 未确认 | 查看 **Actual Google tool execution** 中 Google 工具的实际错误；原生 Web Search 成功不等于 SerpAPI 配置成功 |

失败／超时仍可能占用已开始的搜索或模型额度。上述配置说明不是最新真实搜索验收；没有 key 或预算时，历史市场功能仍可使用。

### 研究入库：本批单独授权

在Agent面板点击 **Research intake／研究入库**。添加用户自己的PDF／HTML／TXT原材料（每文件及整批合计最多5MB）、原来源HTTPS URL及机构／使用说明；逐条填写有原文支持的scalar统计值、精确短引文和数值＋单位锚点、地域、统计窗口、定义以及明确给出的分母／计费周期。这是原材料支撑的人工候选暂存，不自动抓取URL或由模型提取；上传不证明机构真实性。

**仅暂存本批，不入库**保存实际bytes／hash和分类，不发布。**授权本批入库**与搜索授权独立：原文充分且无冲突项自动接纳；模糊／同口径冲突需带理由接受或拒绝；引文不匹配、数值／类型不支持和重复项不能确认放行。真冲突保留各来源报告值与标签，相关自动比较停止。内容变更需要新不可变批次和新授权。

接纳后，现有市场查询／六个只读工具及界面立即重读研究，**无需重启**；原snapshot、地图数值／几何／镜头不改。用户原材料来源标识及限制保留。档案只在ignored `var/research/`或专用`LONDON_RESEARCH_DIR`，不提交／打包；批准入口仅供用户网页，不是模型工具。见[合同与八张局部设计图](docs/architecture/web-authorization-and-intake.md)。

### 官方监测：在界面上查看

在右侧打开 **News & events／新闻与事件**，顶部的 **Official source monitoring** 卡片显示最近检查时间、定时任务是否运行、已开始轮数／上限、两个官方来源及报告链接。**Refresh status** 只读取本机档案，不搜索、不调用模型，也不安装／触发任务。

后端读取 `var/monitoring/ui-config.json`：`{"schema_version":1,"schedule_config":"var/monitoring/你的专用目录/schedule.json"}`。路径只指向仓库内已有且获准的配置；不附预算，不提供可复制的执行授权。未配置、已停止、失败与未知日期均如实显示。定时仅macOS实现；用户取消7天部署后，额外完成30秒／一轮的真实原生检查，两源HTTP200并移除本label。当前卡片显示 **stopped、1/1**，最近检查上海07:48:43；不是常驻监控，预算仍原32次／今日09:00到期。

显示层按官方HTTPS来源与办公CRE关键词作粗筛，原档案和被省略链接保留，未使用AI。索引版次不等于发布日期或统计窗口；例如已读取的September 2026月报实际报告August 2026。本轮另已增量接纳12条2026事实：UK利率／GDP／劳动力4条和Savills August月度／YTD／租金／结构8条；各相关研究板块顶部的 **Latest verified update** 展示自己的原文、窗口和来源，原120条历史保留。2024／2025地图不被月度值替换。已重新build并重载本机8017服务；后续源码／版本化snapshot修改仍需重载；单独授权的研究批次不需要，见[监测Feature](docs/features/source-monitoring.md)和[只读UI合同](docs/architecture/monitoring-status-ui.md)。

### 当前来源发现验证状态

2026-10-12用户明确批准一次免费配额内Google搜索和一轮订阅来源发现，已通过真实8017网页提交单次`POST /api/discovery`：HTTP200，Google与原生搜索均`completed_metadata_only`；确认Active Free Plan月费为0，没有按量API、付费fallback或重试。来源池554→579个exact URL字符串，新增25条未核验线索；Google捕获27次URL出现，原生捕获12次、一个可见搜索项，AI选择两个官方publisher索引。搜索通路成功，但未从本次metadata定位到请求的具体原报告，不能宣称全文/口径已核验。正式snapshot及旧官方读取账本hash保持不变。

本次授权已用完：Google1/1、订阅模型调用方轮1/1；原生内部HTTP次数未知，不能把调用方轮当作token/费用硬上限。旧receipt保留且仍已耗尽；继续搜索可在网页另行明确批准新有限额度，不能自动续期。真实输入、返回和截图在`artifacts/discovery/20261012-one-shot/`。该轮历史离线115项Python＋类型检查quick2.42秒；授权提示三语/只读池/显式筛选4项回归10.84秒，其中错误与AI筛选是fixture，不替代上述真实网页请求；完整地图性能、普通市场模型问答及跨平台账户搜索此次未重跑。

`artifacts/discovery/20261011-source-first/`中187个URL／247次出现、旧模型/Google额度和普通market比较仅为历史证据，不是当前可复用的配额。用户明确不走新Spec／Tickets／Ralph；来源内容/口径核验与精确空间关联仍分阶段完善。

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
npm run check:quick                  # ≤10 秒：Python＋类型；最新结果见verification，不代替模型实测
# ≤30 秒：按改动传入原测试文件／-g；包含 production build、服务器、浏览器与证据
OFFICE_USER_RENDERER=1 npm run check:focused -- tests/left-detail.spec.ts -g 'same-size selections|buildings and labels'
npm run check:focused -- tests/left-detail.spec.ts -g 'buildings and labels' --workers 1
# 可选完整真实业务／地图检查；现有命令仍有原60秒截止，已不作本阶段硬门槛
OFFICE_USER_RENDERER=1 npm run check:full  # 历史固定机器GPU 35项/58秒；本次未重跑（无模型）
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

## Kimi 演示材料与代码交付

**PPT 的制作及修改全部交给 Kimi。其他 AI 只维护提示词、真实截图与素材说明，不生成／打印／修改演示成品。** 首次制作上传 [`presentation/materials/`](presentation/materials/) 中的合适截图（最新主视觉／图表优先），选择 [`中文 prompt`](presentation/kimi-prompt-zh-CN.md) 或 [`English prompt`](presentation/kimi-prompt-en.md)。**修改旧Kimi成品**时上传旧PPT、四张新版浮层／图表及原材料表单图（具体名单见Presentation README），使用 [`中文增量修改`](presentation/kimi-update-zh-CN.md) 或 [`English revision`](presentation/kimi-update-en.md)。保留六页方案，优先替换旧固定侧栏截图，说明全屏地图上的磨砂浮层／来源图表，补充网页有限搜索授权、原材料先暂存再单独批准本批接纳，并保留官方索引检测、有界macOS定时与News只读卡片；接纳演示图内容为明确合成测试，不是市场事实；不把stopped图改成永久运行，不把链接当已核验实时行情。素材还覆盖八维、架构、地图／语言与AI；出处和范围见 [`presentation/README.md`](presentation/README.md)。

Kimi 成品由用户下载到 `artifacts/presentation/kimi-final/`；修改仍回交 Kimi。旧生成／打印脚本、生成器测试和专用依赖已移除，不再维护多套演示。此前已交付的冻结 ZIP／PPT 与有日期的验证档案保留，不作为当前产品介绍版。

**代码 ZIP 单独打包，随后与选定的 Kimi PPT 手动上传 Drive：**

```bash
uv run python scripts/package_delivery.py --snapshot
```

每次生成独立的 `artifacts/delivery/london-office-monitor-<UTC时间>-snapshot/`，不覆盖旧包。无参数执行也采用同一代码快照流程；不再要求旧演示／验收附件。ZIP 包含当前公开源码、明确允许的静态输入、中英完整／增量Kimi prompt及十一张已审阅界面图（含明确合成原材料的接纳演示）、`START-HERE.md` 和 SHA-256 清单；**不生成、修改或夹带 PPT／幻灯片 PDF／HTML，也不自动收录 Kimi 成品**。打包仅需 Python 与 Git，不启动浏览器或应用；解压运行仍需按说明安装依赖、构建前端及配置自己的模型账户。

排除凭据、个人配置、环境、预算 receipt、原始报告、运行目录与旧 `artifacts/`；非白名单图片不进入 ZIP，拒绝源码／输出目录链接。历史图片和回放 fixture 不代表新实测。打包不执行产品验收、模型／搜索、自动上传或分享权限变更；三类验证保持 `Not yet verified`。生成期间观察到公开源码变化会停止，待编辑结束后重跑。当前行为见 [`Presentation feature`](docs/features/presentation.md)。Drive 只分发文件，不提供托管公网应用。

## 后续迭代

数据 Module 拥有来源/标准化/证据；Market Module 拥有定义与比较；Codex Adapter 独占 SDK/认证/线程/事件转换；界面只消费业务 JSON。未来其他运行时需要新增并验证 Adapter，不重写数值工具或把 SDK 对象传给 UI。架构决策见 `docs/adr/`，术语见 `GLOSSARY.md`。

地图／数据／搜索／AI Agent 完整目标见 [架构说明](docs/architecture/search-data-map-agent.md) 和 [ADR 0002](docs/adr/0002-four-capabilities-and-spatial-mapping.md)。来源发现已按用户新授权接入；完整空间计划仍是proposed，任意定位与无人值守自动接纳未实现。八维基线及明确批准的研究overlay通过原query／brief／六工具和八板块展示；metadata不可直接发布。版本化snapshot修改仍需重启，接纳批次动态刷新；旧模型会话不可静默混用研究版本。地图软件渲染余项按用户决定暂缓。

GitHub Issues 是唯一需求/triage/backlog 入口，PR 正常 review；默认五标签与中文约定见 `docs/agents/`。`AGENTS.md` 是公开的项目初始化约定，已随源码保存。获授权的 Ralph 本轮已结束；#5 剩余工作按用户决定暂缓，不自动恢复循环、另拆票或扩展 backlog。新数据定义、依赖、合同、付费调用和发布/分享权限变更需先确认。
