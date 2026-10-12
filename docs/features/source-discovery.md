---
{
  "paths": [
    "london_office/source_pool.py",
    "london_office/discovery.py",
    "london_office/runtime.py",
    "london_office/settings.py",
    "london_office/mcp_server.py",
    "london_office/app.py",
    "london_office/cli.py",
    "tests/test_discovery.py",
    "tests/test_discovery_runtime.py",
    "tests/test_http.py",
    "tests/test_runtime.py",
    "frontend/src/main.ts",
    "frontend/src/types.ts",
    "frontend/src/style.css",
    "frontend/tests/discovery.spec.ts",
    "london_office/discovery_bridge.py",
    "tests/test_portability.py",
    "frontend/package.json",
    "frontend/playwright.config.ts",
    "frontend/tests/market.spec.ts",
    "frontend/tests/research.spec.ts",
    "frontend/tests/vision-sidebar.spec.ts",
    "frontend/tests/left-detail.spec.ts",
    "frontend/tests/cold-start.spec.ts",
    "frontend/scripts/**",
    ".github/workflows/portability.yml"
  ],
  "fingerprint": "sha256:df0ec43621b58a54162795dfcde742c64ee5fec0aaa90d1d2ef0f15606eb4664"
}
---

# 显式来源发现与候选池

保留资料入口及出现证据，与正式历史行情分开；不把检索摘要当成已核验指标。

## 当前行为

SourcePool 保存独立、不可覆盖的 JSON 运行记录，完整保留 URL 出现、查询、通路、thread／turn／工具项及短引用；只按完全相同 URL 去重，不推断资料覆盖。八个 topic 是检索意图，不是已证明的业务覆盖。CLI `sources` 与 `GET /api/discovery` 只读；`collect-sources` 和独立 MCP profile 提供有预算的 Google metadata 采集。现有 Agent 默认仍是六个只读市场工具、禁 Web Search；界面显式选择 Discover sources 后，通过 `POST /api/discovery` 使用同一 CodexAdapter 的临时发现 profile，允许 Google 工具和原生搜索，不复用为普通聊天。查看池、切区、打开导航或输入问题均不自动发起搜索。SerpAPI key 由直接 CLI／应用父后端读取：三系统可用环境变量，macOS 还可复用既有专用 Keychain。应用发现 MCP 只通过请求级认证 loopback 桥接执行受限 query，不获得实际 key，不改变父后端的预算／topic／context／request ID；启动失败、完成／异常、timeout 与 Adapter.close 关闭监听。SDK／MCP key 环境显式清空。receipt 保留原字段及互斥／原子写入，用 POSIX／Windows 文件锁和 UTF-8；Google 不再固定个人代理端口。

用户明确授权的八维历史研究已经原六工具query／brief和现有八板块接入，不增加工具或模型／搜索权限。普通问答可选择本轮实际Python research record／comparison IDs，要求全部来源并保持数值prose guard；UI将来源地域／实际窗口与地图图表分开，不提供无定位研究的View on map。六项许可限制背景与一项无摘录数量被排除；打开研究／切区不发chat或discovery POST。新来源可source_details读存档，verify_source仍只允许原Savills网络白名单。回归入口另含tests/test_runtime.py、tests/test_http.py和frontend/tests/research.spec.ts；严格SDK模型生成schema要求所有字段required、无研究时空列表，旧回答解析缺research仍兼容。界面状态码按语言显示为标签，不把翻译后的文字当作后台状态码。

当前整合已执行84项Python＋TypeScript、production build与全部62项Playwright通过：原37地图/E2E、7三语/研究实际浏览器及18 i18n/description模块（既有test:e2e、--workers=1隔离验收、原单项时限及retries=0；不是旧60秒check:full GREEN）。移动总览按钮CSS小修后重新完整运行、受测输入hash未变，未用前一版本结果冒充；语言模型仅历史replay/fixture，不称新增三语模型实测。一次新授权普通研究问答真实HTTP200，实际market_brief输出支持8研究记录、2项Python比较及全部5来源；本轮不搜索、不现场核验、不自动更新行情。另一已计数尝试失败及后续独立授权均保留，不续用旧receipt。两个旧UI期望同步到当前英文Metadata unavailable／Conflict，synthetic conflict/原missing及零被动POST覆盖未删；hover两worker失败保留，原case单独/串行通过，不宣称根因已证实。细节与证据范围见docs/verification.md。

离线合同入口为 `tests/test_discovery.py`、`tests/test_discovery_runtime.py`、`tests/test_portability.py` 和 `tests/test_http.py`；SDK／网络 fixture 不能证明实时引擎可用。历史跨平台增量通过54项 Python＋类型检查（quick 2.11秒），包括真实 MCP 子进程→本地桥接→父后端／fixture provider、实际并发预算竞争、无认证的固定 runtime 版本启动、模拟 Windows 锁／缺 Unix 模块、Keychain fixture 复用、拒绝越权／重连与监听清理。npm quick／focused／full 与 Playwright 使用共享平台 Python 路径，不再依赖 Bash，原10／30／60秒截止与覆盖保留。本机6项真实 localhost API／UI smoke（其中 AI 筛选为 fixture）13.88秒通过；地图像素解码的3处旧 Unix 启动路径也统一到同一平台入口，补配置回归 guard（不等于原生 Windows 运行）；保持真实 PNG 输入与原像素／时延断言。修复后真实 Metal 建筑／标签／恢复／missing 聚焦1项14.66秒、1600热态1项12.45秒、1600冷启动1项10.54秒通过；显式 synthetic conflict 的 Python 路径1项9.31秒通过。三系统／两 Python 版本[原生 CI](https://github.com/liu-qingyuan/london-office-monitor/actions/runs/38155388215)已实际6/6通过（`a0c98a5`），每组54项 Python、production build及7项 UI smoke，包含真实平台预算竞争与固定 runtime 版本启动，不只是 Mac 上的平台模拟。

历史 Google 六题和真实 UI 双通路证据仍保留：原生30次 URL 出现绑定 thread／turn／item，AI 筛选与187个不同 URL 字符串／247次出现的全池分开；普通市场真实 compare_periods 未混入发现工具。这些实时轮早于本次跨平台改动及此前收尾安全补丁，不代表当前实现已重新实测。证据及 fixture／历史／实时区分见 `docs/verification.md`。

当前最新12事实增量接纳及News短运行不改变来源发现端点／六工具：Python115项＋类型检查quick2.84秒；真实正式新资料／研究／监测API UI4/4（20.28秒），描述覆盖、八研究页三语和两项发现共存9/9（18.29秒），均原30秒预算。其中AI筛选仍是fixture，原库存GET／监测GET是真接口；发现Google／模型新增调用为0，不将相关回归扩称最新62项全回归。记录在`artifacts/monitoring/20261012-completion/`，来源核验、正式接纳、索引检测与发现权限分开。

## 限制与剩余

来源内容、发布日期、统计口径与地理覆盖尚未核验；候选池含旧资料、URL 变体及偏题结果，不可按数量宣称覆盖。没有数据库、候选池自动接纳／发布、精确地图绑定或源报告全文获取。本轮已授权的一次性研究静态接纳不改变未核验候选的证据状态。历史最小发现任务receipt上限为Google 8次、Codex 3轮（原生2＋市场验证1），不是新任务可用额度。八维/后续验证采用各自明确授权receipt；失败占额度，不借旧余量／自动重试／续约。新增离线监测模块的授权不自动启用真实搜索、抓取、定时或正式数据更新。Google 每个发现请求最多一次尝试，跨 MCP 重连保留限制。原生只记录 SDK 可见 metadata，搜索／查询边界以可观察事件触发中止，无法硬计内部 HTTP、保证所有结果暴露或强制模型调用两种工具；结果按实际完成证据分开呈现。关闭面板不取消已提交请求。候选归档需要支持硬链接的本地文件系统（如 Windows NTFS）。三系统原生离线 CI 已通过；本机原37真实地图/E2E和单个历史研究问答已另有新实测；各平台真实账户／搜索／模型、完整地图与跨硬件性能仍未本轮验证，fixture／启动／UI smoke不代替它们。双轴初审的唯一 High 为上述3处测试路径遗漏，已修复并定向验证；原 reviewer 无法恢复，因此独立 Closure 未完成、clean 未执行，不虚构复核通过。剩余产品验收以最新实测为准，门禁一致不表示通过。
