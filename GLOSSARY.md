# 伦敦写字楼市场监测

首版监测来源可核验的子市场指标、跨期变化和报告事件；真实历史资料与交互示意严格区分。

## Language

**子市场（Submarket）**：研究机构为办公室市场报告定义的业务区域；City / West End 等不自动等同于行政区或本项目的手绘选择区域。
_Avoid_: 行政区、建筑范围

**平均 Prime 成交租金（Average Prime Achieved Rent）**：来源按实际成交证据公布的优质办公室平均租金。不是单笔最高租金或机构估计的 prime headline rent。
_Avoid_: Top rent、Prime headline rent、Grade A rent

**平均 Grade A 租金（Average Grade A Rent）**：来源按其 Grade A 分类公布的平均租金；分类不能自动视为与 prime 相同。

**整体空置率（Overall Vacancy Rate）**：来源公布的整个子市场空置率。Grade A tower、prime top-tier tower 和 Core 的空置率属于不同统计群体；availability 也不自动等同。
_Avoid_: 可租赁率、Grade A 空置率

**报告值（Reported Value）**：按报告标注时间与口径观察到的数值。年末报告内的租金平均值不自动表示第四季度成交平均。

**快照计算变化（Snapshot Change）**：使用两条满足比较条件的历史报告值，由 Python 按明确公式计算的变化。与机构公布同比分别保留，基期修订等未获证实的原因不能自行推断。

**证据（Evidence）**：可追溯到机构、URL、发布日期和原文段落的短摘录；没有证据不制造事实或建筑级精度。

**报告事件（Report Event）**：历史研究报告中的成交、需求或供应叙述；不是实时新闻推送。

**示意选择区域（Illustrative Selection Area）**：手绘、用于悬停和点击的地图范围；不代表权威报告地理覆盖，不参与指标计算。

**缺失（Missing）**：当前快照没有已核验的同口径数值；既不等于零，也不表示市场不存在。

**冲突（Conflict）**：同口径观察存在不一致值，或报告公布变化与可见快照计算结果不同。保留证据及不确定性，不静默平均或覆盖。
