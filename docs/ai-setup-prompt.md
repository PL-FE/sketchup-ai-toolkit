# AI 安装提示词与操作说明

用户入口是 [README 中可直接复制的提示词](../README.md#最省事的开始方式把这段话发给-ai)。本页给执行安装的 AI 使用：优先完成已授权、可验证的动作，缺少关键环境选择或遇到只能由用户授权的系统界面时，再集中提出具体问题。

## 从指定仓库获取并准备项目

项目来源：[PL-FE/sketchup-ai-toolkit](https://github.com/PL-FE/sketchup-ai-toolkit)。用户可以从任意工作区发起安装。AI 先浏览该仓库中的 `README.md`、`docs/ai-setup-prompt.md` 和 `docs/installation.md`，然后自行获取源码、选择目录并继续配置。

1. 当前工作区、已知项目或已配置的 MCP 路径中已有同源完整副本时可以复用；核对来源与项目结构，并保留本地修改。否则自动选择可长期保留的专用目录，例如实际用户文档目录下的 `AI-Tools/sketchup-ai-toolkit`；从 OS 获取真实文档位置，不假定 Windows 文档目录没有重定向。位置被占用时保留原内容并选择新目录。
2. 需要获取源码时，运行 `git clone https://github.com/PL-FE/sketchup-ai-toolkit.git "PERSISTENT_SOURCE_DIRECTORY"`，将占位路径换成上一步选好的目录。没有 Git 时，通过该仓库的 **Code → Download ZIP** 或实际提供的源码下载入口取得 ZIP，由 AI 自行解压到选定位置。解压时限制路径位于目标目录内，保留原 ZIP 和已有文件。MCP 不应指向临时目录，不要用同名仓库或搜索排名替代这个明确来源。
3. 确认 `package.json` 的 `name` 为 `sketchup-ai-toolkit`，且包含锁文件、`src/mcp-server.mjs`、`config/sketchup-versions.json`、`skills/sketchup-ai-modeling/SKILL.md` 与安装脚本。记录实际取得的来源与版本；已有 Local MCP for SketchUp / SU2026 安装不能仅因用途相近就当作本项目。RBZ 仅有 SketchUp 端，仍需配套源码。

记录确定的绝对源码路径，后续命令显式在该目录执行，生成 MCP 配置时使用该路径。无法联网或缺少必要工具时，可复用已知的同源本地副本或源码 ZIP；仍不能继续时，只询问缺少的访问条件或一个可用源码位置。仓库访问失败时报告真实响应，不声称已下载，也不把全目录搜索作为主流程。

## 自动配置流程

1. 在上面找到并准备好的项目根目录，确认源码、锁文件、插件、Skills 和安装脚本完整；阅读该副本的 README 与安装说明。源码缺文件时修复明确的获取/解压问题，再运行安装。
2. 检查 OS、已安装的 SketchUp 年份、运行中的目标程序及未保存文档、Node 与 npm。多个年份且用户没有指定时询问选择；目标 2020 未安装时，不用 2026 冒充验收。
3. Node 需要 24.x。已存在合适安装时复用，缺少时按当前机器可用的官方安装方式安装。不得用 macOS 的二进制或 node_modules 复制给 Windows。不要为了配置本项目移除其他 Node 版本。
4. 运行 `npm ci` 和 `node scripts/doctor.mjs --year YEAR`。Windows 可用 `npm.cmd`。记录真实退出码，失败时修复明确原因。
5. 先运行 `node scripts/setup.mjs --year YEAR --dry-run` 检查目标。用户的安装提示词已经授权安装，不需要每一步重新确认；但不能强制关闭有未保存文档的 SketchUp。目标程序关闭后执行 `--install`，保留打印的备份路径。
6. 用 `node scripts/install-skills.mjs --target CLIENT_SKILLS_ROOT --install` 安装。README 的通用安装提示词默认要求跨项目使用，优先用下表的当前客户端用户级目录。用户指定只对某工作区生效时，才安装到那个实际工作区的 `.agents/skills`。工具包源码目录可能不是客户端当前工作区，不能仅在工具包目录内创建 `.agents/skills` 就声称当前聊天已加载技能。不要覆盖其他技能。
7. 生成目标年份配置，使用当前客户端支持的配置工具合并。若编辑文件，先备份，只更新该服务条目，保留其他 MCP 和设置；用对应 JSON/TOML 解析器检查。配置信息以生成结果为准，不复制文档中的占位绝对路径。
8. 启动目标 SketchUp。插件默认自动启动；自动启动被关闭或尚未加载时，使用菜单 Start Bridge。重新加载 MCP / Skills，必要时重启客户端。当前会话无法发现新工具时，说明需要新会话，不能假装已经加载。
9. 运行 `node scripts/doctor.mjs --year YEAR --live`，并在客户端实际调用 `get_supported_versions`、`get_capabilities(runtime=queue)`、`get_model_info(runtime=queue)`。文件写入成功不等于客户端已经连接。
10. 最终按“已完成 / 仍需用户操作 / 未验证”汇报：安装位置、备份路径、客户端配置位置、Node 路径、MCP 年份、Skill 发现结果、只读连通结果。安装验收不修改现有模型。建模测试应在用户明确的新建测试模型中执行。

如果用户愿意手动完成一次点击，给出菜单名和完成标志即可；不要为了替代一两次点击反复尝试不可靠的 UI 自动化。

## 客户端接入

核对日期：2026-09-12。不同版本可能保留旧路径；优先检查当前客户端实际打开的配置文件。

| 客户端 | MCP | Skills |
| --- | --- | --- |
| Codex | MCP CLI 或配置中的 `mcp_servers` TOML；用户配置通常为 `~/.codex/config.toml`，设置了 CODEX_HOME 时读取实际位置 | 工作区 `.agents/skills`；用户级 `~/.agents/skills` |
| Antigravity | JSON 的 `mcpServers`；当前文档为 `~/.gemini/config/mcp_config.json` 或工作区 `.agents/mcp_config.json` | 工作区 `.agents/skills`；用户级 `~/.gemini/config/skills` |

Codex 可以按生成配置执行等效 CLI 命令（路径由当前机器生成替换）：

```sh
codex mcp add sketchup-2020 --env ALMA_SKETCHUP_YEAR=2020 --env ALMA_SKETCHUP_AGENT_ALLOWED_RUNTIMES=mock,queue --env ALMA_SKETCHUP_AGENT_ALLOW_QUEUE_MUTATION=1 -- "/ABSOLUTE/PATH/TO/node" "/ABSOLUTE/PATH/TO/sketchup-ai-toolkit/src/mcp-server.mjs"
```

先检查同名服务，避免意外覆盖。CLI 不存在或损坏时使用客户端设置中的自定义 MCP 配置入口，或对实际 TOML 进行有备份的定向合并；不要因此宣称 MCP 不可用。参考 [OpenAI MCP 文档](https://developers.openai.com/codex/mcp)和 [Skills 文档](https://developers.openai.com/codex/skills)。

Antigravity 可通过 Agent 面板的 **MCP Servers → Manage MCP Servers → View raw config** 找到当前配置。将 `node scripts/setup.mjs --year YEAR --config-only --format json` 的服务条目合并到现有 `mcpServers`，之后刷新。参考 [Google MCP 文档](https://antigravity.google/docs/mcp)和 [Skills 文档](https://antigravity.google/docs/skills)。旧版路径若与上述不同，以实际界面显示的文件为准。

本项目生成配置默认允许 mock 和 queue，并允许经过服务端会话/审查保护的实时操作。不要为了避免确认而打开任意 Ruby 调试执行、绕过现有模型审查或关闭客户端全局权限检查。

## 权限与界面辅助

MCP 本体使用本地文件队列、SketchUp Ruby API 和原生视口导出。它不是屏幕录制或鼠标控制服务。常规安装与建模只需让 Node 和 SketchUp 能读取项目/素材及写入指定状态和输出目录。

如果当前 AI 客户端已提供桌面操作工具，可用它帮助打开 SketchUp、点击扩展菜单或定位授权页面。客户端没有这类能力时，向用户说明缺少该工具，让用户完成所需点击；不能仅写一个 Skill 就宣称获得了电脑控制能力。

macOS 的可选权限：

- **屏幕与系统音频录制**：只有外部桌面截图/录屏功能需要时，为实际使用该能力的应用授予屏幕权限。本项目无需音频录制。
- **辅助功能**：只有需要鼠标键盘或 UI 操作时，为实际执行控制的应用授权。
- **自动化、文件与文件夹**：出现系统提示且与所需操作有关时，说明访问对象后由用户确认。

授权位于 **系统设置 → 隐私与安全性**，旧版系统可能叫“系统偏好设置”。必须由用户按系统机制授权；不得修改权限数据库、绕过提示或凭设置命令退出码声称授权完成。参考 Apple 的[屏幕录制说明](https://support.apple.com/en-ie/guide/mac-help/mchld6aa7d23/mac)和[辅助功能说明](https://support.apple.com/en-lamr/guide/mac-help/mh43185/mac)。

Windows 没有与上述 macOS 面板一一对应的本项目要求。按实际客户端的屏幕捕获和桌面控制提示配置；遇到 UAC / 安全桌面交给用户操作。常规 MCP 安装不应要求关闭 UAC、防火墙或以管理员身份长期运行。

权限授予后要用实际截图或一次无破坏的 UI 操作确认能力可用。此验证与 SketchUp 建模的原生测量验收分开记录。

## 故障时保持可继续

只读连接失败：先检查年份、插件加载/启动、目录和文件权限。一次超时不应触发重复建模或删除队列。SketchUp 尚未安装、插件被宿主禁止加载、客户端需要重启等情况，要保留已完成配置并给出最短下一步。

用户必须参与的事项集中一次说明：例如“请保存并关闭 SketchUp；安装后重新打开”，或“请在辅助功能中启用当前应用，再回到这里”。完成后从失败步骤继续，不重复覆盖已配置内容。
