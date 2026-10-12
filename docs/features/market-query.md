---
{
  "paths": [
    "london_office/market.py",
    "london_office/data.py",
    "data/snapshot.json",
    "data/areas.geojson",
    "tests/test_market.py",
    "tests/test_data.py",
    "tests/test_latest_data.py",
    "frontend/src/main.ts",
    "frontend/src/types.ts",
    "frontend/tests/latest-updates.spec.ts",
    "frontend/src/research-charts.ts",
    "frontend/src/dashboard.css",
    "frontend/tests/research-charts.spec.ts",
    "frontend/tests/research-coverage.spec.ts",
    "frontend/tests/dashboard-visual.spec.ts",
    "frontend/tests/left-detail.spec.ts",
    "london_office/research_intake.py",
    "london_office/storage.py",
    "tests/test_research_intake.py",
    "tests/test_intake_http.py",
    "tests/test_intake_market.py",
    "frontend/src/research-intake.ts",
    "frontend/src/user-controls.css",
    "frontend/tests/research-intake*.spec.ts"
  ],
  "fingerprint": "sha256:b11a14a4e539ed570438e0aa8af78b0355e0a3719572fe2deb59f22462fe3a20"
}
---

# 市场数据查询与同口径比较

## 当前行为

ResearchIntake现支持用户原PDF／HTML／TXT与scalar候选暂存，捕获bytes/hash并绑定精确短引文、数值/单位及字段。批次内容SHA不可变；单独授权才自动接纳eligible，模糊／同口径冲突留待带理由判断，缺原文／不支持数值或类型／重复项不可确认绕过。先识别整批冲突，保留各来源值而不先选首项；冲突账本仅引用baseline或已接纳ID。原材料source如实标记user_supplied_document_excerpt_not_live，机构／URL／日期及市场解释不冒称在线认证；City不匹配capacity等子串，Central London不能自动扩大到London。

独立ignored var/research JSON用跨进程锁和原子写入，accepted overlay由原Market/query/brief/六工具动态校验读取；不覆盖snapshot、11条地图观察或几何。UI明确接纳后只失效市场缓存并重读研究，不重建／缩窄地图或自动问模型。旧会话及执行中accepted内容变化报research_changed，不接受混合版本或自动重试。真冲突记录有quality_status/conflict_record_ids，相关Python比较停止。原材料本批入库授权与搜索grant分开，用户API不进入MCP。

[最新验证](../verification.md)集中保存本增量的离线、真实localhost HTTP／存储、production／开发synthetic上传链、完整Metal失败及review／clean边界。专项通过不代表全套GREEN；Agent禁用的实链不代表实时模型。原快照／观察／几何／旧receipt哈希不变，实时搜索／模型／抓取新增0，未提交／推送／打包。

Python Market为CLI、HTTP与既有业务工具提供历史市场查询和同口径比较；租金百分比、空置率百分点，机构公布同比与Python结果分开。原11条地图观察不变。用户授权的八维研究以query／brief嵌套research返回132条来源限定记录（原120条＋12条2026增量事实）、21份来源、105条短证据与3项Python比较；7条许可／引文不足字段排除。新增UK Bank Rate／GDP／LFS4条，Savills September版actual August租金／take-up／YTD／承租面积结构8条；canonical和latest证据各自绑定真实父URL。研究保存自身统计窗口、地域、release／forecast／event轴，独立于地图选择和YE筛选；原观察引用不计新增指标。未知口径拒绝，missing／approximate不制造精确值。公开入口为tests/test_market.py／tests/test_data.py／test_latest_data.py；quick115项Python＋类型检查2.90秒通过。可选latest_update列本次正式接纳集合和原文check时间，各主题研究先展示Latest verified update再展示旧历史，无重复；新资料保持原文不自动翻译，YE控制只影响原地图。真实API／production UI新12条、监测卡片和八研究页4项通过20.28秒；三语共存、原描述覆盖与发现共存9项通过18.29秒，均30秒预算。最后Spec修复把未知失业率分母置null（说明留caveat），Python重算各topic引用计数；修后资料／三语／监测真实UI3/3通过17.45秒。证据在artifacts/monitoring/20261012-completion/；fixture发现筛选、模型未跑和完整地图性能E2E未重跑分别保留，不扩称全产品验收。

前端使用全屏地图上的半透明圆角毛玻璃信息浮层，打开/切换不占地图列、不缩窄地图；移动端为底部浮层。显式已接纳集合提供同窗口Grade A租金和月度take-up条形图、各自分母的95%/31%独立环图、独立UK宏观KPI；原字面值、卡片、来源、引文不变，不生成新市场计算、趋势或剩余份额。右上角分开显示2026核验研究和2024–2025历史地图。未知/不匹配分母拒画环图。当前真实API/production UI及合成保护共6/6、15.20秒，1600/390px浮层在视口内且前后地图尺寸不变；Python115项+类型检查2.71秒。证据为`artifacts/ui/20261012-dashboard/overlay-final.log`及`artifacts/checks/20261012T011113905Z-30387/`；不含最新完整地图性能、原生GPU点击回归或实时模型验收。独立Broad Standards accepted；Spec未知字符串分母High已先RED后修复，原reviewer已被清理导致Focused Closure无法resume，不能称独立Closure accepted。

## 限制与剩余

核心地图仍只有Savills City／West End两期部分指标；季度BNP／Farebrother自定义Midtown／UK背景不补Canary Wharf和项目Midtown-Fringe的YE缺口。预测as_of、部分目标/统计窗口、分母和许可缺口明确保留；不是实时全伦敦行情；不自动搜索、从metadata发布或无限授权未来批次。有限用户原材料匹配不等于机构真实性核验。GeoJSON是示意选择几何，研究map_binding均为null。现场verify_source仍只允许原两份Savills及原摘录，新资料只读存档。前端／模型和产品验收须另有执行证据，Feature一致不代表通过。
