# 安装与连接

这个工具包包含三部分：SketchUp 中运行的 Ruby 桥接插件、AI 客户端连接的 Node.js MCP 服务，以及指导 AI 建模的 `sketchup-ai-modeling` Skill。2020 和 2026 使用同一套代码，通过年份配置选择能力，并分别保存通信状态。

支持的安装目标是 Windows 和 macOS。请在真正运行 SketchUp 的电脑上安装。版本表中的 `pending-host-test` 表示仍需要对应年份、对应系统的 SketchUp 真机验证；自动化测试通过不代表已经完成真机建模验收。

## 让 AI 协助一次完成安装

直接把 [README 中的安装提示词](../README.md#最省事的开始方式把这段话发给-ai) 发给 Codex 或 Antigravity。指定项目来源为 [PL-FE/sketchup-ai-toolkit](https://github.com/PL-FE/sketchup-ai-toolkit)：AI 浏览仓库的 README 和安装文档，自行克隆源码；没有 Git 时下载该仓库的源码 ZIP 并解压。它会自动选择可长期保留的目录，继续检查环境、安装依赖、配置 MCP 与 Skills，并验证连接。同源本地副本可以复用，同时保留已有修改。只有无法联网或缺少必要工具且没有可用同源副本时，才询问缺少的访问条件或一个源码位置。仓库访问与下载结果以实际响应为准。详细执行约定见 [AI 安装操作说明](ai-setup-prompt.md)。

自动流程使用本页的脚本。实际安装用 `--install`，默认执行只显示计划；替换同名插件或 Skill 前会创建备份。AI 应根据客户端支持的方式合并 MCP 配置，保留已有服务，并报告配置位置。项目脚本本身不会编辑全局 MCP 配置。

SketchUp 的初次启动、重启、点击 **Start Bridge**，以及系统要求的权限确认，可以由你手动完成。桥接默认随目标 SketchUp 自动启动；正常使用只需打开 SketchUp，并在 AI 客户端启用相应 MCP 服务。菜单 Auto-start on launch 可开关自动启动。

## 1. 准备 Node.js 与源码

安装 **Node.js 24.x**。Node 可执行文件必须适用于目标电脑；不要把 macOS 的 Node 或 `node_modules` 复制到 Windows。Windows 与 macOS 都在各自机器上运行 `npm ci`。

Windows PowerShell 示例：

```powershell
cd "C:\Tools\sketchup-ai-toolkit"
node --version
npm --version
npm ci
```

macOS 终端示例：

```sh
cd "$HOME/Tools/sketchup-ai-toolkit"
node --version
npm --version
npm ci
```

把示例目录替换为实际解压位置。`node --version` 应显示 `v24.x.x`。如果 Windows PowerShell 阻止执行 `npm.ps1`，可使用 `npm.cmd ci`，无需为本工具修改系统执行策略。

不要在配置生成后移动或删除源码目录；MCP 配置会记录当前 Node 和 `src/mcp-server.mjs` 的绝对路径。移动目录或更换 Node 安装位置后，重新生成配置即可。运行 SketchUp 插件使用 SketchUp 自带的 Ruby，无需另外安装 Ruby；开发测试才需要独立 Ruby。

## 2. 安装 SketchUp 桥接

先启动目标年份的 SketchUp 一次，再关闭该程序。在源码根目录执行以下命令；Windows 与 macOS 相同：

```sh
node scripts/setup.mjs --year 2020 --dry-run
node scripts/setup.mjs --year 2020 --install
```

安装 2026 时将年份改为 `2026`。不同年份分别执行一次，不需要复制整个源码项目。

默认插件目录：

| 系统 | 位置 |
| --- | --- |
| Windows | `%APPDATA%\SketchUp\SketchUp 2020\SketchUp\Plugins` |
| macOS | `~/Library/Application Support/SketchUp 2020/SketchUp/Plugins` |

若安装器没有找到默认目录，会停止并说明原因。确认自定义目录后，可显式指定：

```sh
node scripts/setup.mjs --year 2020 --plugins-dir "YOUR_PLUGINS_DIRECTORY" --dry-run
node scripts/setup.mjs --year 2020 --plugins-dir "YOUR_PLUGINS_DIRECTORY" --install
```

`YOUR_PLUGINS_DIRECTORY` 应替换成 SketchUp 实际读取的 **Plugins** 目录；显式目标可以尚未存在。脚本只复制 `alma_sketchup_mcp.rb` 和 `alma_sketchup_mcp/`，后者包含版本表与许可证声明。同名旧插件会完整备份到安装输出中显示的 `.alma-sketchup-mcp-backup-日期-随机值` 目录；替换失败时脚本尝试恢复旧文件。

重新打开 SketchUp，桥接默认自动启动。若已关闭自动启动，在 **扩展程序 / Extensions（部分版本显示 Plugins）→ Alma SketchUp MCP → Start Bridge** 中手动启动。桥接使用插件运行所在的 SketchUp 年份；后续 AI 配置的年份必须与此一致。

### 使用 RBZ 安装

也可在源码根目录执行：

```sh
node scripts/package-plugin.mjs
```

生成 `dist/sketchup-ai-toolkit.rbz`，在 SketchUp 扩展程序管理器中安装。RBZ 只包含 Ruby 插件；仍需保留 Node 服务源码并生成 MCP 配置。RBZ 安装通过 SketchUp 管理器执行，不经过脚本的旧插件备份流程；需要自动备份时使用前面的 `setup.mjs --install`。

## 3. 生成 MCP 配置

这些命令不要求电脑上已安装 SketchUp，也不修改任何文件：

```sh
node scripts/setup.mjs --year 2020 --config-only --format toml
node scripts/setup.mjs --year 2020 --config-only --format json
```

Codex 使用输出中的 `[mcp_servers.sketchup-2020]` TOML 表。使用 JSON 配置的客户端可将生成的 `mcpServers` 下的 `sketchup-2020` 条目合并到现有配置；Antigravity 的具体入口及字段以其当前版本支持的格式为准，可让 AI 通过客户端提供的配置工具完成。不要用整个新对象覆盖原有服务列表。

配置包含当前 Node 可执行文件、服务脚本绝对路径，以及：

| 环境变量 | 2020 示例 | 用途 |
| --- | --- | --- |
| `ALMA_SKETCHUP_YEAR` | `2020` | 指定目标年份，隔离通信目录 |
| `ALMA_SKETCHUP_AGENT_ALLOWED_RUNTIMES` | `mock,queue` | 允许离线模拟与真实 SketchUp 队列 |
| `ALMA_SKETCHUP_AGENT_ALLOW_QUEUE_MUTATION` | `1` | 允许桥接提交真实建模操作；现有会话及建模保护仍生效 |

2026 使用独立的 `sketchup-2026` 服务条目和年份变量。两者可以保存在同一客户端配置中；建模前明确指定目标年份。默认通信目录分别为用户目录下的 `.sketchup-mcp/versions/2020` 和 `.sketchup-mcp/versions/2026`。

合并后重新连接 MCP 或重启客户端。客户端必须将 Node 服务作为 **stdio MCP 服务**启动，不应把普通 HTTP 地址填进这些配置。

## 4. 安装建模 Skill

优先选择当前 AI 客户端的用户级 Skills 目录，便于在不同建模项目中使用；具体位置见 [客户端接入说明](ai-setup-prompt.md#客户端接入)。用户明确只用于某个工作区时，才选择那个实际工作区的 `.agents/skills`。安装器要求显式指定目标，不自动猜测客户端目录：

```sh
node scripts/install-skills.mjs --target "YOUR_SKILLS_DIRECTORY" --dry-run
node scripts/install-skills.mjs --target "YOUR_SKILLS_DIRECTORY" --install
```

把 `YOUR_SKILLS_DIRECTORY` 替换成客户端实际 Skills 根目录；安装后会形成 `该目录/sketchup-ai-modeling/SKILL.md`，并保留它的辅助文件。只有同名 Skill 会被替换，其他 Skills 不受影响。同名旧版本会备份到打印出的 `.sketchup-skills-backup-日期-随机值` 目录。

让客户端重新加载 Skills，或重启客户端。在新会话中确认能够读取 `sketchup-ai-modeling`。如果客户端尚不支持加载这种 Skill，可以先让 AI 读取源码中的 `skills/sketchup-ai-modeling/SKILL.md`，按其中步骤执行；是否能自动发现 Skill 以实际客户端能力为准。

## 5. 验证连接与建模

安装完成后的首次连接只做只读检查：

```sh
node scripts/doctor.mjs --year 2020
node scripts/doctor.mjs --year 2020 --live
```

第一条检查本地环境，第二条尝试连接真实桥接。随后让 AI 在客户端实际调用 `get_supported_versions`、`get_capabilities(runtime=queue)` 和 `get_model_info(runtime=queue)`，核对年份、当前模型及 Skill 加载情况。安装与配置授权本身不包含修改现有模型。

需要单独验收真实建模时，请在目标 SketchUp 中打开一个空白测试模型，然后向 AI 发送：

> 使用 sketchup-ai-modeling，连接 SketchUp 2020。先检查真实桥接和当前模型；确认连接成功后，在空白测试模型中创建一个长 10 米、宽 8 米、高 3 米、底面标高为 0 的简单无分层建筑实体，不加门窗、材料细节。汇报执行结果、实体数量与截图验证。没有连接时停止真实建模并说明原因。

这项建模测试确认以下结果：

1. MCP 服务能启动，报告正确年份。
2. SketchUp 的桥接已启动，真实队列检查能读取当前模型。
3. 在空白测试模型中执行简单体块后，SketchUp 视图和实体信息发生预期变化。
4. 保存到选定的测试文件后，再打开能看到相同几何。

离线 `mock` 结果用于检查计划和流程，不能作为 SketchUp 真机建模成功的证据。

## 屏幕、鼠标与系统权限

桥接主要通过本地文件队列和 SketchUp Ruby API 工作；SketchUp 原生视口截图由插件生成。这个 MCP 的常规建模流程本身不要求系统屏幕录制或辅助功能权限。

如果另外使用 AI 客户端的桌面截图、鼠标键盘或 UI 自动化功能，权限取决于具体客户端。macOS 可能需要你在系统设置中为该客户端开启屏幕录制、辅助功能或自动化权限；请按实际出现的系统提示手动确认，不能由安装脚本自动授予。Windows 的相应权限也由客户端与系统控制。手动点击几步更方便时，直接手动完成即可。

## 排查与回退

| 现象 | 处理 |
| --- | --- |
| 找不到 Plugins 目录 | 检查年份；启动该版本一次；确认后通过 `--plugins-dir` 指定实际目录 |
| 没有 Alma SketchUp MCP 菜单 | 检查加载器和同名文件夹是否都在 Plugins；重启 SketchUp，查看 Ruby 控制台加载错误 |
| MCP 无法启动 | 检查 Node 24、`npm ci`、配置的绝对路径，以及 AI 客户端的 MCP 日志 |
| 客户端启动了，但真实连接超时 | 在目标年份 SketchUp 中点击 Start Bridge；确认配置年份与应用年份一致 |
| 只返回模拟建模结果 | 明确要求真实队列连接；检查生成配置中的两个 agent 运行环境变量 |
| Skills 未发现 | 确认目标目录受客户端支持，层级为 `根目录/sketchup-ai-modeling/SKILL.md`，重新加载客户端 |
| 更新后需要回退 | 关闭 SketchUp，把当前两个插件条目移到其他目录，将安装器显示的备份中同名条目复制回 Plugins，再重启 |

回退 Skill 时，同样将备份中的 `sketchup-ai-modeling/` 恢复到 Skills 根目录。备份目录会保留供人工检查，脚本不自动清除历史备份。

## 开发检查与分发

```sh
npm test
npm run test:ruby
node scripts/package-plugin.mjs
node scripts/package-source.mjs
```

`test:ruby` 需要独立 Ruby，用于兼容层测试。仓库 CI 在 Windows 和 macOS 上执行 Node.js 24 的依赖安装与 Node 测试，并在独立 Linux 任务中运行 Ruby 测试；这些任务不启动商业 SketchUp 应用。

源码包输出为 `dist/sketchup-ai-toolkit-source.zip`，包含 Node 源码、Ruby 插件、版本表、文档、Skills、示例、脚本、测试、锁文件和许可证。它不携带 `node_modules`、本机 Node、SketchUp 模型、本地会话与构建输出。目标机器解压后仍需安装 Node.js 24 并执行 `npm ci`。
