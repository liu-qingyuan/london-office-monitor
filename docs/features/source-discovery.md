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
    "frontend/tests/left-detail.spec.ts",
    "frontend/tests/cold-start.spec.ts",
    "frontend/scripts/**",
    ".github/workflows/portability.yml"
  ],
  "fingerprint": "sha256:3780e0acd647a3a8cee421d977b80687e668fafe162d0822e2004770cb34ab68"
}
---

# 显式来源发现与候选池

保留资料入口及出现证据，与正式历史行情分开；不把检索摘要当成已核验指标。

## 当前行为

SourcePool 保存独立、不可覆盖的 JSON 运行记录，完整保留 URL 出现、查询、通路、thread／turn／工具项及短引用；只按完全相同 URL 去重，不推断资料覆盖。八个 topic 是检索意图，不是已证明的业务覆盖。CLI `sources` 与 `GET /api/discovery` 只读；`collect-sources` 和独立 MCP profile 提供有预算的 Google metadata 采集。现有 Agent 默认仍是六个只读市场工具、禁 Web Search；界面显式选择 Discover sources 后，通过 `POST /api/discovery` 使用同一 CodexAdapter 的临时发现 profile，允许 Google 工具和原生搜索，不复用为普通聊天。查看池、切区、打开导航或输入问题均不自动发起搜索。SerpAPI key 由直接 CLI／应用父后端读取：三系统可用环境变量，macOS 还可复用既有专用 Keychain。应用发现 MCP 只通过请求级认证 loopback 桥接执行受限 query，不获得实际 key，不改变父后端的预算／topic／context／request ID；启动失败、完成／异常、timeout 与 Adapter.close 关闭监听。SDK／MCP key 环境显式清空。receipt 保留原字段及互斥／原子写入，用 POSIX／Windows 文件锁和 UTF-8；Google 不再固定个人代理端口。

离线合同入口为 `tests/test_discovery.py`、`tests/test_discovery_runtime.py`、`tests/test_portability.py` 和 `tests/test_http.py`；SDK／网络 fixture 不能证明实时引擎可用。本机跨平台增量通过54项 Python＋类型检查（quick 2.11秒），包括真实 MCP 子进程→本地桥接→父后端／fixture provider、实际并发预算竞争、无认证的固定 runtime 版本启动、模拟 Windows 锁／缺 Unix 模块、Keychain fixture 复用、拒绝越权／重连与监听清理。npm quick／focused／full 与 Playwright 使用共享平台 Python 路径，不再依赖 Bash，原10／30／60秒截止与覆盖保留。本机6项真实 localhost API／UI smoke（其中 AI 筛选为 fixture）13.88秒通过；地图像素解码的3处旧 Unix 启动路径也统一到同一平台入口，补配置回归 guard（不等于原生 Windows 运行）；保持真实 PNG 输入与原像素／时延断言。修复后真实 Metal 建筑／标签／恢复／missing 聚焦1项14.66秒、1600热态1项12.45秒、1600冷启动1项10.54秒通过；显式 synthetic conflict 的 Python 路径1项9.31秒通过。三系统／两 Python 版本[原生 CI](https://github.com/liu-qingyuan/london-office-monitor/actions/runs/38155388215)已实际6/6通过（`a0c98a5`），每组54项 Python、production build及7项 UI smoke，包含真实平台预算竞争与固定 runtime 版本启动，不只是 Mac 上的平台模拟。

历史 Google 六题和真实 UI 双通路证据仍保留：原生30次 URL 出现绑定 thread／turn／item，AI 筛选与187个不同 URL 字符串／247次出现的全池分开；普通市场真实 compare_periods 未混入发现工具。这些实时轮早于本次跨平台改动及此前收尾安全补丁，不代表当前实现已重新实测。证据及 fixture／历史／实时区分见 `docs/verification.md`。

## 限制与剩余

来源内容、发布日期、统计口径与地理覆盖尚未核验；候选池含旧资料、URL 变体及偏题结果，不可按数量宣称覆盖。没有数据库、正式行情接纳／自动发布、精确地图绑定或源报告全文获取。当前任务共享预算为 Google 8 次启动、Codex 3 次轮启动（原生发现 2＋市场验证 1）；失败也占已启动额度，不自动重试或续约。Google 每个发现请求最多一次尝试，跨 MCP 重连保留限制。原生只记录 SDK 可见 metadata，搜索／查询边界以可观察事件触发中止，无法硬计内部 HTTP、保证所有结果暴露或强制模型调用两种工具；结果按实际完成证据分开呈现。关闭面板不取消已提交请求。候选归档需要支持硬链接的本地文件系统（如 Windows NTFS）。三系统原生离线 CI 已通过；各平台真实账户登录／搜索／模型、完整地图、所有文件系统及跨硬件性能尚未在本轮验收，fixture／启动／UI smoke 不代替它们。双轴初审的唯一 High 为上述3处测试路径遗漏，已修复并定向验证；原 reviewer 无法恢复，因此独立 Closure 未完成、clean 未执行，不虚构复核通过。剩余产品验收以最新实测为准，门禁一致不表示通过。
