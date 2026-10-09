# 数据、来源与使用说明

首版数据是 **Savills 2024 / 2025 年末研究报告的已核验历史摘录**，不是虚构样例，也不是实时行情。快照共 11 条真实子市场观察、12 条短摘录、4 条报告事件。City / West End 有部分已核验指标；Canary Wharf 与 Midtown / Fringe 没有同口径指标，查询返回 null/missing。

## 原始来源

| ID | 原文 | 报告时期 | 发布日期 |
|---|---|---|---|
| `savills-2024-q4` | [Central London Office Market Watch Q4 2024](https://www.savills.co.uk/research_articles/229130/372062-0) | 2024 年末 | 2025-01-31 |
| `savills-2025-q4` | [Central London Office Market Watch Q4 2025](https://www.savills.co.uk/research_articles/229130/386949-0) | 2025 年末 | 2026-01-30 |

`rents` 对应租金段落、`supply` 对应供应/整体空置率、`leasing` 对应租赁事件/需求驱动、`development` 对应开发/翻新叙述。来源 URL、发布日期、报告时期与审阅时间分别保存；不能以审阅时间宣称数据时期为当前。

- Prime 是**实际成交证据的平均 prime rent**，不是最高单笔或 prime headline rent。Grade A 单独存储、查询和比较。
- 租金单位原文只有 £/sq ft，计费周期及平均值统计窗口未进一步明示；不擅自补 per annum，也不声称第四季度成交平均。
- 空置率使用整体 City / West End 子市场口径，不借用文中 Grade A tower、prime tower、City Core、Fringe 或 availability。2024 West End 只有下降 40bps 的叙述，未在所选段落公布绝对率，因此该期绝对值保留缺失。
- 租金变化由 Python Decimal 计算。West End prime 5.78% 与机构公布 6.1%、City Grade A 5.43% 与公布 4% 分别保留并提示；原因未知。按来源公布精度判断舍入容差，不假定基期修订。
- 报告中的需求、预租和未来翻新结构是带日期的背景叙述，不转成无来源的实时新闻、楼宇租金或已完成供应指标。

## 文件与更新

`snapshot.json` 是 v1 的 source/evidence/available-observation/notes/catalog 快照。源观察以 definition_id 关联指标定义；缺失的展示 observation 由 Python 为请求区域/时期生成，不在文件里填 0。真实源值必须能从对应短摘录中按已批准的 Savills 段落形式解析；broken reference、非数值/非有限值以及不匹配摘录会拒绝加载。

`areas.geojson` 是项目手绘的**示意点击选择区域**，不是 Savills 官方 GIS、行政区或报告统计覆盖，不能据此分配建筑级市场值。City / West End 的来源地理覆盖未在所选文章中提供精确可复用边界；Midtown / Fringe 也没有一个已核验的统一范围。所有 feature 明示 `geometry_status=illustrative`。几何不参与市场计算。

```bash
uv run london-office verify savills-2024-q4
uv run london-office verify savills-2025-q4
```

校验由 Python 抓取白名单 HTTPS 原文、提取正文文本、逐条比对摘录，并返回时间与文档 hash。脚本拒绝离开白名单的重定向。该操作不搜索最新报告、不自动修改快照；摘录不匹配或网络失败需人工复核。更新同口径数据后重启应用，避免地图与既有 Agent 线程使用不同快照。新增机构、定义或数据粒度按项目约定先确认。

## 权利与外部地图

原始研究版权属于 Savills。这里只含必要事实和短摘录、明确署名及原文链接；**未核验全文/图表再分发许可**，不随仓库或交付包复制完整报告、报告图片或测评附件，也不将第三方内容声明为本项目开放许可。

底图使用 OpenFreeMap 的 OpenStreetMap / OpenMapTiles 建筑与道路背景，需保留 OpenFreeMap、© OpenMapTiles 和 OpenStreetMap 数据署名。它们**不是办公室租金/空置率来源**。首版没有建筑高度或 3D 指标覆盖声明；底图不可用时仅保留明确提示的选择几何与真实指标列表。

自动测试的合成冲突/零基数只在临时目录中构造，并标记 `synthetic_fixture`；不进入正式数据文件、演示截图或实时模型实测。
