# Agent 展示回归资料

`city-rent-recorded-run.json` 来自用户实际运行 `03856fc9-2409-43f4-a2df-97bb9c62e37d`（2026-10-10）。保留原问题、Canary Wharf / Grade A / 2024-YE 地图 context、City prime 两期事实、原模型定性回答及该次 `compare_periods` 的实际业务输出。

旧 HTTP 回答只含 tool name/arguments/ok。这个明确标记的重放 fixture 在同一次 tool_calls 中加入本地真实 tool_events 的 `output`，作为本轮 DTO 扩展的期望值；不是重新生成的 AI 回答。Python 回归经过真实 `grounded_answer`，且逐个核对当前 `BusinessTools.call` 的输出。浏览器只在测试中重放这条响应，不给实际应用新增 replay/mock 模式。

没有凭据、SDK 原始事件、账户信息、usage 或完整报告。数值和短摘录归 Savills；仅用于引用和回归，保留原出处。不把 fixture、截图或 offline 缺失用例计作新的模型实测或用户验收。
