# 场景清单与补全

适用街景、多体量、街角或参考图拍不全的建筑建模。先理解用户要复现的整个场景，不能仅选面积最大的建筑当作全部任务。图片依然由有视觉能力的调用方分析；栅格线条工具不会自动识别建筑类型和栋数。

## 场景判断

先判断是独立建筑、连续街墙、商业街转角、院落还是其他空间类型，写出照片依据。类型用于提出合理补全，不得覆盖已经可见的轮廓。区分独立楼栋、同栋不同翼部/体量、归属不明的沿街建筑组、同一底层的不同商铺。只有招牌不同不能证明是不同楼栋；遮挡导致边界不明时记录建筑组，不强行报确切栋数。

按照片区域建立清单：主体、左右沿街体量、远景、街道分支/地面、入口平台/台阶、主要雨棚/栏杆/招牌及必要景观。用户只要求单体时用 single_subject，要求街角/整图时用 full_scene。人物车辆通常可简化；用户特别关注的对象优先级从其要求确定。

为决定辨识度的轮廓和细节设置 high，并设 required:true：例如转角雨棚、橙色斜招牌、架高入口、黑色栏杆。先检查体量、街道方向和进退，再做这些细节，最后增加低优先级配景。不要只增加窗格数量来替代结构纠偏。

## 拍不全时如何补

- visible：可见内容；partial：树木遮挡、照片裁切等部分可见内容；unseen：完全不可见的补全部分。
- observed 只用于图像实际可见依据；inferred 记录重复节奏、连续檐口、透视或类型推断；assumed 用于证据不足但为封闭体量而提出的设计选择。
- 同一建筑可见立面与未见屋顶/背面分成不同清单项，使用 part_of 关系，避免把推断部分混成观察事实。
- visible_only 不生成 unseen 项；用户要求完整体量时用 plausible_complete 提出补全。屋顶高度、背面深度等仍按主技能的参数确认和工具审查流程处理；模式名称或清单状态不代表已经取得确认。
- 补全保留建筑类型、理由、受影响零件和可修改参数。被树挡住的规则窗格可按节奏提出延续；没有证据的背面优先简化闭合，不编造高辨识度设计或未知文字。

## 结构化接口

`image_artifact` 的 `action:structure` 输入新增 `scene_reconstruction`。建筑域 `goal:complete_model` 必须携带或继承清单；`goal:understanding` 可先整理观察。文件式 `prepare_image_modeling_brief` 从 observations.json 的同名字段读取，传入 JSON/Markdown 简报；`compile_reviewed_part_graph` 对照该清单核对 PartGraph。

完整字段以项目 `schema/scene-reconstruction-v1.schema.json` 为准。每项含 id、label、kind、visibility、provenance、evidence、part_ids、required、priority；可见或部分可见项须有 source_region，使用原图归一化 [left, top, right, bottom]。building_type 可记录类型推断。part_ids 与实际 PartGraph id（图片路径为 instance_id）相同，多个清单项不能复用同一个零件来假装分别建模。父体量和附属构件用不同 id，再用 part_of 表达归属。

relations 支持 adjacent、connected、occludes、behind、part_of、must_not_merge，记录双方清单 id、来源和证据。关系是待几何/视角核对的要求，不自动生成连通几何或移动对象。

以下只演示字段，区域和类型不是用户照片测量值。真实任务应列全用户要求的体量与细节，而不是照搬两项示例：

```json
{
  "version": 1,
  "scene_type": "commercial_street_corner",
  "scope": "full_scene",
  "completion_mode": "plausible_complete",
  "entities": [
    {
      "id": "main_mass", "label": "转角商业主体", "kind": "building",
      "building_type": "commercial_block",
      "visibility": "partial", "provenance": "observed",
      "source_region": [0.3, 0.0, 0.85, 0.65],
      "evidence": "两个可见商业立面在转角连接，顶部被裁切",
      "part_ids": ["main_mass"], "required": true, "priority": "high"
    },
    {
      "id": "left_group", "label": "左侧沿街建筑组", "kind": "building_group",
      "visibility": "partial", "provenance": "observed",
      "source_region": [0.15, 0.25, 0.3, 0.65],
      "evidence": "沿街向远处延伸，有遮挡，独立楼栋数量尚不明确",
      "part_ids": ["left_near", "left_far"], "required": true, "priority": "high"
    }
  ],
  "relations": [
    {"from": "main_mass", "to": "left_group", "type": "must_not_merge", "provenance": "observed", "evidence": "应保留可见体量分段与进退"}
  ]
}
```

## 覆盖与验收

编译会报告 scene_required_part_missing，指出遗漏清单项和零件。被禁用或在 v2 装配树中不可达的零件不能充数。清单随图片理解版本保留，并进入实时建模审查资料；修改清单或补全参数后重新核对受影响内容。

`declared_coverage_complete` 只证明必需零件在编译图中存在，不证明图像清单本身完整、体量关系正确或模型外观相似。必须回到原照片视角检查：建筑/街道是否漏项，转角轮廓、街道纵深与空隙是否吻合；用局部视角核对高优先级细节，用额外视角核对连通与补全。记录每个问题对应对象并局部修正。建筑组数量不能作为经确认的楼栋数。

最终分别说明：可见区域还原、已采用的推断补全、未完成细节和实测/视觉检查。主要文字另按 signage.md 验收；不要把“编译通过”或 mock 包围盒当作原生视觉验收。
