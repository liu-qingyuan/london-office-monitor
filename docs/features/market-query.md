---
{
  "paths": [
    "london_office/market.py",
    "london_office/data.py",
    "data/snapshot.json",
    "data/areas.geojson",
    "tests/test_market.py",
    "tests/test_data.py"
  ],
  "fingerprint": "sha256:a4610e9c1a37cade718493f85cc1873a4dc2f539b511aae33cb2dbcb15320ba7"
}
---

# 市场数据查询与同口径比较

## 当前行为

Python Market 为 CLI、HTTP 与业务工具提供历史市场查询和比较：租金计算百分比、空置率计算百分点；机构公布同比与快照计算分开，差异保留警告。未知口径或时期拒绝，缺失／冲突不作零值；查询保留来源、摘录和示意选择几何。公开行为验证入口为 `tests/test_market.py`、`tests/test_data.py`；项目快速检查是 `cd frontend && npm run check:quick`。

## 限制与剩余

只有 Savills 2024／2025 年末历史快照，不是实时行情；不借相邻区域补缺失，不自动发现报告或发布研究。GeoJSON 是手绘选择范围，不是官方边界或建筑级指标。门禁先只纳管本页关联文件；前端、地图性能、模型与产品验收仍按原约定处理，不能由记录一致推断通过。
