# 执行验证记录

**首版业务功能与真实 SDK/UI 链路已实测；独立审查 Closure 未完成，不宣称全部工程验收已关闭。** 数据为 Savills 2024 / 2025 年末历史快照，不是最新/实时行情。

来源：[Issue #1](https://github.com/liu-qingyuan/london-office-monitor/issues/1)、`docs/spec.md`、`docs/contracts.md`。审查 fixed point 为 `d1cf15b`；记录日期 2026-10-10 Asia/Shanghai，执行文件使用 UTC。

## 验证结果

| 项目 | 实际输入/命令 | 结果与边界 |
|---|---|---|
| Python | `.venv/bin/python -m unittest discover -s tests -v` | **25 项通过**。真实 localhost HTTP 与 MCP stdio；金额/时期错绑、缺失/冲突/零基数、quoted value、工具参数、账户环境等公开 Seam 覆盖。合成输入只在临时目录/内存中，不是模型实测。 |
| Python 来源核验 | 两份报告的 `Market().verify_source(...)` | 2024 的 5 条、2025 的 7 条短摘录全部匹配，11 个源值与摘录解析一致。不是最新报告发现，也不自动证明全部元数据或定性叙述。 |
| 前端构建 | `cd frontend && npm run build` | TypeScript 与 Vite production build 通过。主 bundle 较大有 warning；无生产性能承诺。 |
| 离线地图 E2E | `cd frontend && npm run test:e2e` | **6 项通过**，真实 Python API、独立 Chromium/SwiftShader WebGL2、interleaved shared canvas、真实鼠标悬停/点击、时期/指标/详情/原文、缺失及底图失效；**不调用模型**。正常与失效地图两场景还连续重复三次通过。 |
| 独立项目重建 | 仅复制 tracked/staged 源码，新 .venv/node_modules：`uv sync --frozen --python 3.12`、tests、`npm ci`、build、`serve --no-agent` | 新环境依赖、production UI 与真实 HTTP 通过，City 为 105.26、Canary Wharf 为 null。副本/自建进程清理。**同主机与缓存，不是跨 OS/容器验收**；最新运行见 `clean-environment.json`。 |
| 官方 SDK 登录/模型 | `london-office status` / `models` | 独立 profile **authenticated:true, subscription**；配置的 `gpt-6.1-sol` 在可用模型列表。凭据只由 SDK 管理，未读取或复制认证文件；无 API key fallback。 |
| 真实 CLI/SDK | `scripts/live_smoke.py` 与定向真实 probe | City/West End prime +6.75%/+5.78%、机构 +6.1% 差异、两期原文及 City vacancy −0.9 个百分点均核验。**原三轮 CLI run 第三轮被 guard 拒绝，原记录保留，不能称整次脚本已通过**。 |
| 真实网页多轮 | `node scripts/live_ui.mjs` | **两轮实际 POST /api/chat 通过**，City overall vacancy −0.9 个百分点、Canary Wharf prime null/missing；真实 compare_periods/market_query，保持相同 SDK session_id，显示 run_id、解释、工具与证据。未 mock、未重试。 |
| 五页英文演示 | build_slides + dedicated Chromium print | PPTX/HTML/PDF 各恰好 **5 页**，PPTX 5 组 notes；共用 Market Interface 数值/计算，真实地图截图。五页打印截图检查，功能模型状态有实际证据后才标 Verified。 |

真实模型功能覆盖汇总为 `artifacts/live-verification.json`：**9/10 轮已用，5 个接受回答、4 个拒绝回答**。元数据查询不计模型生成；一次 SDK 交互可以有多次模型/工具请求，轮次不是 token/费用上限。当前停止模型调用，保留失败，不用全部通过的美化计数。

## 失败、定位与回归

1. **地图首次点击**：旧版在可拾取 local style 上再切 remote style，首次 West End 鼠标点击曾失败；改为先加载最终 style 再挂 deck。真实点击与底图失效各连续三轮通过，没有替换成列表点击。
2. **数值错绑 High**：旧 prose 白名单允许把年份 £2025 或其他区 £166.61 写为 City 租金。保留这些真实攻击文本及中英拼写金额/warnings 旁路，RED 后修复；模型文本只做定性解释，数字和其区域/指标/时期/单位/来源绑定由本轮 Python 对象展示。定性语义不是自动证明，需人工审阅。
3. **MCP 路由阻断**：首两次真实请求无业务工具，回答拒绝。只查本项目 SDK inventory，确认六工具 connected；stderr 明确 `code-mode host is disabled`。0.162.0 使用内部 host 路由 MCP，恢复 host 后**同一真实问题**实际执行 Python 工具并得到 City 105.26。模型 code_mode/js_repl/shell/browser 等仍禁用；不是另一模型运行时。配置回归覆盖 host 开启与模型执行能力禁用。
4. **缺失解释误拦截**：真实第三轮曾报 unsupported_number；另一次定向实测捕获确切文本“缺失…不代表租金为零”，被误当作零值声明。用原始输出重现，允许否定零值的缺失原则，仍拒绝“租金为零”的正面数值声明。聚焦回归与当前两轮真实 UI 通过。

固定配置依据 [0.162.0 官方 schema](https://github.com/openai/codex/blob/rust-v0.162.0/codex-rs/core/config.schema.json)。SDK 工具禁用表不来自个人配置；真实工具 inventory、路由失败和成功输出是本地证据。不是只根据 schema 声称权限链验证完毕。

## 工程审查与未关闭事项

Standards reviewer `9a2ceec0-5d18-4ed` 与 Spec reviewer `3cf80a80-fb79-498` 均方向 **accepted**，但发现数值错绑 High。主流程已补 RED/GREEN 回归并修复。冻结 changed-files 后只运行一次 Clean，删除旧 `_numbers` 与未用 imports，范围前后一致。

Focused Closure 并行 resume 原 reviewers 均返回 **Agent not found（已清理）**。本轮四次 review 调用预算已用完；没有替代 reviewer/第三轮全量 review，因此独立 Closure **未完成**。后续实时诊断修复由公开测试与实际调用验证，但不伪称 reviewer 重新确认。Issue #1 保留打开供人类复核，不自动启动 Ralph/批量 backlog。

未声称：跨机器/跨平台完整验收、最新市场/实时新闻、精确报告 GIS、建筑级指标或 3D、全自动报告入库、模型所有语义无误、其他运行时已实现。

## 证据与交付边界

- `artifacts/source-verification.json`：官方 URL、执行时间/hash、12 摘录匹配。
- `artifacts/playwright-results/results.json` / `report/`：六个离线真实浏览器用例；`london-map.png` 为实际地图。
- `artifacts/clean-environment.json`：新环境命令/exit code/真实 HTTP/零模型调用；`.log` 是本地完整输出，不默认打包。
- `artifacts/live-smoke.json`：保留原三轮脚本的两次成功和最后拒绝；`live-ui.json`：当前真实双轮网页；`live-verification.json`：功能覆盖与失败计数汇总。
- `artifacts/model-debug/`、`var/runs/`：原始诊断/工具/拒绝输出，仅本地，不进入默认包；不是 fixture 冒充模型。
- `artifacts/presentation/`：五页产物与展示状态 JSON。状态声明不能自证通过，截图也不替代实际模型工具证据。

无认证文件、个人 Codex/Pi 配置、测评原附件或完整第三方报告进入源码/默认包。Google Drive 接收者/分享权限仍待确认，未上传。公开包由评审方配置自己的账户运行，不提供公网托管 Agent。
