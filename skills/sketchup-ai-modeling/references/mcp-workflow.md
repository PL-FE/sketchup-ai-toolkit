# MCP 调用与恢复

这些是本工具包的无前缀工具名。先发现当前客户端已暴露的 MCP 工具，再使用实际前缀；不要假定存在其他仓库的同名接口。以下 JSON 是参数示例，示例中的 ID 必须替换为本次返回值。调用 schema 与工具返回的 `next_action` 优先于本文示例。

## 发现与只读连接

首先调用 `start_agent_task`：

```json
{"intent":"discover","instruction":"发现可用建模入口和当前版本能力。","inputs":{"topic":"start"}}
```

然后按需要使用：

| 目的 | 工具与参数 |
|---|---|
| 查询任务类型 | `start_agent_task`，`intent:discover`，`inputs:{topic:"tasks"}`；所有调用都带非空 `instruction` |
| 查看某类型的参数 | 同上，`inputs:{topic:"tasks",kind:"window",detail:"parameters"}` |
| 查看完整示例 | 同上，`inputs:{topic:"tasks",kind:"window",detail:"examples"}` |
| 编辑/材质/保存工作流 | 同上，`inputs:{topic:"workflows"}`，再按返回值选择 `task_name` |
| 实时只读连接 | 同上，`inputs:{topic:"connect",runtime:"queue"}` |
| DSL 与坐标约定 | `get_docs({topic:"dsl",detail:"full",max_chars:30000})`；另查 `topic:"coordinates"` |
| Agent 合约 | `get_docs({topic:"agent_contract",detail:"standard",max_chars:16000})` |
| 复杂创建入口 | `get_workflow_bundle({})`，选择当前返回的 create 工作流 |

只读连接返回实际模型、运行时能力和短期 `connection_task_id`。核对目标文件/文档、年份及源文件兼容性；连接成功不会批准写模型。当前通用结构化 task 类型为 `window`、`door`、`cabinet`、`sink_counter`、`asset_placement`；将来新增类型应重新发现。不能自行发明 `kind:building` 或 `kind:landscape`。组合场景使用公开 DSL/工作流。

`create_queue_handshake({})` 是直接专家接口，返回签名 `session_contract`。Gateway 的 `discover/connect` 已在服务端保存这个合约，因此使用其 `connection_task_id` 即可；不要同时提交这两个字段。直接实时工具要求合约时，应传递完整的实际返回对象，不自行拼装或修改。

## 两种预检

1. **需求预检**：若客户端已暴露 `preflight_design_brief`，提交 `{"brief":{...}}`，schema 以工具为准。用于检查来源、缺失值和确认状态。`ready_for_modeling` 不是人的批准，也不是质量验收。
2. **构件预检**：通用任务使用 `start_agent_task` 的 `intent:preflight_model`，`inputs:{task:完整任务}`。构件任务参数是键值对象，通常 `units:"mm"`；它不是 brief 的参数数组。按发现的 schema 从已确认 brief 生成构件任务，不把两者混用。

纯预检不应声称已接触或修改 SketchUp。在缺失值或假设未获用户确认期间，可继续只读分析、整理参数、离线编译预览；不开始 live 建模。

## 创建、编辑与验收

对通用构件，以预检通过的同一 `task` 调用 `start_agent_task`：`intent:create_model`，`inputs` 包含 `task`、`runtime:"queue"`、新鲜 `connection_task_id`，并为这次逻辑建模操作设置稳定 `idempotency_key`。先确认来源表已获得所需的真实用户确认。

对建筑/景观组合，从 `get_workflow_bundle` 和 DSL 文档取得 `create_model` 的当前输入。`inputs.code` 为 JSON DSL 字符串，规范可能还要求 `spec`、`detail_spec` 或冻结验收条件；完整要求以服务器为准。没有受支持的生成路径时，说明缺少哪个操作/生成器，不退回任意 Ruby 执行。

优先用 `start_agent_task(intent:"understand_model",...)` 只读理解已有模型。直接使用 `adopt_open_model` 时必须显式 `read_only:true` 才能当作只读。修改流程通过 `discover/workflows` 选择 `edit_single`、`edit_linked`、`local_repair` 等实际任务；它们可能返回待补参数或本地主机审查。只有完整共享实例绑定被确认时才能批量修改关联实例。

`verify_model` 是 `start_agent_task` 的 **intent**，不假定有同名独立工具。按发现的验收工作流提供创建/编辑任务引用，并使用原生测量和视口证据。`capture_view` 和 `capture_detail_views` 会控制相机/场景，服务端把它们当作受保护操作；不要作为无条件只读捷径。`validate_model` 若带 `code` 可能先创建几何；只检查已有结果时按工具要求提供 `snapshot`。

完成并通过验收的通用 live 创建可使用 `intent:deliver_model`，`inputs:{source_task_id,runtime:"queue",connection_task_id}`，保留稳定幂等键。其他创建/编辑路线从 `discover/workflows` 的 `save_reopen_resume` 获取合适模板，不假定所有 task 都能直接 deliver。

磁盘重开使用服务器实际支持的 `intent:reopen_delivered_model`、保存回执和新鲜连接。某些年份/平台不支持完整生命周期；只有能力检查与结果都确认才执行，不能把 macOS 路线套到 Windows。不要为验证主动丢弃未保存的更改。

## 状态与失败

- 保存每次 `task_id`；`resume_agent_task({task_id})` 查询原任务，`submit_agent_task_input({task_id,input,...})` 补其 `next_action` 请求的输入。
- 用 `read_agent_artifact` 读取 opaque handle；不用从 ID 猜文件路径。客户端没有本地文件权限时也不假定失去全部能力。
- `HANDSHAKE_*` 表明文档/版本/修订/时限绑定失效：重新只读连接，核对文档与计划是否仍一致，再遵循任务恢复指示。
- `QUEUE_*` 先查 `queue_diagnostics` 并等待或检查原任务；不自动删除锁、请求或响应。
- 超时、`MUTATION_RECOVERY_REQUIRED` 或 outcome unknown 先 `resume_agent_task`；不要生成新幂等键重放，不并行向同一模型发变更。
- 工具 `retryable:true` 只是错误分类，不表示重复写入安全。保留服务器的操作回执和恢复条件。
