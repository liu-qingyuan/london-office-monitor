---
{
  "paths": [
    "presentation/**",
    "scripts/build_slides.py",
    "scripts/print_slides.mjs",
    "tests/test_presentation.py"
  ],
  "fingerprint": "sha256:1a82c896c64f5d7820fe338fdcfe05bfc2174efd0e32483d74eb689c68319a61"
}
---

# 五页业务演示生成与打印

## 当前行为

Presentation 为业务评审提供五页英文演示，符合评测 3–6 页数量要求。演示内容、PPTX／HTML 排版与 PDF 打印实现在 `presentation/`；原 `scripts/build_slides.py`、`scripts/print_slides.mjs` 只保留命令兼容，参数和 `artifacts/presentation/` 产物路径不变。生成器复用 Python Market Interface 的历史值、比较和来源；应用不依赖演示生成器，ZIP 打包清单仍由项目交付脚本拥有。

没有截图时明确展示流程图；默认离线／地图 E2E／实时模型均为 `Not yet verified`。截图与状态仅接受显式输入，状态标签不能自证测试通过。`tests/test_presentation.py` 经真实 CLI 在专用临时目录验证五页内容、新旧入口一致和错误输入；快速检查沿用 `frontend` 的 `npm run check:quick`。操作选项见 `presentation/README.md`。

## 限制与剩余

仍使用项目已有 python-pptx 与前端 Playwright／专用 Chromium 依赖，没有通用跨项目渲染工具或依赖隔离改造。部分解释文字和日期绑定现有两期快照，更新数据时必须核对表格、提示、讲稿和来源。PPT 和截图不自动跟随应用更新。生成／打印验证不等于真实地图 E2E、实时模型或业务验收；评测原附件不进入源码或交付包。
