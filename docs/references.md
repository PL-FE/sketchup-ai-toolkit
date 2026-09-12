# 参考项目与适用边界

核对日期：2026-09-12。以下链接来自项目维护者仓库或官方文档；列为架构和工作流参考，不代表已安装、已集成、经过本项目的实时验收，或可以不考虑许可直接复制代码。此次参考整理没有复制这些项目的实现。链接指向上游，后续采用时应固定具体版本并重新核对许可与依赖。

## SketchUp 与参数化工作流

| 项目 | 已核对的能力 | 参考价值及限制 | 上游许可 |
|---|---|---|---|
| [SketchUp/sketchup-shapes](https://github.com/SketchUp/sketchup-shapes) | 官方形体扩展，按参数创建对象，创建后可继续修改参数 | 原生形体、对象参数和重生成的直接参考；不是完整建筑/景观系统 | 仓库标明 MIT |
| [SidhNor/sketchup-mcp-server](https://github.com/SidhNor/sketchup-mcp-server) | 场景查询、语义场地构件、地形创建/采用/编辑、测量验证 | 景观对象和托管地形生命周期的设计参考；其工具名和支持版本不能自动套入本工具包 | 仓库标明 AGPL-3.0；本文只参考设计与文档，未合入其代码 |
| [zinin/sketchup-mcp2](https://github.com/zinin/sketchup-mcp2) | SketchUp MCP、模块化处理、视口截图、握手及提示工作流 | 参考发现接口、反馈迭代和工具组织；其自由 Ruby 执行不是本项目的默认执行路线 | 仓库标明 MIT |
| [darwin/supex](https://github.com/darwin/supex) | 脚本、MCP、截图/检查与可选参数化侧车 | 参考项目级脚本和视觉反馈；上游明确是实验项目，主要 macOS，测试 SketchUp 2026，不保证向后兼容 | 仓库标明 MIT；可选第三方部分须另核对 |

官方[参数化对象教程](https://developer.sketchup.com/article-making-a-parametric-object)展示了保存参数并重新生成原生几何的做法。它支持“保留参数 → 明确对象身份 → 修改参数 → 重生成并复核”的实现思路；仅保存截图或三角网格不等于具备这条编辑链。

## 图像与现状重建：可选后端

| 项目 | 输出与适用方向 | 集成边界 |
|---|---|---|
| [Microsoft TRELLIS](https://github.com/microsoft/TRELLIS) | 从文字/图片生成 3D 资产，输出网格、GLB、Gaussians 或 radiance fields；可作为独立景石、雕塑或家具概念资产方向 | 官方 README 的测试环境为 Linux、至少 16GB NVIDIA 显存。模型和大部分代码为 MIT，子模块许可不同。应按需提供独立后端；输出不自带墙厚、层高等建筑参数，也不保证实测尺度 |
| [COLMAP](https://github.com/colmap/colmap) | 多照片 SfM/MVS 重建；[官方教程](https://colmap.github.io/tutorial.html)说明点云与表面网格输出 | 可作现状场地、建筑参考，仍需尺度/坐标处理和构件语义重建。核心为 BSD 3-Clause，依赖单独许可；不同硬件的重建能力需实际检查。建议可选外部进程 |
| [CubiCasa5k](https://github.com/CubiCasa/CubiCasa5k) | 平面图多任务分析模型，以及 5000 张、多类多边形标注数据 | 适合研究平面图识别和数据组织；[仓库许可](https://github.com/CubiCasa/CubiCasa5k/blob/master/LICENSE)明确为 CC BY-NC 4.0，运行栈较旧。不作为本项目默认商用依赖 |

根据这些输出类型，建筑主体更适合采用“图像校正与尺寸标定 → 构件和边界识别 → 经确认的参数 → SketchUp 原生群组/组件”。这是本项目的架构判断，不是上述项目已经实现完整 SketchUp 参数化转换的声明。外部资产须另做格式导入、尺度、材质和复杂度适配；本项目不自动上传用户图片。

## 年份适配的官方依据

- [SketchUp Ruby API 发布说明](https://ruby.sketchup.com/file.ReleaseNotes.html)：2021 将 Ruby 从 2.5.5 升为 2.7.1；2024 增加图形引擎/环境光遮蔽能力；2025 增加 PBR/环境能力。版本适配还须探测具体 API，不只修改安装路径。
- [DefinitionList#load](https://ruby.sketchup.com/Sketchup/DefinitionList.html#load-instance_method)：`allow_newer` 重载从 2021 引入；2020 所用模型/组件需选择其能读取的 SKP 版本。
- [Model#save_copy](https://ruby.sketchup.com/Sketchup/Model.html#save_copy-instance_method) 和 [Model#close](https://ruby.sketchup.com/Sketchup/Model.html#close-instance_method)：分别自 2014、2015 提供，具体生命周期行为仍有平台与版本差异。
- [Page#set_drawingelement_visibility](https://ruby.sketchup.com/Sketchup/Page.html#set_drawingelement_visibility-instance_method)：从 2020.0 提供。

兼容性实现和离线回归不能代替真实 SketchUp 2020/2026、Windows/macOS 的分别验收；测试报告应说明实际运行过的组合。
