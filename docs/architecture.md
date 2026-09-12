# 架构与增加年份

```text
Codex / Antigravity（理解图片、参数确认、调用 Skill）
    │ MCP stdio
Node 服务（工具、brief 预检、任务与审查、模型会话合约）
    │ 带 target_year 的本地文件队列
SketchUp Ruby 插件（实际年份检查、API 检查、事务、几何与视口）
```

`src/` 和 `schema/` 保留现有 MCP 的公共核心。`config/sketchup-versions.json` 是年份注册表；Node 使用 `ALMA_SKETCHUP_YEAR` 选择目标，未设置时为 2020。Ruby 使用真正的 `Sketchup.version`，不会把客户端指定年份当作宿主版本。

默认状态目录是 `~/.sketchup-mcp/versions/YEAR`，其中 queue、processing、responses、锁、任务、mock 会话按年份分离。每个队列请求带 `target_year` 和 `transport_version`；每个响应带 bridge 年份与协议。写操作发送前先做只读版本探测，插件在进入 dispatch 前再校验。旧版无年份响应不会被视为兼容。现有 session/document/revision/source-hash 保护保持生效。

按年份支持不同 SketchUp 进程；同一年份同时启动多个独立进程会竞争同一个队列，不属于当前支持的使用方式。宿主里多个模型的操作范围仍受现有文档绑定保护。

`ALMA_SKETCHUP_STATE_DIR` 等目录覆盖主要供隔离测试/高级配置。Ruby 当前使用其默认按年目录，单独修改 Node 目录不会迁移 Ruby 通信位置。普通安装应使用默认值。

## 新增年份

1. 阅读该版本的 SketchUp API 发布说明，确定内置 Ruby、操作系统与 API 差异。
2. 在 `config/sketchup-versions.json` 添加 profile。`sketchup_major` 是宿主大版本，例如 2024 对应 24；`minimum_ruby` 是本适配代码的最低 Ruby 要求，不是宿主实际 Ruby 版本声明。
3. 配置 `native_pbr`、`native_environments` 等能力；若需要额外差异，在 `version_adapter.rb` 和相应操作模块实现检测或明确拒绝。不要把改一个年份数字当作兼容证明。
4. 将注册表同步到 `sketchup_plugin/alma_sketchup_mcp/sketchup-versions.json`。安装器和打包器也会携带最新中央注册表。
5. 运行 Node、Ruby 和包检查；增加目标版本的能力/负例测试。若修改受校验的 `model_revision.rb` 或 `boolean_operations.rb`，需要重新计算对应 SHA-256，并一起审查源码和 `runtime_source_manifest.rb`；不得简单删除校验。`.gitattributes` 固定文本 LF 换行，防止 Windows Git 自动换行改写受校验的源文件字节。
6. 在对应 Windows/macOS 宿主完成建模验收。`validation` 先保留 `pending-host-test`，文档分别记录系统、年份和构建号，不能用另一年份的结果代替。

## 图片与建模参数

Skill 负责图像理解、关键条件检查和对话中的真人确认。`preflight_design_brief` 是纯函数式工具，仅检查声明的数据完整性，输出声明范围的 ready 状态；它不读取图片、不生成维度、不签发真人审批。

这与现有 MCP 的持久任务、几何编辑审查及会话合约互补。brief 的 confirmed 字段不会转成审批 token，也不能解除运行时限制。

当前建筑/景观是 Skill + DSL 组合工作流。原生几何编辑、持久参数化配方、摄影重建和生成式资产是不同能力；没有实现或测试的部分应在交付时明确说明。
