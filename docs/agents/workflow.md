# 工程 skills 工作流

## 来源与范围

使用本机已有的全局工程 skills；同步来源是 [skills-sync-lqy](https://github.com/liu-qingyuan/skills-sync-lqy)，对齐版本 [c584fe1](https://github.com/liu-qingyuan/skills-sync-lqy/commit/c584fe11bdaf7f8504b840105bf7ffe89af7ed59)。从当前 skills 列表的实际路径读取并执行对应 `SKILL.md`，不预设宿主或子 agent 工具名。

项目 `skills/market-monitor` 和 `skills/evidence-check` 是应用内业务规则，不用工程 skills 覆盖，不扩大应用市场 Agent 权限。项目 Feature 工具与当前来源已一致，不覆盖业务记录。

其他开发环境尚未安装时使用标准入口，选择所需可安装版本；不复制 mirror 或中文 baseline：

```bash
npx skills@latest add liu-qingyuan/skills-sync-lqy
```

## 规划与实施

`to-spec-lqy → to-tickets-lqy` 共用任务图：保留纵向切片与真实依赖，指出安全独立的 frontier、共享契约及文件/测试资源风险。发布后停止，等待用户明确选择实施入口。

- 单 Ticket：`implement-lqy`。
- 默认批量入口：`ralph-plan-lqy`，逐票处理；仅在用户明确授权启动时运行。
- 可选子 agent 入口：`implement-spec-subagent-lqy`，用户授权可由主流程派发；工作区按项目约定选择，worker 可做范围内的只读查证，单一整合者负责正式 review 与交付。

**项目约定优先**：当前固定 `main`，不新建分支或 worktree，不恢复已暂缓阶段或自动启动 Ralph。明确不相交的小任务可按既有同 worktree 规则并行；最终 review、完整测试/构建与 Git 交付前须结束或协调暂停共享写入。若确需独立 worktree，仍须用户另行允许调整当前约定。此次同步不启动实施。详见 `AGENTS.md` 和 [Feature 规则](feature-docs.md)。
