# 交付可运行的伦敦写字楼监测 PoC

## 已确认范围

Python Agent PoC 和 5 页英文业务演示文稿是必交；地图为额外成果。截止为 2026-10-12 09:00 Asia/Shanghai。用户批准公有 GitHub 仓库 `liu-qingyuan/london-office-monitor`、正式目录、依赖安装、v1 Interface 与 JSON/GeoJSON/JSONL 持久化、登录。优先订阅，实测最多 10 个交互轮次，不自动选择 API key 或付费数据。

首条纵向切片使用 Savills 2024 / 2025 年末报告的 City / West End 平均 prime rent；同一快照补充已核验的 Grade A rent 和 overall vacancy。其他两区保持缺失。地图示意不是统计覆盖。详细合同见 `docs/contracts.md`。

## 验收

- [x] Python 查询、比较、证据追溯、缺失和冲突通过公开 Interface 的自动测试（25 项）。
- [x] 官方 Codex Python SDK 在独立登录目录中多轮交互；真实 Python 工具、来源和缺失证据保留（CLI 功能案例及当前 UI 双轮）。
- [x] 地图使用 deck.gl + MapLibre，真实悬停/点击、指标/时期切换、详情、两期趋势和 Agent 结果一致（6 项离线 E2E + 真实模型 UI）。
- [x] 历史、建筑底图、示意几何和测试 fixture 分别标记，不声称实时办公室市场数据。
- [x] 5 页英文业务演示、真实截图、说明、固定依赖、来源/使用和验证材料已生成。
- [x] 同主机干净项目环境重建依赖、离线运行并验证；不声称跨平台，评审方需自行认证。
- [x] 架构、时序、状态、类图的当前/目标 8 张图解释变化；下文“当前”特指实施前 fixed point `d1cf15b` 的设计基线。
- [ ] 独立 Focused Closure：原 reviewers 被清理后无法 resume，未自动视为已关闭；本 issue 保持打开，见 `docs/verification.md`。
- [ ] Google Drive 接收者/分享权限确认及上传。

## 架构：当前

```mermaid
flowchart LR
  User["业务用户"] --> Absent["正式项目尚无可运行结构"]
```

## 架构：目标

```mermaid
flowchart LR
  UI["Application UI"] --> HTTP["HTTP Interface"]
  HTTP --> Market["Market Module"]
  HTTP --> Adapter["Codex Adapter"]
  Adapter --> Runtime["官方 Codex SDK"]
  Runtime --> MCP["项目只读 MCP"]
  MCP --> Market
  Market --> Data["Data Module"]
  Data --> Snapshot["JSON / GeoJSON 快照"]
  Data --> Official["白名单官方来源摘录校验"]
```

## 时序：当前

```mermaid
sequenceDiagram
  actor User as 业务用户
  participant Absent as 尚无正式应用
  User->>Absent: 查询市场
  Note over Absent: 当前没有请求或工具调用流程
```

## 时序：目标

```mermaid
sequenceDiagram
  actor User as 业务用户
  participant App as Application
  participant Adapter as Codex Adapter
  participant Runtime as Codex SDK
  participant Market as Python Market
  User->>App: 问题和地图上下文
  App->>Adapter: ask
  Adapter->>Runtime: 受限线程 run
  Runtime->>Market: 项目 MCP 工具调用
  Market-->>Runtime: 数值、Python 计算、原文证据
  Runtime-->>Adapter: 结构化解释
  Adapter->>Adapter: 校验引用和无证据数值
  Adapter-->>App: 业务结果和工具执行记录
  App-->>User: 解释、事实、来源、缺失/冲突
```

## 状态：当前

```mermaid
stateDiagram-v2
  [*] --> Absent
  Absent: 当前没有正式会话生命周期
```

## 状态：目标

```mermaid
stateDiagram-v2
  [*] --> OfflineReady
  OfflineReady --> LoginRequired: 请求 Agent
  LoginRequired --> Ready: SDK 登录成功
  Ready --> Running: 用户提问
  Running --> Answered: 工具执行且回答通过校验
  Running --> Failed: 未登录或超时或证据校验失败
  Answered --> Ready: 可继续追问
  Failed --> Ready: 明确错误且不伪造回答
  Ready --> Closed: 结束会话
  Closed --> [*]
```

## 类图：当前

```mermaid
classDiagram
  class Absent {
    当前没有正式类或Interface
  }
```

## 类图：目标

```mermaid
classDiagram
  class Snapshot {
    +load()
    +source()
    +verify()
  }
  class Market {
    +catalog()
    +query()
    +compare()
    +brief()
  }
  class CodexSession {
    +ask()
    +close()
  }
  class Application {
    +catalog()
    +market()
    +chat()
  }
  Market --> Snapshot
  CodexSession --> Market : 项目MCP工具
  Application --> Market
  Application --> CodexSession
```

首版不包含后台调度、第二运行时、付费市场/地图服务、精确子市场 GIS 或建筑级指标。没有自动 backlog/Ralph；本 issue 只保存已授权交付的单一 spec。
