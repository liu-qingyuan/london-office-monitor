---
status: proposed
---

# 四板块按知识归属解耦，资料地理覆盖与地图定位分开

用户已确认地图、数据、搜索和 AI Agent 四个职责板块应独立又可映射：搜索由用户明确请求后交给 AI 执行，结果先更新来源候选展示，正式指标仍经获准获取、核验及发布策略后进入市场视图。采用同一应用内的深 Module，而不是四套运行时或数据库；Data 拥有来源、资料地理覆盖与定位关联，Market 保留口径和 Python 计算，地图只负责空间展示，搜索拥有两条已选通路的发现执行与来源归属，Codex Adapter 继续独占 SDK 与认证。

这是对 ADR 0001 的目标扩展，不改变其证据／计算／运行时归属。定位对象与资料地理覆盖分别记录，不能把 City 当作全伦敦、把示意选区当作统计边界，或把子市场指标分配给选区内每栋楼。

用户的新决定是直接小步实施，不走新 Spec／Tickets／Ralph，使用 Feature 微文档与门禁：先保留任务维度的资料候选并让应用 AI 调用 Google 与原生 Web Search，再逐步完善数据处理；地图映射、街道／区域精度及板块划分后置。来源子切片复用现有 UI、CodexAdapter／认证及 JSON 文件，不建立第二 runtime 或数据库；独立候选池、显式发现 HTTP／Tools、隔离 profile 和有界 receipt 已实现，现行合同见 [contracts](../contracts.md)、[Feature](../features/source-discovery.md)。本批批准 Google 8 个搜索启动、Codex 3 个轮启动；真实双通路和普通市场验证已通过，事实与当前限制见 [架构说明](../architecture/search-data-map-agent.md)。2026-10-12用户明确授权本轮八维研究一次性入库并更新现有应用；研究以版本化快照的admitted_with_caveats层经原query／brief／六工具和八个板块显示。许可受限／缺摘录字段排除，范围与统计窗口不借用地图选择，现行合同见contracts与[本轮接入图](../architecture/eight-dimension-intake.md)。这是明确人工接纳的有限政策，不是候选池或AI自动发布。本ADR的完整空间／自动动态接纳目标仍proposed；来源候选及AI筛选不构成任意定位能力或后续自动发布授权。
