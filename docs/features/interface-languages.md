---
{
  "paths": [
    "frontend/src/i18n/**",
    "frontend/src/main.ts",
    "frontend/src/map.ts",
    "frontend/tests/i18n.spec.ts",
    "frontend/tests/description-localization.spec.ts",
    "frontend/tests/language-ui.spec.ts",
    "frontend/tests/language-research-ui.spec.ts",
    "frontend/tests/research-coverage.spec.ts",
    "frontend/src/discovery-authorization.ts",
    "frontend/src/research-intake.ts",
    "frontend/tests/discovery.spec.ts",
    "frontend/tests/research-intake*.spec.ts"
  ],
  "fingerprint": "sha256:fef2b8a9ff94bef3c5366b6aec5932da05cb57c5f768497745f31124cf1bb3a5"
}
---

# 英文、简体与繁体界面

在保留原行情、证据、地图和 Agent 行为的前提下，提供真正的三语页面展示。

## 当前行为

网页搜索授权／研究入库的参数、状态、余额／有效期、暂存／单独批准和带理由决定均有英／简／繁文案；缺授权、过期、耗尽和研究版本改变的错误按code显示，不重新调用。语言render保留输入、选中文件、draft、批准内容版本和判断理由，原来源文字／引文／单位／后端理由不擅自翻译。[最新验证](../verification.md)集中记录控制专项、实际本地HTTP／存储和1600/390 UI链，区分fixture与禁用模型的真实接口。最新完整Metal含两个desktop语言场景renderedBuildingCount=0失败；不得沿用下方历史62项声称最新全套三语／地图GREEN。

左上品牌旁原生选择 en／zh-Hans／zh-Hant；默认英文，偏好仅存页面内存，刷新重置。九图标导航、筛选、按钮、状态、无障碍名称、来源标签、缺失/预测/许可说明均按语言显示。页面自身的八维研究标题、定义、分母、范围/窗口文字、事件摘要和警告也翻译；不再把页面研究说明当成来源引文而保留英文。

显式文案槽与完整原文描述目录承担翻译；不使用全页扫描、MutationObserver、翻译服务或新依赖。未知新描述不冒用旧译文。原始来源引文/定位、外部文章标题/链接、专名、数字/单位及工具 JSON 不改写，统计范围、基期、实际/预测及发布日期/预测截至日期的区分不变。用户问题与授权请求不改动。

语言更新只重绘已加载数据与保存的 Agent 响应，保留地图镜头/选区、指标/期间、面板/证据、输入/焦点及可保持的滚动。地图仅重绘语言标签与系统字体字形，不加载数据、改几何、重启地图或移动镜头。系统字体回退覆盖英文及中日韩字符，无下载；中间桌面宽度给品牌/语言控件及 Agent 留出互不重叠的空间。

离线入口 `npm run check:quick` 本模块专项 84 项 Python 与类型检查通过（4.06s）；两组 i18n/描述覆盖模块测试 18/18（586ms），检查当前 120 条研究记录、排除项和所有静态说明。真实 Python API＋production build＋原生 GPU 浏览器回归 `language-ui.spec.ts`、`language-research-ui.spec.ts` 专项 7/7（25.50s，30s预算）：1600/1000/390px 三語、实际系统字体、八研究页全部卡片、原始引文/URL/数值不变以及语言切换零额外API。主动点击空置板块仍正常请求其行情，不将明确操作混同为被动请求。输入和展开状态保留，等待/完成态及完整 JSON 用历史回答 replay＋预期工具输出扩展检查。

专项执行记录、真实输入、请求轨迹及截图位于 `artifacts/checks/20261011T214047878Z-64565/`。最终移动按钮CSS小修后的共享完整整合，由整合者串行使用现有 `test:e2e --workers=1` 执行全部当前spec，62/62（原37＋语言真实界面7＋模块18），0跳过/失败/flaky；84项Python＋类型/build通过，quick4.27s，suite130.340s，总135.759s。已复核 `artifacts/checks/20261012-final-acceptance/latest-all-specs/e2e/results.json` 与该轮输入/输出无变化记录；源指纹不变，原单项时限/retries=0不变，0新模型/搜索。使用与限制详见 `frontend/src/i18n/README.md`，整合验收的证据分类见 `docs/verification.md` 首节。

当前兼容复验覆盖最新12条正式接纳事实：原120条描述的简繁覆盖保留，新资料与Latest verified update标题／说明按当前范围保留原文，不称新卡片完整三语；三语言切换仍保留全部132条数值／引文／URL且无额外API。真实API／production build、描述模块6项、八研究页三语1项、发现共存2项共9/9通过，focused18.29秒；Python115项＋类型检查quick2.84秒。新record置顶后，测试按ID查找所有卡片并定位原scope_note直接子节点，原顺序／语言／引用覆盖不删除。历史62项全套仍只证明旧轮；当前证据在`artifacts/monitoring/20261012-completion/coexistence-green.log`。

右上角本地化覆盖提示分别展示“已核验研究2026”和“地图2024–2025”，以latest_update显式接纳记录的release_vintage而非系统年份为依据；无接纳集合回历史证据。当前6项仪表盘回归包含三语badge切换零额外API和合成legacy fallback；图表说明与新增来源内容仍保持原英语，不声称图表完整三语。全屏地图上的毛玻璃浮层在1600/390px验收，完整原三语布局/模型套件此次未重跑。

来源授权错误及模型/Google额度用完采用本地三语提示，不改变后端错误码，切换语言不会重发请求。4项来源UI回归10.84秒；其中错误和筛选是fixture。另有用户明确批准的一轮真实简体UI来源搜索：Google和原生metadata成功、caller turn1/Google1，不把这轮来源筛选扩称普通市场问答或完整三语模型测试；自由模型assessment仍原英语不自动翻译。根README默认英文、完整中文入口为README.zh-CN.md，互相链接且均有用户自身手动授权和后端配置步骤。

## 限制与剩余

用户优先最小监测卡片并暂缓新内容翻译：新增Official source monitoring状态／按钮／News监测说明暂用英语，外部来源标题原文；原三语导航与已有研究翻译仍保留，不把新卡片称完整三语。切换语言不额外请求监测档案（同轮缓存），不搜索／调用模型。

语言/地图专用回归没有实时模型调用；独立已授权简体来源筛选的一轮实测也不证明普通市场模型问答。历史replay不证明最新模型问答。新自由模型输出仅在有精确、已审阅译文时本地化，未登记输出仍保留原文，不自动发起翻译/重问。macOS 原生 select 的方向键菜单未由自动化协议验收（独立普通 select 最小复现同样无法选择）；已验控件可键盘聚焦及原生选择，不冒称方向键选择通过。Windows/Linux 的字体回退本轮只做配置/静态检查，未作原生平台验收。完整62项虽已包含语言回归，仍不替代八维来源/许可或实时模型验收，不把其他轮单问题live扩称为三语模型验收；不修改正式数据、发布权限或付费调用权限。
