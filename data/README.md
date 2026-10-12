# 数据、来源与使用说明

数据包含 **Savills 2024 / 2025 年末核心历史快照**和用户在2026-10-12明确批准接纳的八维来源限定研究，不是虚构样例或实时行情。原11条子市场观察、12条摘录、4条报告notes保持原状；`research`有132条记录（原120条保留＋本轮12条2026事实）、21份来源、105条短证据和3项Python比较，7条许可／证据不足字段排除。City / West End有部分同口径指标；Canary Wharf与项目Midtown / Fringe的地图YE查询仍为null/missing，不能借用其他机构/季度值填补。

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

## 八维已接纳研究

八个现有板块读取同一`research`：Submarkets、Rents、Vacancy & availability、Leasing、Supply、Macro、Demand、News。记录含两期和各自实际统计窗口，与地图选择/YE筛选独立；范围、单位、denominator、publication/release vintage、forecast target/as_of、引用及限制分别保存。Source URLs包括Savills、Farebrother publisher-linked newsletters、BNP原始PDF、BoE/ONS与JLL/Crown Estate；有界原文/图转录均明确basis，不再分发原机构图表。

- 本轮12条更新包括UK Bank Rate3.75%（September17决定）、July三个月GDP0.4%、May–July就业75.1%／失业4.9%，以及Savills September版（September30发布）实际August的8条Grade A租金／take-up／YTD／面积份额。原短证据与canonical／latest父URL各自绑定；GBP/sq ft不补per annum，未知失业分母保留null。`latest_update`显式列本次集合及实际原文check时间，页面优先显示，但不变成实时行情或YE地图更新。
- 全年take-up、Q4活动、实际竣工、可供存量和vintaged forecasts不混用。Python计算全年take-up -6.63%、实际年度竣工+20%、BREEAM acquired-space描述性+5个百分点；不将数字相等的rounded stock说成精确不变。
- 英国利率/GDP/LFS只是UK背景，保存决定点、月/滚动/年窗口、分母和修订版本；不叫当前伦敦指标。2024 GDP初值0.8%与后续1.0%分开。
- Broker-tracked意向不是代表性调查；68%/77%质量空间分类措辞不同，不计算同口径趋势或推断ESG因果。
- Farebrother Midtown范围由其footnote定义，不等于项目Midtown/Fringe。Newsletter日期未知，HTTP文章参考没有作为发布来源/日期入库；图像视觉转录保存HTTPS定位/方法，不声称image hash已核验。
- BNP Q2 2025是季度背景，不能补年末空缺；缺保存摘录的Midtown take-up未发布。具明确prior-consent限制的六条样本/灵活办公字段只列许可缺口，未复制其值/引文。
- 八个历史事件dossiers保存季度/月/年精度；公告日不是签署日。Gibson Dunn/FTI为既有Exchange Square note补证据，不是两条新增净事件；投资价不是租金。
- 旧Supply现场复取的复合断言失败原因仍未知，保留限制；本地入库检查不把它关闭。

## 文件与更新

`snapshot.json` 是 v1 的 source/evidence/available-observation/notes/catalog以及新增research快照。源观察以 definition_id 关联指标定义；缺失的展示 observation 由 Python 为请求区域/时期生成，不在文件里填 0。核心观察必须能从对应短摘录中按已批准的Savills段落形式解析。研究校验引用、topic/范围/窗口、finite数值与有界证据；数值须在绑定摘录中以字面/单位换算形式存在，这不替代语义/口径审阅。missing/approximate/event不制造单一scalar，broken references与未授权map binding会拒绝加载。

`areas.geojson` 是项目手绘的**示意点击选择区域**，不是 Savills 官方 GIS、行政区或报告统计覆盖，不能据此分配建筑级市场值。City / West End 的来源地理覆盖未在所选文章中提供精确可复用边界；Midtown / Fringe 也没有一个已核验的统一范围。所有 feature 明示 `geometry_status=illustrative`。几何不参与市场计算。

```bash
uv run london-office verify savills-2024-q4
uv run london-office verify savills-2025-q4
```

校验由 Python 抓取白名单 HTTPS 原文、提取正文文本、逐条比对摘录，并返回时间与文档 hash。脚本拒绝离开白名单的重定向。该操作仍只核验原两份Savills文档及原摘录，不搜索最新报告或扩大到新格式/机构。新增资料可用source_details阅读存档，现场verify未支持则明确报错且不联网。摘录不匹配或网络失败需复核；更新源码快照后重启应用，避免旧线程/缓存和新数据不一致。本轮用户授权一次性接纳，不是候选池自动发布或未来自动更新。

## 权利与外部地图

原始研究版权分别属于其机构/权利人。这里只含必要事实和短摘录、明确署名及原文链接；**未核验全文/图表再分发许可**，不随仓库或交付包复制完整报告、报告图片或测评附件，也不将第三方内容声明为本项目开放许可。

底图使用 OpenFreeMap 的 OpenStreetMap / OpenMapTiles 建筑与道路背景，需保留 OpenFreeMap、© OpenMapTiles 和 OpenStreetMap 数据署名。它们**不是办公室租金/空置率来源**。首版没有建筑高度或 3D 指标覆盖声明；底图不可用时仅保留明确提示的选择几何与真实指标列表。

自动测试的合成冲突/零基数只在临时目录中构造，并标记 `synthetic_fixture`；不进入正式数据文件、演示截图或实时模型实测。
