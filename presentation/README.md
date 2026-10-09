# 五页英文业务演示

正文面向业务评审使用英文；生成方式和项目文档使用中文。`scripts/build_slides.py` 共用 Python Market Interface 的真实历史值、计算和来源，输出恰好 5 页 PPTX 与可打印 HTML；不复制第三方报告或图表。

## 生成

在项目根目录完成固定依赖安装后执行：

```bash
uv run python scripts/build_slides.py
# 使用真实本地应用截图与已审阅的验证状态
uv run python scripts/build_slides.py --screenshot artifacts/london-map.png --verification artifacts/presentation/verification.json
node scripts/print_slides.mjs
```

产物在 `artifacts/presentation/`，默认不提交。HTML/PDF 和 PPTX 共用内容，但分别排版；PDF 通过专用 Chromium 打印，不连接现有浏览器。没有截图时展示明确标注的流程图，不制造 UI 截图。

`--verification` 的 JSON 字段为 `offline_tests`、`map_e2e`、`live_model`；值只能是 `Verified`、`Failed` 或 `Not yet verified`。默认全部未验证；该文件只是展示状态，必须另有真实命令、输入和执行证据，不能充当测试证据本身。模型未登录/未实测时保持 `Not yet verified`。

## 五分钟业务演示

1. 定调：这是历史证据 PoC，不是实时租金或建筑估值。展示第 1 页。
2. 打开本地应用，选择 City / Average prime rent / 2025 year-end；查看源值、Python 变化与原文。地图形状是示意选择区域，不是报告覆盖。展示第 2 页。
3. 选择 West End：解释快照计算 5.78% 与机构公布 6.1% 的差异；原因尚未核验。再选 Canary Wharf，展示缺失而非零。展示第 3–4 页。
4. 使用自己的已登录账户提问 City 的两期变化；查看实际工具名、事实、比较、来源和运行编号。未登录应显示明确错误，不能称为实时模型实测通过。
5. 用第 5 页分别报告离线、地图/E2E、模型验证状态；下一轮优先补同口径地区覆盖和更新来源，不承诺实时新闻、精确 GIS 或无缝运行时切换。

租金单位按原文 £/sq ft，计费周期未明示；两期为 2024 / 2025 年末报告值，不自动解释为季度成交平均。来源和使用限制见根 `data/README.md`。
