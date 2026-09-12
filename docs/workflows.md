# 建模工作流

本工具包以现有 SketchUp MCP 为基础，为不同年份和平台提供适配，并附带 [SketchUp AI 建模技能](../skills/sketchup-ai-modeling/SKILL.md)。技能是一套客户端可读取的工作指令，不会自动安装模型、扩展 SketchUp 原生能力或替代真人确认。

Codex 可从已配置的技能目录加载整个 `sketchup-ai-modeling` 文件夹。其他客户端若支持相同技能格式，可按其机制加载；否则把 `SKILL.md` 及本次用到的 `references/` 文件作为项目指令提供。Antigravity 的具体技能发现目录与 MCP 配置界面以实际版本为准，本项目不假定某个未经验证的路径。

## 从需求到模型

1. **发现连接**：查看 MCP 工具列表，用 `start_agent_task` 的 `discover` 入口获得当前任务、工作流和只读连接；确认实际 SketchUp 年份和打开的文档。
2. **整理参数**：保留用户原始单位、尺寸和范围。图片中看不到的高度、厚度、结构与尺度列为缺失；能提出的方案值标为待确认，写明来源。
3. **确认方案**：把具体参数表展示给用户。用户确认后才更新状态；参数表的自动校验不会验证这一步。
4. **离线预检**：需求 brief 通过 `preflight_design_brief` 校验；选定通用构件时再用 `preflight_model` 检查配方范围和依赖。组合建筑/景观从已发现的 DSL 工作流生成预览。
5. **实时白模**：使用新鲜连接和稳定幂等键创建边界、主要体量与标高，先看视口和测尺寸。
6. **构件细化**：逐步增加可定位的群组/组件、参数关联、细节与当前年份支持的材质；修改已有对象遵守服务器审查流程。
7. **原生验收**：比较实际尺寸、净空、数量与预期，并检查视角、面方向、连接和重叠。
8. **保存与交付**：按支持的保存工作流取得版本文件和回执，记录实际执行过的检查；未做磁盘重开或未实现的参数编辑能力直接说明。

如果用户只要求方案或代码，执行到可审查结果即可，不启动实时建模。缺失信息期间仍可进行只读分析与离线预览。

## 参数来源与确认

使用 [design-brief.example.json](../examples/design-brief.example.json) 演示参数预检。它是一段**虚构的教学需求**：假设用户只给出了 12 m × 9 m 场地，并希望参考图片建一个庭院。其余参数尚待核对；它不能作为真实项目或已获批准的设计输入直接执行。

传给 `preflight_design_brief` 的参数为：

```json
{
  "brief": {
    "instruction": "依据庭院参考图整理可编辑模型需求，先确认尺寸。",
    "units": "m",
    "parameters": [
      {"name":"reference_distance","value":null,"unit":"m","source":"image","status":"missing","required":true},
      {"name":"pergola_height","value":2.7,"unit":"m","source":"assumed","status":"pending","required":true,"notes":"概念建议，尚未得到用户确认。"}
    ]
  }
}
```

`units` 接受 `mm`、`cm`、`m`、`in`、`ft`。参数 `value` 可为数值、布尔值、非空字符串或一维标量数组。未知值必须为 `null` 且状态为 `missing`；不要把 0 当成缺失。`unit` 是保留的单位标签，预检不会换算、验证角度/面积标签或分析图片。

来源 `user` 表示用户给定，`image` 表示来自图像，`derived` 表示计算/推断，`assumed` 表示方案假设。测量值使用 `derived` 时，务必在 `notes` 区分“原生测量记录”与“预测计算”，记录实体、工具和修订/测量来源。状态 `confirmed` 仅是调用方的声明；真实确认必须来自用户对具体参数的回复。确认之后仍保留原来源，不能把假设改成实测。

输出中的 `missing`、`needs_confirmation`、`proposed_parameters` 都包含完整参数记录。存在必需缺失值或任何 pending 值时，`ready_for_modeling` 为 false。optional missing 表示本次明确不建/不提供该项，不能成为自动补默认值的许可。

即使返回 true，`assessment_scope` 仍是 `declared_parameters_only`，`consent_verified` 仍是 false。调用方还须检查需求是否漏掉关键参数、是否有真实用户确认、单位是否正确、当前能力与文档是否吻合。`reference_images` 只是标识/路径列表，`constraints` 只是上下文文本；该工具不读取图片，也不验证约束句子。

## 三类典型任务

| 任务 | 建议输入 | 先做什么 | 重点验收 |
|---|---|---|---|
| 图片复现 | 参考图、至少一项可定位尺度、目标范围和精度 | 图片校正、来源表、缺失/预测参数确认 | 标定尺度、关键轮廓、视角、未见部分 |
| 景观庭院/场地 | 边界、地形/标高、路宽、保留对象、种植/构筑物需求 | 边界/地形/主路白模 | 范围、路径宽度、标高衔接、对象数量/间距 |
| 建筑 | 平立剖或总体尺寸、楼层、层高、厚度、门窗和屋面 | 体量/楼层/开口白模 | 总高、层间标高、墙板和洞口、原生构件关系 |

详细执行指令分别见 [图片](../skills/sketchup-ai-modeling/references/image-modeling.md)、[景观](../skills/sketchup-ai-modeling/references/landscape.md)、[建筑](../skills/sketchup-ai-modeling/references/architecture.md)。这里描述的是组合工作流，不表示新增了一个涵盖所有设计的专用生成器。

## 调用约定与边界

开始调用的合法最小示例：

```json
{"intent":"discover","instruction":"发现当前建模入口。","inputs":{"topic":"start"}}
```

工具是 `start_agent_task`。进一步查询 `inputs.topic:"tasks"` 或 `"workflows"`；只读连接用 `inputs:{topic:"connect",runtime:"queue"}`。每次都需要非空 `instruction`。`verify_model`、`preflight_model`、`deliver_model` 是该工具的 intent，不是必然存在的独立工具。

当前通用结构化 task 是 `window`、`door`、`cabinet`、`sink_counter`、`asset_placement`，参数格式与 brief 不同。建筑和景观使用实际支持的 DSL 组合；不要把图像参数数组直接作为 `inputs.task.parameters` 发送。原有几何 DSL 以毫米为单位，brief 使用米等单位时必须在生成阶段明确换算。

连接引用 `connection_task_id` 由服务端生成。直接专家工具要求 `session_contract` 时使用原样返回的完整合约，两种绑定方式不混用。能力探测、需求参数确认和服务器执行许可各自解决不同问题。某些修改还要求本地主机审查；客户端不可伪造审批字段。

发生超时先用 `resume_agent_task` 恢复已有 task ID，按 `next_action` 补输入。幂等键绑定一次逻辑操作；重试保留同一键。不要清队列或重新创建整个模型来“试一次”。详细 [MCP 调用与恢复](../skills/sketchup-ai-modeling/references/mcp-workflow.md) 与运行时 `get_docs` 共同说明这些限制。

图生网格与多照片重建作为可选方向，尚不能替代原生可编辑建筑构件，见 [参考项目](references.md)。本工具包没有因为列出这些项目就安装或集成其模型。
