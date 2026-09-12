# SketchUp AI Toolkit

通过 Codex、Antigravity 等支持 MCP 的 AI 客户端，用自然语言创建、检查和修改 SketchUp 模型。面向风景园林与建筑，也支持从参考图片整理建模方案。

**一个仓库，两类可安装模块：MCP / SketchUp 插件，以及 AI 建模 Skill。** 2020、2026 共用代码，按年份隔离通信、任务和模拟状态。源码保存在本机；当前版本 `0.3.0-alpha.1`。

> 当前是可测试的 Alpha。已验证本地 MCP 通信、模拟建模、安装/打包逻辑和 Ruby 兼容回归；尚未完成这份改版在 Windows/macOS 的 SketchUp 2020/2026 真机建模验收。版本配置存在不代表所有继承功能都已在该宿主验证。详见 [测试状态](docs/testing.md)。

## 最省事的开始方式：把这段话发给 AI

直接在有网络、本地文件和终端工具的 Codex、Antigravity 等 AI 客户端中发送下面整段提示词。AI 会从指定的 GitHub 仓库阅读文档、自行克隆或下载源码，选好长期保存的位置并继续配置。无需先找项目、下载、解压或打开源码目录。

```text
请帮我安装并配置 SketchUp AI Toolkit，让我以后和 AI 聊天就能操作 SketchUp。

项目仓库：https://github.com/PL-FE/sketchup-ai-toolkit

先浏览这个仓库的 README.md、docs/ai-setup-prompt.md 和 docs/installation.md，按文档自行克隆源码；没有 Git 时自行下载这个仓库的源码 ZIP 并解压。请自动选择长期保留的本地目录，我不需要先找项目或准备目录。已有可确认同源的本地副本时可以复用，保留本地修改，避免把 MCP 指向临时目录。无法联网或缺少必要工具时，先检查已知的同源本地副本，再只询问缺少的访问条件或一个可用源码位置。

准备好源码后，检查操作系统、SketchUp 年份、Node.js 及当前 AI 客户端。年份能明确判断就继续，多个候选且无法确定时再问我。

我授权你完成上述源码获取和目录准备，安装必要依赖、安装本项目的 SketchUp 桥接和建模 Skill、备份并合并对应客户端的 MCP 配置。已有配置和其他插件要保留。Skill 优先安装到当前客户端的用户级目录，方便在不同建模项目中使用；不要只放在客户端没有打开的工具包目录中。优先由你完成，不要只给我一长串待办。

使用项目提供的安装和自检脚本。首次连接只做只读检查，不操作我已有模型。确实需要重启应用、系统授权或点击菜单时，说明具体一步；需要我关闭 SketchUp 前先处理未保存文件，不要强行结束程序。没有可用桌面操作工具时，直接让我完成这一步，然后继续。

正常 MCP 建模不要求录屏和鼠标权限。只有实际需要界面辅助时再检查当前客户端支持的电脑控制工具和系统权限；不要声称已授权或替我绕过系统授权。不要关闭客户端全局安全限制。

最后验证 MCP 工具、真实 SketchUp 年份、当前模型、Skill 加载情况，输出“已完成/仍需我操作/未验证”及配置位置。配置就绪后，按 skills/sketchup-ai-modeling/SKILL.md 工作：信息不足先提出，所有推定构造参数展示给我确认后再建模。
```

项目来源为 [PL-FE/sketchup-ai-toolkit](https://github.com/PL-FE/sketchup-ai-toolkit)。获取结果以实际仓库响应为准；若访问失败，AI 应说明具体原因，不改用同名的其他项目。

详细执行约定和不同客户端配置见 [AI 安装提示词与操作说明](docs/ai-setup-prompt.md)。系统要求本人授权、登录 SketchUp 或保护未保存模型时，手动操作几步通常更快；其余步骤可以交给有本地文件和终端工具的 AI。

## 安装完成后怎么聊天

**尺寸明确的测试**：

> 连接 SketchUp 2020。在我已打开的空白测试模型中，创建长 10 米、宽 8 米、高 3 米的建筑体块，底面标高为 0。仅做简单实体，不做墙体分层，不加门窗和材料细节。检查实际尺寸并给出视口截图。

**根据图片建模**：

> 参考这张庭院图建模。先分析可见对象和比例，列出还缺的尺寸、标高及隐藏部分。你建议采用的数据逐项标注为假设，等我确认后再做白模。

**局部修改**：

> 读取当前选中的园路，将宽度调整到 1.8 米，保留中心线和现状树木。先说明会影响哪些对象，再按可用的审查流程执行并检查宽度。

目标是得到可继续编辑的原生群组和组件。持续参数化修改是否可用，取决于该对象是否已建立受支持的参数绑定；只保存参数说明或导入网格不会自动获得此能力。

## 已包含什么

| 能力 | 当前实现与边界 |
| --- | --- |
| 多年份适配 | 注册 2020、2026；独立目录、请求/响应年份检查；未知年份明确拒绝 |
| Windows/macOS 安装 | 自动推导插件位置、预览、备份恢复、生成 MCP 配置、独立 Skill 安装 |
| 少操作启动 | Ruby 桥接默认随 SketchUp 自动启动；菜单可关闭；依赖安装通常只做一次 |
| 图片建模工作流 | AI 分析图片，Skill 要求补齐尺度/标高与假设确认；本项目没有内置图生三维神经模型 |
| 参数预检 | `preflight_design_brief` 返回缺失与待确认参数，保留单位和来源；不伪造数据，不验证真人同意 |
| 建模与编辑 | 继承 JSON DSL、现有模型检查、编辑审查、会话保护、保存与视口导出等核心 |
| 园林/建筑 | 专项 Skill 与庭院示例；按受支持 DSL 组合建模，尚无覆盖所有场景的一键专用生成器 |
| 2020 材质 | 传统颜色/贴图；新版 PBR 与 HDR 环境操作在写模型前拒绝 |
| 地形进阶/图生资产 | 路线与开源参考已记录，外部 TRELLIS、COLMAP 等尚未接入 |

## 手动安装：Windows 和 macOS

需要 **SketchUp 桌面版**与 **Node.js 24.x**。运行插件使用 SketchUp 内置 Ruby；普通用户无需单独安装 Ruby。AI 客户端的模型/订阅由客户端管理，本 MCP 不需要额外的 OpenAI API Key。首次 `npm ci` 需要联网，之后本地桥接可独立运行；AI 客户端是否联网取决于所用服务。

在项目根目录运行：

```sh
npm ci
node scripts/setup.mjs --year 2020 --dry-run
node scripts/setup.mjs --year 2020 --install
node scripts/setup.mjs --year 2020 --config-only --format json
```

关闭目标 SketchUp 后安装，重新打开会自动启动桥接。需要恢复时可在 **Extensions / Alma SketchUp MCP / Start Bridge** 手动启动。Windows PowerShell 遇到 `npm.ps1` 限制时可运行 `npm.cmd ci`。

将生成的 JSON 中 `sketchup-2020` 条目合并到 Antigravity 的 MCP 配置。Codex 使用 `--format toml` 输出，或按 [客户端接入说明](docs/ai-setup-prompt.md#客户端接入) 使用其 MCP CLI。安装 2026 将年份换成 `2026`；可以在同一配置中保留两个服务条目。

Skill 默认安装到当前客户端的用户级目录，便于跨建模项目使用。将下面占位路径替换为 [客户端接入说明](docs/ai-setup-prompt.md#客户端接入) 中对应的实际用户级 Skills 目录：

```sh
node scripts/install-skills.mjs --target "YOUR_CLIENT_USER_SKILLS_DIRECTORY" --install
```

只需某个工作区使用时，可将目标设为那个实际工作区的 `.agents/skills`。脚本会备份同名旧 Skill，并保留其他 Skills。客户端发现目录随版本变化时，以实际配置界面和官方文档为准。详见 [完整安装说明](docs/installation.md)。

自检：

```sh
node scripts/doctor.mjs --year 2020
node scripts/doctor.mjs --year 2020 --live
```

第一条检查 Node、依赖和路径；第二条在最多约 5 秒的队列等待内尝试只读连接。返回 `ok:true` 代表这项连接检查成功，不代表建模精度或所有功能通过验收。

## 图片、尺寸和确认规则

图片场景现在支持 `scene_reconstruction` 清单：区分建筑、建筑组、街道及关键细节，记录邻接/遮挡、图像区域与推断依据。建筑图片的 `complete_model` 路径要求先提交清单；编译会检查必需对象是否落到独立 PartGraph 零件，漏建筑、漏雨棚或漏入口等会报告具体缺项。隐藏区域可以提出类型推断补全，仍保留假设来源和现有审查流程。此功能检查声明的覆盖范围，不是新增自动视觉识别或图生三维神经模型，也不能证明背面真实还原。参见 [场景协议与示例](skills/sketchup-ai-modeling/references/scene-reconstruction.md)。

AI 必须将输入分为用户给定、图片观察、计算推导和设计假设。未知关键参数保持缺失；建议值保持待确认。至少一个可信尺寸或明确获准的概念尺度用于图片比例校准。

`preflight_design_brief` 只校验**已声明的参数**。`ready_for_modeling:true` 不代表图片已分析、所有条件充分、真人已同意或允许修改当前文档。用户对具体参数的确认、实时会话保护和模型验收分别处理。参见 [工作流与 brief 示例](docs/workflows.md)。

## 权限与用户操作

常规建模使用本地文件队列和 SketchUp Ruby API；视口图由 SketchUp 原生导出。桌面录屏、鼠标键盘控制属于 AI 客户端的可选辅助能力，**本项目不捆绑通用电脑控制 MCP，也不会自动授予系统权限**。

macOS 上按需要为实际执行截图/控制的应用开启屏幕录制、辅助功能或自动化；系统授权由用户完成。Windows 按实际客户端提示处理。首次登录、首次启用扩展、保存未保存文件和客户端重新加载可能需要一次手动操作。详见 [权限说明](docs/ai-setup-prompt.md#权限与界面辅助)。

## 开发、打包与 GitHub

```sh
npm test
npm run check
npm run test:ruby
npm run plugin:package
npm run source:package
```

`test:ruby` 是开发检查，需要单独的 Ruby。真机验证步骤见 [测试状态与验收](docs/testing.md)。CI 已配置 Windows/macOS 的 Node 测试，以及 Linux 的 Ruby 测试；远程结果以仓库 Actions 中的实际运行记录为准。

生成 `dist/sketchup-ai-toolkit.rbz` 与 `dist/sketchup-ai-toolkit-source.zip`。源码包包含插件、Skills、文档、示例、测试、许可证与锁文件，排除依赖目录、模型、个人配置和运行状态。RBZ 只有 SketchUp 端，仍需配套 Node 服务。

项目仓库地址为 [PL-FE/sketchup-ai-toolkit](https://github.com/PL-FE/sketchup-ai-toolkit)。维护者发布 Release 时可附上两个包；源码 ZIP 也可通过 GitHub 仓库的下载入口取得。详细结构与扩展年份方法见 [架构说明](docs/architecture.md)。

## 来源与许可证

基于现有 **Local MCP for SketchUp 0.2.0**（Copyright 2026 zhanglinqi，Apache-2.0）的本地源码发行包改造，保留 [LICENSE](LICENSE)、[NOTICE](NOTICE)、[第三方说明](THIRD_PARTY_NOTICES.md)。本项目的新增代码同样使用 Apache-2.0，修改文件保留变更标记。

GitHub 参考项目与直接依赖分开记录；列为参考不表示其代码已被合入或保证 2020 兼容。参见 [参考项目](docs/references.md)。
