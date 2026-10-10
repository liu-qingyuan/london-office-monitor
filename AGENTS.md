# 项目工作约定

这是伦敦写字楼市场监测 PoC。正式仓库只包含项目代码、可公开的数据摘录和验证材料；不包含测评原附件、个人配置、凭据或完整第三方报告。

先读 `README.md` 的实施入口与当前状态，再完整读取当前 Ticket 正文和评论。实现前读 `GLOSSARY.md`、相关 `docs/adr/` 和 `docs/contracts.md`，按 README 的 Module 导航定位。开始修改前明确目标、所属 Module、任务范围、必须保持的 Interface、验证入口与已知失败；不要求读完整仓库，也不把已有 RED 当作无法修复的前置障碍。

数值计算由 Python 完成；应用里的市场 Agent 只使用已授权工具的证据。历史、真实市场、示意几何和测试 fixture 必须分别标注。缺失不是零；不同指标口径不可混合。

## Agent skills

### Issue tracker

GitHub Issues only；PR 不进入 triage 或 Ralph。见 `docs/agents/issue-tracker.md`。

### Triage labels

使用 `needs-triage`、`needs-info`、`ready-for-agent`、`ready-for-human`、`wontfix`。见 `docs/agents/triage-labels.md`。

### Domain docs

单 context：根目录 `GLOSSARY.md` + `docs/adr/`。见 `docs/agents/domain.md`。

## 角色与权限

- **编码 Agent**：默认拥有完整开发工具权限，可在授权任务内自主读写项目文件、执行命令、测试和调试，不需要为普通开发操作逐项申请。不继承应用 Agent 的只读或禁 shell 限制；实际工具与系统权限由宿主提供，本文件不提升操作系统权限。工具权限不等于扩大当前任务范围。
- **应用里的市场 Agent**：是本项目构建的业务助手，只能调用 `docs/contracts.md` 批准的六个只读工具。禁用 shell、个人 MCP、web search 和多 Agent；不能修改代码、正式数据或自动发布研究结果。术语中的发布策略是设计概念，不是当前能力或授权。

## 安全与验收

只操作本仓库及其专用运行目录、进程和测试浏览器。不访问其他项目的进程、数据库或浏览器。禁止读取、复制或提交认证文件或个人 Codex 配置；认证由 SDK 在仓库外专用 Codex home 管理。

新依赖、Interface 或持久化合同变化，以及付费调用、发布/分享权限变化和破坏性操作，需要用户授权。不自行启动 Ralph 或批量创建 backlog；提交／推送按当前任务的明确授权执行，不顺手接管其他修改。当前工作固定在 `main`，不新建分支或 worktree，除非用户另行明确改变此约定。

最新预算见 `docs/specs/map-performance.md`，当前结果与证据见 `docs/verification.md`。使用已有检查入口，不另建性能框架。捕获超预算症状后，先保留真实输入并建立最小复现、做定向 profile，再继续修改；普通编辑跑最短必要验证，完整回归用于阶段收尾，不靠放宽超时或删除必要覆盖达标。

交付前分别报告离线业务测试、真实地图融合/端到端测试和实时模型实测；fixture、stub、历史 GREEN、类型检查或设计图不能代替最新产品验收。验证证据保留真实输入与执行记录，不包含凭据。
