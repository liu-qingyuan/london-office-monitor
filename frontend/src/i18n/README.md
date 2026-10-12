# 三语界面

已接入 `frontend/src/main.ts`，支持 `en`、`zh-Hans`、`zh-Hant`。语言控件在左上角品牌旁；保留九图标导航、玻璃面板、地图和 Agent。默认英文，只在当前页面内存保存；刷新恢复英文，不读写浏览器存储。

## 当前边界

- `en.ts`、`zh-Hans.ts`、`zh-Hant.ts`：导航、操作、状态、无障碍名称、筛选、来源/研究标签、缺失与预测说明。
- `descriptions.ts`：**页面自身的研究内容也翻译**，包括研究标题、定义、分母、地理范围的说明、统计窗口的文字、事件摘要、证据/许可缺口、来源限制和警告。现有数据的全部 120 条研究记录与排除项有覆盖检查，不再把这些内容误归为“引文”。
- 直接来源引文、定位信息、外部来源标题/链接、机构及地区专名、用户输入和原始 Python 工具 JSON 保留。原始记录和计算值不修改；数字/单位沿用 Python 返回及 `en-GB` 展示，约三分之一不会换算成精确百分比。
- 已登记描述按**完整原文**匹配，不扫描/替换全页文本，不使用 MutationObserver、自动翻译服务、模型请求或新依赖。未知新描述保留原文，不冒用旧译文；更新数据时必须补译并通过覆盖测试。
- 自由生成的模型 answer/assessment 仅在存在精确、已审阅的译文时显示译文；未登记的动态输出仍保留原输出。本次没有实现按界面语言重新调用/翻译模型，也不改变提问或授权请求。

## 渲染接缝

`createI18n()` 返回内存状态；`t(key, parameters?)` 是未转义纯文本，仅对模板自身插值。缺键、缺参数和非法语言显式报错；注册订阅或重复选择不通知。`mountLanguageSelector(host, i18n)` 只挂载原生控件；应用订阅负责 `applyLanguage(document.documentElement, language)`。

`main.ts` 的 `renderChrome()` 只更新明确的文案槽/属性。`renderLocalizedPresentation()` 从已加载的市场数据和保存的最后 Agent 响应重绘，保留选区、指标、期间、输入、打开的面板/证据、焦点和可保持的滚动位置；不重建 `app.innerHTML`、替换导航节点、调用 `refresh/loadDetail/selectArea/showSection/map.start/update/focus` 或发送请求。

`MarketMap.setLanguagePresentation()` 仅更新选中标签/系统字体和显示图层；不更新行情、几何、来源、建筑颜色、相机或选区。TextLayer 使用自动字形集以显示中日韩字符。字体 CSS 只声明已安装的系统字体回退，不下载字体。中间桌面宽度为左侧品牌/语言控件保留空间，避免 Agent 重叠/溢出。

插入 HTML 时使用现有 `escapeHtml`，或 `textContent`/属性 setter。`localizeDescription()` 同样返回纯文本；只有明确的研究/界面字段调用它，来源引文和工具 JSON 不传入该函数。

## 验证

从 `frontend` 执行：

```bash
npm run check:quick
./node_modules/.bin/playwright test --config=tests i18n.spec.ts description-localization.spec.ts --workers=1 --reporter=list --output=src/i18n/.test-results
OFFICE_USER_RENDERER=1 npm run check:focused -- tests/language-ui.spec.ts tests/language-research-ui.spec.ts --workers=1
```

本模块专项结果：

- 离线业务/类型：84 项 Python 全通过；quick 4.06s（预算 10s）。模块/描述覆盖 18/18，586ms。
- 真实界面/地图：production build + 真实 Python API + 本机原生 GPU 浏览器 **7/7**，25.50s（预算 30s）。检查 1600/1000/390px 三语、全部八研究页、原始引文/URL/Python 数值不变、CJK 实际系统字体、地图镜头/选区/证据/输入保留以及切换时零额外 API 请求。明确点击空置板块仍可以正常请求其指标。
- 完整整合：共享整合者在最终移动按钮 CSS 小修后，串行使用现有 `test:e2e --workers=1` 执行全部当前 spec，**62/62**（原37＋语言真实界面7＋模块18），0跳过/失败/flaky；84项Python＋类型/build通过，quick4.27s，suite130.340s，总135.759s。本模块已复核原始 `results.json`、输入指纹和输出无变化记录；没有以模块测试冒充地图检查、放宽原单项时限或新增模型/搜索。
- Agent 测试：使用已标注的历史回答 replay＋预期工具输出扩展；验证等待/完成态翻译及完整 JSON 不改写，**不是实时模型实测**。
- 实时模型/搜索：本轮未调用。macOS 原生下拉菜单的方向键选择无法由当前自动化协议复现（普通独立 select 同样如此）；已验证控件键盘可聚焦及原生 select 选择，未冒称原生菜单方向键通过。Windows/Linux 字体回退仅配置与静态检查，未在本轮运行原生平台验收。

真实输入、请求轨迹、平台字体、执行日志和截图：`artifacts/checks/20261011T214047878Z-64565/`。最初控件缺失、未译研究说明和 1000px 布局 RED 证据保留在 `artifacts/i18n/ui-red/` 及对应 `artifacts/checks/` 失败记录；不覆盖历史失败。最新完整整合原件：`artifacts/checks/20261012-final-acceptance/latest-all-specs/`；其真实GPU/历史replay/实时模型边界见 `docs/verification.md` 首节。完整测试 GREEN 不扩称自由模型输出已具备三语即时翻译或跨平台字体验收。
