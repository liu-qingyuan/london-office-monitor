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
    "frontend/tests/latest-updates.spec.ts"
  ],
  "fingerprint": "sha256:257aeead2c63bfa6f45f36fb7b87e50f594c2ab097d604fe7917463e2c8ead7e"
}
---

# 市场数据查询与同口径比较

## 当前行为

Python Market为CLI、HTTP与既有业务工具提供历史市场查询和同口径比较；租金百分比、空置率百分点，机构公布同比与Python结果分开。原11条地图观察不变。用户授权的八维研究以query／brief嵌套research返回132条来源限定记录（原120条＋12条2026增量事实）、21份来源、105条短证据与3项Python比较；7条许可／引文不足字段排除。新增UK Bank Rate／GDP／LFS4条，Savills September版actual August租金／take-up／YTD／承租面积结构8条；canonical和latest证据各自绑定真实父URL。研究保存自身统计窗口、地域、release／forecast／event轴，独立于地图选择和YE筛选；原观察引用不计新增指标。未知口径拒绝，missing／approximate不制造精确值。公开入口为tests/test_market.py／tests/test_data.py／test_latest_data.py；quick115项Python＋类型检查2.90秒通过。可选latest_update列本次正式接纳集合和原文check时间，各主题研究先展示Latest verified update再展示旧历史，无重复；新资料保持原文不自动翻译，YE控制只影响原地图。真实API／production UI新12条、监测卡片和八研究页4项通过20.28秒；三语共存、原描述覆盖与发现共存9项通过18.29秒，均30秒预算。最后Spec修复把未知失业率分母置null（说明留caveat），Python重算各topic引用计数；修后资料／三语／监测真实UI3/3通过17.45秒。证据在artifacts/monitoring/20261012-completion/；fixture发现筛选、模型未跑和完整地图性能E2E未重跑分别保留，不扩称全产品验收。

## 限制与剩余

核心地图仍只有Savills City／West End两期部分指标；季度BNP／Farebrother自定义Midtown／UK背景不补Canary Wharf和项目Midtown-Fringe的YE缺口。预测as_of、部分目标/统计窗口、分母和许可缺口明确保留；不是实时全伦敦行情，不自动搜索或未来发布。GeoJSON是示意选择几何，研究map_binding均为null。现场verify_source仍只允许原两份Savills及原摘录，新资料只读存档。前端／模型和产品验收须另有执行证据，Feature一致不代表通过。
