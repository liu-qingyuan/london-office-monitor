# 首版 Interface 与数据合同（v1）

首版 Market 保留 JSON/GeoJSON 快照、JSONL 工具证据及原三个 HTTP 入口。用户另已批准小步接入显式来源发现、独立 JSON 候选池和隔离工具权限，不走新增 Spec／Tickets／Ralph。以下是跨 Module 合同；Codex 内部对象不进入业务结果。HTTP 仅绑定 localhost，界面和 HTTP 同源。

## 数据与口径

`area_id` 固定为 `city`、`west_end`、`canary_wharf`、`midtown_fringe`。前两者只有 Savills 原文的 City / West End 市场口径；后两者不借用其他机构或相邻子市场的数值。

`metric` 首版为 `prime_rent`（Savills average prime achieved rent，不是 top / headline rent）、`grade_a_rent`（average Grade A rent）、`vacancy_rate`（overall market vacancy，不是 Grade A tower vacancy 或 availability）。

`period` 为 `2024-YE`、`2025-YE`，显示为 year-end reported values。租金报告值的统计窗口没有进一步说明，不假定是某一季度成交平均；租金原文单位为 £/sq ft，计费周期未明示，不自行补写 per annum。

每个 observation：`id, area_id, source_area, metric, period, value, status, unit, definition, billing_period, source_id, evidence_id, data_kind, spatial_granularity`。`status` 为 `available | missing | conflict`；缺失/冲突的单一展示值是 `null`。真实记录的 `data_kind=historical_market`；测试 fixture 不装入正式快照。`spatial_granularity=submarket`，没有建筑级市场值。

每个 source：`id, publisher, title, url, published_at, report_period, retrieved_at, verification_status, usage_note`。每个 evidence：`id, source_id, section, quote`。`verification_status=reviewed_excerpt` 仅表示摘录人工核对过，不表示实时重新抓取。

## GET /api/catalog

返回：

```json
{
  "schema_version": 1,
  "areas": [{"id":"city","name":"City","center":[-0.089,51.516],"definition":"Savills City market; exact extent unpublished","geometry_status":"illustrative"}],
  "metrics": [{"id":"prime_rent","label":"Average prime rent","unit":"GBP/sq ft","definition":"Average prime achieved rent; not top/headline rent. Billing period not stated.","change_unit":"%"}],
  "periods": [{"id":"2024-YE","label":"2024 year-end","as_of":"2024-12-31"},{"id":"2025-YE","label":"2025 year-end","as_of":"2025-12-31"}],
  "limitations": ["Historical snapshots, not a live market feed."],
  "agent": {"runtime":"codex-python-sdk","enabled":true,"model":"gpt-6.1-sol","auth_mode":"subscription"}
}
```

`agent.enabled` 表示服务器允许使用该 Adapter，不意味着已经登录或完成模型实测。`agent.discovery_configured` 表示已指定候选发现预算文件，不证明登录、剩余配额或实测通过。`discovery_topics:[{id,label}]` 来自 Data 的 topic 目录。启动 UI 不自动消耗模型额度。

## GET /api/market?metric=prime_rent&period=2025-YE&area=city

`area` 可省略（四区），未知区域/指标/时期返回 422，不回退到其他口径。结果字段：

- `schema_version, metric, period, unit, definition, observations, sources, evidence, comparisons, notes, geometry, warnings, dataset`。
- `observations` 包含所选区域每区一个展示 observation；缺失/冲突由 Python 标记，不用 0 替代。
- `comparisons` 为 Python 计算列表：`id, area_id, metric, previous_period, current_period, previous_value, current_value, change_value, change_unit, status, source_ids, evidence_ids, reported_change_pct, warnings`。
- 租金 change_value 是 `(current / previous - 1) * 100` 四舍五入至两位；空置率是百分点差，不以相对百分比替代。前一期或当前缺失、基数为 0、定义/机构/单位/空间粒度不一致时不计算。值为 0 只在原文确有 0 时成立。
- 机构公布同比与根据快照计算的变化分开保存。相差超出公布精度的舍入容差时提示 `reported_growth_mismatch`，不静默修改历史值或猜测原因。
- `notes` 是带日期和 source/evidence ID 的报告事件/需求驱动：`id, title, period, area_ids, kind, summary, source_id, evidence_id`。不称为实时新闻流；跨伦敦事件不能伪装成某一单栋建筑事件。
- `geometry` 是 GeoJSON FeatureCollection；feature.properties 含 `area_id, name, geometry_status:"illustrative", note`。这些手绘区域只用于点击选择，不代表报告覆盖或行政界线。
- `dataset` 含 `label, data_kind, as_of, last_reviewed_at, is_live:false`。

HTTP 结果中的数字、比较及事实面板都由同一 Python Market Module 生成。前端不重新计算增长率。

## 可视化导航（不扩展业务数据合同）

- 右侧默认完整图标列；hover/focus 仅在同一条玻璃栏展开名称，移开收窄，明确点击才进入内容。没有单一 orb 或独立弹出菜单，导航与内容状态独立。小屏为相同图标的水平可滚动栏，触屏第一触显示名称、下一触选择；键盘和 Escape 可操作。展开导航不改指标，打开任何导航/板块不发送模型请求。
- 九板块只是信息布局，不表示新增指标或已实现完整测评覆盖。Rents 使用原 prime / Grade A；Vacancy 使用原 overall vacancy，不替代 availability。Map layers 仅选择现有指标镜头，并说明真实城市背景与示意区域。
- Leasing / Supply / Demand / News 按 Python `notes.kind` 展示既有历史报告 context，不由前端再分类或推算为量化序列。来源原本是 Central London scope 时不展示为当前地图选中区的统计。
- 未接入的指标/新闻流明确显示 Not connected。该接入状态不创建 observation，不等同于 Python 的 missing/conflict，更不使用 0、估值或虚构趋势。

## POST /api/chat

输入：`{question:string, session_id?:string, context?:{area_id?:string,metric?:string,period?:string}}`。问题长度 1–2000；不存在的会话、区域或口径是显式错误。单会话一次只运行一轮；首版会话仅保存在内存中，服务器重启后失效。

成功结果：`{schema_version:1,session_id,run_id,status:"completed",answer,facts,calculations,sources,evidence,notes,warnings,tool_calls}`。

- `answer` 是模型基于工具证据的**定性解释**；模型自己的 `answer/warnings` 文本不能重写金额、比例、年份或日期等数值（包括拼写数量）。所有数字及其区域/指标/时期/单位/来源绑定仅在 Python 生成的事实、计算与来源对象中展示。这样防止把已见过的年份或其他区域数字误绑成价格。事实/计算卡片从本轮工具返回构造，所选对象的全部来源引用需验证。定性语义仍是 AI 解释，不承诺自动证明每一语义断言。
- `facts` 是上述 observation；`calculations` 是上述 comparison；`sources/evidence/notes` 同上。
- `tool_calls` 是实际 Python 工具执行：`{name,arguments,ok,output}`。`output` 是该次只读工具事件的原始业务 JSON（失败时保留该次业务错误），不是由模型编写，也不是从选中的 `facts` 重建。浏览器显示返回摘要，并可展开精确输入/完整输出；SDK 事件、配置、凭据、trace 路径和账户信息不进入此对象。旧保存的 v1 回答没有 `output` 时，前端明确表示不可用，不伪造工具结果。新增字段不改变请求、endpoint、工具权限或数值 guard；完整本地运行记录仍只在 JSONL（`var/` 不提交）。
- 地图 `context` 仅是选中范围；明确的 `question` 优先。界面按实际返回的 `facts/calculations` 标出回答范围，保留提交时问题/选择，不把以后变化的地图选择当成旧回答的查询范围。默认展示 Python 数值/单位/时期/比较与来源；模型定性解读单独标注。
- 工具未执行、结构化回答不合法、引用不在本轮证据中、出现无证据数值、未登录、账户模型不可用、运行超时或预算耗尽均返回清晰错误；不以离线模板伪装模型回答。
- `status:error` 的响应包含 `error:{code,message}`，不泄漏 SDK 原始配置或凭据。

## 允许的 Python 业务工具

此处权限约束的是应用里的普通市场问答，不是编码 Agent或下述显式发现 profile；开发角色与任务范围见根 `AGENTS.md`。正式研究接纳／自动发布仍没有执行授权。

`market_catalog()`、`market_query(area, metric, period)`、`compare_periods(area, metric, previous_period, current_period)`、`market_brief(period, area?)`、`source_details(source_id)`、`verify_source(source_id)`。只读，通过项目内 MCP 暴露；精确批准这些工具，禁止 shell、web search、个人 MCP、外部 Agent。

`verify_source` 只抓取快照白名单中的官方 HTTPS URL、检查短摘录是否仍在原文、记录时间/hash 和缺失摘录。不得接收任意 URL，不自动覆盖快照或保证新报告已经入库。数据更新通过显式 CLI 校验；新增机构/统计定义需按合同确认后再加入。

## 来源候选：GET /api/discovery

只读已保存库存，不搜索、不调用模型、不刷新正式行情。返回 `{schema_version:1,data_kind:"source_candidates",topics,candidates,runs,source_count,occurrence_count,warnings}`。八个 topic 为 rents、vacancy、leasing、supply、submarkets、macro、demand、news；每项包含 id、label、status、source_count、completed_searches。状态为 not_searched、metadata_collected、metadata_unavailable、partial、failed、not_executed，描述执行／metadata，不证明内容、时间或市场覆盖。已完成搜索但零候选的 run 使用 completed_no_candidates；其 completed_searches 仍计入已完成执行，metadata_unavailable 不等于市场缺失或零值。完全相同 URL 去重；片段、镜像及未核验 canonical 不合并，所有出现保留。

Candidate 为 `{id,url,title,snippet,date_hint,content_basis:"search_metadata",verification_status:"unverified_search_metadata",source_geography:{status:"not_verified",granularity:null},requested_topics,occurrences}`。标题／日期可以为 null；日期只是索引 hint，不是核验后的发布日期。occurrence 保留 run_id、provider、query、topic_ids、provider_path／position、provider_query、原 URL／标题／snippet／日期及 ref_id、thread_id、turn_id、tool_item_id；原生 batch query 可为字符串列表，不能推断每个结果属于其中哪条 query。短 ref 只在其完整执行范围内有效。run 保留 provider、用户意图 context、状态、时间和安全错误；选择区不写成候选 area_id。

## 显式来源发现：POST /api/discovery

输入 `{question,topic_ids?:string[],context?:{area_id?:string}}`，不接受 key、预算路径、session_id 或任意工具名。问题 1–2000 字符，topic 1–8 项、已知 ID；默认八项意图，UI 使用 Data 目录。只有明确提交 Discover sources 才启动；普通问答、missing、切区、打开导航／候选池或后台不会触发。关闭面板不取消已提交请求。

同一 CodexAdapter 创建临时发现 thread，不用于普通会话。原市场六工具保留 Web Search disabled；发现 profile 只允许 `google_search_sources(query)` 和 native Web Search，禁 shell／代码工具／个人 MCP／多 Agent。Google 只调用 SerpAPI Google endpoint、第一页 index metadata；保留完整响应，不取固定前 N 条。确认 Active Free Plan、价格为零、可用额度后才发 search，拒绝未知／付费配额、重定向、自动重试、升级及 endpoint fallback。不自动获取源网页全文或商业 PDF。

`LONDON_DISCOVERY_BUDGET_FILE` 必须指向已有、另行获准的本仓库专用 receipt；不会自动创建、续约或重置。当前 receipt 上限 Google 8 个搜索 HTTP starts、Codex 3 个调用方轮启动（native discovery 2＋market validation 1）；失败／超时占已开始额度，原生内部 HTTP、token／费用与覆盖未知。同一配置的普通 chat 验证也计入 market 子额度。Google 每个发现请求一次尝试，跨 MCP 重连用 receipt 保留限制；原生 search-only，最多两个可观察工具项／query，越界通知触发 interrupt，不能声称阻止了未知内部请求或强制两工具选择。原生 results 是 SDK 可见不透明 metadata，不是 Google 原始 SERP。

结果 `{schema_version:1,data_kind:"source_discovery",run_id,status,assessment,assessment_basis:"ai_generated_source_screening",selected_candidate_ids,pool,provider_states,tool_calls,warnings}`。status 为 completed_metadata_only（本轮两个通路都有实际完成与候选 metadata）或 partial；原生 provider state 包含可观察开始／完成项数、捕获 URL 出现数以及 `http_request_count:null`。筛选 URL 必须绑定本轮实际捕获的 metadata，AI assessment 保持定性；完整库存与模型选中集合分开。工具失败、权限越界、无法绑定回答、超时／配额错误都保留实际证据，不冒充市场无资料，不更新 observations／几何或授予发布权限。

## 持久化与认证

- `data/snapshot.json`：版本化 source/evidence/observations/notes/catalog；`data/areas.geojson`：独立的示意选择几何。
- `var/runs/*.jsonl`：Python 工具执行证据；发现的 typed SDK journal、输入、响应／失败在 `var/runs/discovery/<run>/`。不提交、不放入默认发布包。测试证据经审阅后另行导出脱敏版本。
- `var/discovery/records/*.json`：schema_version=1 的不可覆盖来源运行记录（data_kind=source_candidate_run、recorded_at、run、occurrences），发布完整记录后才可读；`evidence/<run>/` 保存已脱敏请求、Google 完整 metadata JSON 与执行证据。库存每次重读，不需要 Market 重启；与正式 snapshot／前端 Market 缓存独立。可用 `LONDON_DISCOVERY_DIR` 指向专用运行目录，不引入数据库。
- SerpAPI key 只由后端处理。直接 CLI 与应用父后端优先使用显式 `SERPAPI_API_KEY`；仅 macOS 可复用既有专用 Keychain service，不在其他系统运行 macOS 命令、不查找其他个人凭据或配置。应用发现 MCP 通过请求级认证 loopback JSON 桥接调用父后端的 Google 工具，实际 key 不进入 SDK 配置、MCP 环境／命令参数、模型或 UI，`SERPAPI_API_KEY` 仍显式清空。桥接绑定 `127.0.0.1` 动态端口，仅接受有界 `{query}`，短期 capability 不能获取 key、改变父后端拥有的预算／topic／context／request ID；禁止代理、重定向与自动重试。启动失败、timeout、完成／异常与 Adapter.close 均关闭监听，已开始的外部调用不恢复额度。普通市场 profile 不使用桥接，HTTP／业务工具 DTO 保持不变。Free quota 只保存白名单字段；原始 account body／邮箱不传给模型，JSON／URL 编码的 key 回显仍在保存／返回前拒绝。
- receipt JSON 继续使用现有字段与原子替换，明确 UTF-8；内部 `.lock` 在 POSIX 使用 `fcntl`、原生 Windows 使用 `msvcrt` 单字节互斥。不删除锁、自动生成或重置 receipt 来获得平台兼容。候选池需要支持硬链接的本地文件系统（通常为 macOS／Linux 本地文件系统或 Windows NTFS），保留不可覆盖、完整记录才可见的语义。
- Google HTTPS 默认遵循标准代理配置（如 `HTTPS_PROXY`）；显式 `LONDON_SERPAPI_PROXY` 可覆盖，空值表示直连。不固定个人机器代理端口；Google endpoint、Free Plan 检查、预算、禁重定向／重试不变。详细实现取舍见 [ADR 0003](adr/0003-portable-discovery-backend.md)。
- Codex home 位于仓库外专用目录；SDK 管理自己的登录，代码不读凭据文件、不拷贝个人 config。
- API key 是明确选择的独立计费认证方式；订阅模式阻止继承环境中的 API key，绝不自动回退。首轮会话开始前通过 SDK 的 models() 核验账户可用模型。
