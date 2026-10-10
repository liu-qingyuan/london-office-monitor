# 首版 Interface 与数据合同（v1）

用户已批准 JSON/GeoJSON 快照、JSONL 工具证据及三个 HTTP 入口。以下是唯一的跨 Module 合同；Codex 内部对象不进入这些结果。HTTP 仅绑定 localhost，界面和 HTTP 同源。

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

`agent.enabled` 表示服务器允许使用该 Adapter，不意味着已经登录或完成模型实测。启动 UI 不自动消耗模型额度。

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

此处权限约束的是应用里的市场 Agent，不是编码 Agent；开发角色与任务范围见根 `AGENTS.md`。研究／自动发布目前只是设计概念，没有对应业务工具或执行授权。

`market_catalog()`、`market_query(area, metric, period)`、`compare_periods(area, metric, previous_period, current_period)`、`market_brief(period, area?)`、`source_details(source_id)`、`verify_source(source_id)`。只读，通过项目内 MCP 暴露；精确批准这些工具，禁止 shell、web search、个人 MCP、外部 Agent。

`verify_source` 只抓取快照白名单中的官方 HTTPS URL、检查短摘录是否仍在原文、记录时间/hash 和缺失摘录。不得接收任意 URL，不自动覆盖快照或保证新报告已经入库。数据更新通过显式 CLI 校验；新增机构/统计定义需按合同确认后再加入。

## 持久化与认证

- `data/snapshot.json`：版本化 source/evidence/observations/notes/catalog；`data/areas.geojson`：独立的示意选择几何。
- `var/runs/*.jsonl`：Python 工具执行证据；不提交、不放入默认发布包。测试证据经审阅后另行导出脱敏版本。
- Codex home 位于仓库外专用目录；SDK 管理自己的登录，代码不读凭据文件、不拷贝个人 config。
- API key 是明确选择的独立计费认证方式；订阅模式阻止继承环境中的 API key，绝不自动回退。首轮会话开始前通过 SDK 的 models() 核验账户可用模型。
