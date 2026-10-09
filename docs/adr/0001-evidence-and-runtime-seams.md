# 将证据、市场计算和 Codex 运行时放在独立 Module

首版采用一个 Python/TypeScript 仓库：数据 Module 拥有来源、摘录校验和快照合同；Market Module 拥有指标定义、查询、比较和缺失/冲突规则；Codex Adapter 独占认证、线程、项目 MCP 与事件/回答转换；界面只消费稳定的业务结果。Codex Python SDK 已有订阅实验依据，但不会复制实验的个人配置读取、模型算术或不完整的环境隔离。

未来可新增 OpenAI Agents SDK + LiteLLM Adapter，但当前没有第二套运行时、切换器或通用插件框架。替换需要验证新 Adapter 的工具调用和结果合同，不宣称无缝切换。

历史观察和示意地理数据使用可审阅的小型 JSON / GeoJSON 快照，不引入数据库。公开报告短摘录只用于证据定位，不再分发完整报告或报告图表。HTTP 和 MCP 使用同一个 Market Interface，避免地图与模型各自维护口径或计算。
