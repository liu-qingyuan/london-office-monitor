# 八维历史研究接入现有应用

2026-10-12 用户明确授权本轮八维研究入库并直接更新现有应用。复用 Data → Market → HTTP/六个只读工具 → Workspace 的既有 Module；不新增应用、数据库、依赖、工具名或搜索／模型调用。不设自动发布任务。

数据合同按加法扩展：原租金／空置 observation、四个示意选区与比较保持原状；快照新增 `research`，同时由 Market query/brief 返回。研究包含两期与其他明确窗口，**独立于地图选择和地图 YE 筛选**。真实年度流量、季度背景、存量、预测、UK/样本背景和事件分别表达。Source geography 不推导 area_id，forecast as_of 不借用发布日期。

许可受限与缺保存摘录的字段只入 exclusions，不发布对应数值或引文。Newsletter的HTTP文章参考不作为发布来源/日期；原始图转录保留定位和方法限制，不声称图像hash核验。普通模型可通过既有 `market_brief` 选取本轮工具返回的研究ID；数字仍来自Python，必须完整引用其来源。原 `verify_source` 的两份Savills文档网络范围不扩大。

## 架构／调用关系：当前

```mermaid
flowchart LR
  S["版本化历史快照"] --> D["Data / Snapshot"]
  D --> M["Market"]
  M --> H["HTTP / 六个只读工具"]
  H --> W["Workspace / 地图与报告 context"]
  H --> A["Codex Adapter / 原数值引用 guard"]
  R["八维私有研究 dossiers"] --> P["独立审阅预览"]
```

## 架构／调用关系：目标

```mermaid
flowchart LR
  R["八维研究 / 用户明确接纳"] --> I["本轮人工整合 / 排除受限材料"]
  I --> S["同一快照 / observations 加 research"]
  S --> D["Data / 引用与字段校验"]
  D --> M["Market / Python 计算"]
  M --> H["既有 HTTP / 六个只读工具"]
  H --> W["既有八板块 / 独立来源窗口"]
  H --> A["同一 Codex Adapter / 研究引用 guard"]
  W --> G["原地图 / 不借用研究值"]
```

## 时序：当前

```mermaid
sequenceDiagram
  participant U as User
  participant W as Workspace
  participant M as Market
  participant D as Snapshot
  U->>W: 打开宏观或租赁板块
  W->>M: 既有 market query
  M->>D: observations / notes
  D-->>M: 历史核心指标和少量报告 context
  M-->>W: 原业务结果
  W-->>U: context 或 Not connected
```

## 时序：目标

```mermaid
sequenceDiagram
  participant U as User
  participant W as Workspace
  participant M as Market
  participant D as Snapshot
  U->>W: 打开现有八维板块
  W->>M: 既有 market query
  M->>D: 原 observations 和已接纳 research
  D-->>M: 来源地域 / 窗口 / 原文 / 限制
  M-->>W: 原结果加 research 和 Python 比较
  W-->>U: 来源限定的研究卡片
  Note over W,D: 不搜索、不调用模型、不写回
```

## 状态：当前

```mermaid
stateDiagram-v2
  [*] --> Collected
  Collected --> ReviewPending
  ReviewPending --> PrivatePreview
  PrivatePreview --> ReviewPending: 尚未接纳
```

## 状态：目标

```mermaid
stateDiagram-v2
  [*] --> Collected
  Collected --> ReviewPending
  ReviewPending --> AuthorizedIntake: 本轮用户授权
  AuthorizedIntake --> AdmittedWithCaveats: 字段 / 引用满足本轮规则
  AuthorizedIntake --> Excluded: 许可或证据缺口
  AdmittedWithCaveats --> ReadOnlyDisplay
  Excluded --> GapDisplay
  Note right of ReadOnlyDisplay: 无自动更新或再次发布
```

## 类／Interface：当前

```mermaid
classDiagram
  class Snapshot {
    catalog()
    records()
    references()
    notes()
    source()
  }
  class Market {
    query()
    compare()
    brief()
  }
  class BusinessTools {
    list_tools()
    call()
  }
  class CodexAdapter {
    ask()
  }
  Snapshot <-- Market
  Market <-- BusinessTools
  BusinessTools <-- CodexAdapter
```

## 类／Interface：目标

```mermaid
classDiagram
  class Snapshot {
    catalog()
    records()
    research()
    references()
    source()
  }
  class Market {
    query()
    compare()
    brief()
  }
  class Research {
    topics
    records
    comparisons
    sources
    evidence
    exclusions
  }
  class CodexAdapter {
    ask()
    selected_research_ids
  }
  Snapshot *-- Research
  Snapshot <-- Market
  Market --> Research : 同一业务结果
  Market <-- CodexAdapter : 原六工具
```

不改变依赖方向：Data拥有证据与记录，Market拥有比较，Workspace只渲染，Adapter拥有模型引用与运行时。UI和模型均不重新解释发布策略或计算涨跌。最新验收在 `docs/verification.md`，图不替代测试。
