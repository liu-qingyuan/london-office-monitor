---
{
  "paths": [
    "london_office/monitoring.py",
    "london_office/official_watch.py",
    "london_office/monitor_schedule.py",
    "london_office/monitoring_status.py",
    "frontend/src/monitoring.ts",
    "frontend/src/monitoring.css",
    "frontend/tests/monitoring.spec.ts",
    "frontend/tests/monitoring-live.spec.ts",
    "tests/test_monitoring.py",
    "tests/test_official_watch.py",
    "tests/test_monitor_schedule.py",
    "tests/test_monitoring_status.py",
    "docs/architecture/source-monitoring.md",
    "docs/architecture/monitoring-status-ui.md"
  ],
  "fingerprint": "sha256:954e917cc14ef2783f6c6cd7686913ee7c9f9ab9ed79a4e787f34124cf551322"
}
---

# 官方来源检测与有界原生定时

## 当前行为

复用原应用包、标准库和本机OS，不新增数据库、队列、模型、付费通路或独立页面；现有News板块增加只读监测卡片。用户最新优先级为先补来源监测／真实定时能力，再扩资料数量；应用AI筛选、自动翻译暂缓。普通市场六工具和verify_source原两份Savills白名单不改。

### 单次Google候选检查

`SourceMonitor.preview/run/view` 与 `python -m london_office.monitoring --plan PLAN --preview|--budget-file FILE`、`--status` 继续执行原来的一次Google metadata动作，复用GoogleDiscovery与SourcePool。计划仅 `schema_version:1, query, topic_ids`；新授权绑定plan_sha256／purpose／有限累计轮数和带时区的期限。所有账户／搜索请求前重新验证，不初始化、复制或续期receipt，不自动重试。相同URL不重复候选；metadata或hash变化不当作市场修订，无新候选不证明无新发布。运行档案为不可覆盖的started/result，失败保留上次有效metadata ID。

本轮八维Google已用10/40（租金3，其余各1）、账户检查10、应用模型0；每维5次，到上海2026-10-12 09:00止。当前池554个exact-URL，仅是未核验线索，曾有招聘页／非目标域名噪音，不能作为正式行情。真实原始输入、请求、响应与hash在 `artifacts/monitoring/20261012-readiness/`。

### 官方来源检测

`OfficialWatch(directory, budget_file).preview(plan)/run(plan)/view()`；CLI `python -m london_office.official_watch --plan PLAN --budget-file LEDGER [--directory DIR]`，`--preview`／`--status`只读。v1计划只含 `schema_version` 和 `watch_ids`，当前支持：

- `savills-central-london`：官方Central London Office Market Watch索引。
- `crown-estate-news`：Crown Estate官方新闻索引，未保证每条都是伦敦办公CRE消息。

目标预置，HTTPS精确host校验，无任意URL／跳转／自动重试。现有授权读取账本在每次请求前以原文件锁检查累计次数和到期，实际启动即消耗额度；每响应5MB、单次timeout20秒。原文不保存或再分发，归档短标题／链接、HTTP状态、时间、字节数、body hash及必要页面证据。

首轮有效检查为 `baseline_captured`，之后累积比较已见发布链接，返回 `new_publication_links` 或 `no_new_publication_links`。URL重现、重排、hash变化不当作修订／事件。`check_failed/not_checked/check_incomplete` 不冒充无新消息；失败保留上次有效run ID。HTTP200但未绑定预期链接仍为parse_unconfirmed。版次仅是索引标题的edition，不是统计窗口；发布日期、地域未建立则未知。输出的链接是待核验线索，`formal_market_updated:false`。

真实Crown索引194次anchor出现／188个不同链接；初版100条门槛导致误报。保留真实最小片段与响应证据，以188链接回归先RED后GREEN，移除不必要的条数门槛，5MB／期限／请求预算未放宽。最新两来源真实检查均HTTP200，未截断列表或伪造新消息。

### macOS原生定时

`Schedule.install/status/remove/tick(config)`；CLI `python -m london_office.monitor_schedule --config CONFIG --install|--status|--remove|--tick`。tick是内部OS动作，手动调用不构成定时验收。配置恰有 `schema_version:1, interval_seconds>=30, max_runs>0, expires_at, plan, budget_file, run_dir`；均为仓库路径，run_dir是var下专用空目录。

launchd plist在仓库专用目录，不写个人Library／配置；固定仓库.venv Python和模块入口，StartInterval、RunAtLoad=false、KeepAlive=false，无凭据或任意命令。安装绑定不可改的配置／计划；状态读取实际launchctl print，移除仅操作本任务label。跨进程锁保护同一watch动作；开始后的失败／中断不退款。重叠／到期／耗尽在来源动作开始前skip，不请求、不新增来源轮；OS仍可调用这个守卫，任务由操作者显式remove，不声称自动bootout。

### 界面与简单显示过滤

`GET /api/monitoring`和`monitoring_status()`只读本仓库专用ui-config、原官方档案和本任务原生状态。未配置／停止／耗尽／到期／不支持／未知／失败分别显示，不根据历史成功冒充运行。操作员用`var/monitoring/ui-config.json`指向已有且已授权的schedule config；浏览器无路径或执行控制入口，不返回本地路径、receipt或认证字段。

现有News板块顶部的Official source monitoring卡片显示最近检查时间、有限周期与启动轮数、来源／官方链接及实际new标签。Refresh status只GET，打开板块不搜索、不调用模型、不安装／触发任务，也不更新行情。前端缓存仅用于同轮界面重绘，显式刷新重读档案；新源标题保持原文、不加翻译。

显示按精确官方HTTPS host与办公CRE关键词作粗筛，排除招聘词但不排除普通vacancy，省略数量明示；未使用AI，原始链接档案不删除。筛选不是事实核验或完整新闻覆盖。edition与publication date／observation period分开，未知保持null。最新失败仍保留上次有效链接与时间。正式研究与2024／2025地图历史保留，不用2026报告版次伪造2026-YE数值。

本轮最小UI接入验收记录在`artifacts/monitoring/20261012-ui/`；离线／真实只读API UI／地图／模型分别记录，不能用mock替代真实融合。局部8图与Interface见[界面接入](../architecture/monitoring-status-ui.md)。

### 最新验收

- 离线：watcher15项、schedule13项、原monitoring10项及状态投影7项通过；最新资料收尾后Python115项＋类型检查quick2.90秒通过（预算10秒）。
- 真实来源：原文累计29/32（含历史失败／重定向／定向诊断），期限上海今日09:00；Google仍10/40、应用模型0。
- 真实定时：当前macOS开发机launchd以60秒间隔／max_runs=2／非RunAtLoad触发；上海06:36:17和06:37:20两轮来源检查均成功，每轮两个索引HTTP200，间隔63.083秒。首轮建立baseline，第二轮没有新链接。另观察到两次exhausted自动skip，没有新HTTP。没有手动tick、kickstart或sleep后手动调用冒充定时。
- 清理：仅此有界验收label已移除，source和两轮执行记录保留；当前没有遗留该任务常驻。它证明能力，不证明永久监控。
- 最小UI：production build＋6项focused通过，22.26秒（预算30秒）；其中3项明确标注synthetic显示fixture、2项原研究真实API回归、1项真实监测档案／HTTP／UI融合，不混算为6项真实新消息。真实源预算、9份原生／source JSON与正式快照hash全部保持不变，刷新只GET。初次真实test的substring重名locator失败及trace保留，修成exact name后单项及六项整组通过。
- 本地产品：用户取消7天并要求快速验证后，原能力额外按30秒／max_runs1自然launchd触发，两源HTTP200且no_new_publication_links，保留原baseline。验收后仅移除本label，原预算cap32／今日09:00不变，累计29→31；无手动tick/kickstart、无Google／模型调用。本仓库8017重载后显示stopped、1/1、最近成功检查上海07:48:43；Savills 3条与Crown 25条显示，另163条仅省略显示不删除。桌面及390px真实截图保留，图中真实底图／建筑可见；这只是产品融合与可见性，不是完整地图性能E2E。playwright-cli的额外run-code遇session closed，未将该手动刷新动作冒充成功；刷新无POST由真实Playwright测试验证。

证据为 `artifacts/monitoring/20261012-capability/live-native/verification.json`、install／原生状态／stdout／source run IDs／remove／after-remove；源记录在配置所指的var目录。当前配置路径在 `schedule-config-path.txt`，不是可复制续期的授权。真实新链接正例仅由离线fixture覆盖，两次真实检查间没有观察到新发布；不为验收制造事件。监测动作未写正式快照，formal_market_updated仍false；另一次用户明确要求的手工增量接纳已写入12条核验事实，hash为`ba9a597a3ea91512cb151f836fb5785ffff3cad4a604c7362ab7e89752ab9763`，与监测档案状态分开。最新30秒执行／install／remove证明、115项离线，以及Spec修复后的资料／三语／监测真实API／UI3项回归（17.45秒）在`artifacts/monitoring/20261012-completion/`。旧60秒两轮验证仍保留，不把三轮无新链接说成新增消息或覆盖全网。

## 限制与剩余

- 只验收两个官方索引和本机macOS原生调度，不宣称全网／八维／所有季度覆盖，Windows／Linux调度直接unsupported，未作其原生验收。
- 最新官方月报September 2026已读到，其实际月度数据为August 2026；另有4条UK宏观候选，但本任务未写正式行情。用户允许合格事实默认接纳、冲突另决，不意味着索引／snippet可直接入库。缺失不是零，历史／修订保留，同事件补证不新增净事件；七项许可／证据排除不变。
- 这是有界能力验收，长期周期／生产环境／到期后预算未明确，不自行启用永久任务、复制receipt或延长授权。接受新的配置也不代表获准外部调用；来源账本仍独立约束每次HTTP。
- 原官方检测／定时批次Standards独立审阅accepted；Spec审阅曾把本轮60秒／2轮验收参数当作通用Interface限制，并把未开始来源动作的skip视为退款。父整合者保留原findings和主合同澄清；原reviewer被harness清理，resume失败，按规则未启动替代reviewer，**独立Spec Closure未完成，未运行Clean gate**。不将原能力测试／真实触发说成完整双轴收口。见capability/review证据。新UI批次另有两轴accepted，无Critical／High，受限Clean一次无改动，跳过Focused Closure；它不替代原定时批次的缺失Closure。见20261012-ui/review证据。
- 最小UI接入由父Agent串行整合README／contracts／managed范围及main.ts接线；worker写入范围不相交。本页指纹只绑定事实版本，不表示审查通过。没有提交／推送或覆盖冻结交付包。
- 本轮真实只读监测API／UI已验收；完整真实地图E2E和实时应用模型仍未执行，不引用旧静态问答、fixture、类型检查或可见建筑替代；源码正式接纳后仍须协调Market缓存与CodexAdapter重载／新会话，保留snapshot hash保护。
