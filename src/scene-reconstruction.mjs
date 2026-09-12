import fs from 'node:fs';
import Ajv2020 from 'ajv/dist/2020.js';

const schema = JSON.parse(fs.readFileSync(new URL('../schema/scene-reconstruction-v1.schema.json', import.meta.url), 'utf8'));
const validate = new Ajv2020({ allErrors: true, strict: false }).compile(schema);

// Validates declared scene coverage, not image recognition or visual/geometric accuracy.
export function validateSceneReconstruction(scene) {
  if (!validate(scene)) throw new Error(`Invalid scene reconstruction: ${JSON.stringify(validate.errors)}`);
  const ids = new Set();
  const owners = new Map();
  for (const entity of scene.entities) {
    if (ids.has(entity.id)) throw new Error(`Duplicate scene entity: ${entity.id}`);
    ids.add(entity.id);
    if (entity.visibility !== 'unseen') {
      const r = entity.source_region;
      if (!r || r[0] >= r[2] || r[1] >= r[3]) throw new Error(`Scene ${entity.id}: visible evidence needs normalized [left, top, right, bottom] region`);
    } else {
      if (entity.provenance === 'observed') throw new Error(`Scene ${entity.id}: unseen geometry cannot be observed`);
      if (scene.completion_mode === 'visible_only') throw new Error(`Scene ${entity.id}: unseen completion requires plausible_complete mode`);
    }
    for (const id of entity.part_ids) {
      if (owners.has(id)) throw new Error(`Scene entities ${owners.get(id)} and ${entity.id} share part ${id}; preserve separate identity and use part_of for hierarchy`);
      owners.set(id, entity.id);
    }
  }
  for (const relation of scene.relations) {
    if (!ids.has(relation.from) || !ids.has(relation.to) || relation.from === relation.to) throw new Error('Scene relation requires two distinct known entities');
  }
  return scene;
}

export function assessSceneCoverage(scene, graph = null) {
  if (!scene) return { status: 'not_provided', coverage_verified: false, visual_verified: false, blockers: [] };
  validateSceneReconstruction(scene);
  const parts = new Map((graph?.parts || []).map(p => [p.id || p.instance_id, p]));
  const emitted = new Set();
  const visit = id => {
    if (emitted.has(id)) return;
    const p = parts.get(id);
    if (!p || p.compile?.emit === false || (!p.shape && !p.assembly?.children?.length)) return;
    emitted.add(id);
    for (const child of p.assembly?.children || []) visit(child.part_id);
  };
  if (graph?.version === 2 && graph.roots) for (const root of graph.roots) visit(root.part_id);
  else for (const id of parts.keys()) visit(id);
  const missing = graph ? scene.entities.filter(e => e.required).flatMap(e => e.part_ids.filter(id => !emitted.has(id)).map(id => ({ entity_id: e.id, part_id: id, priority: e.priority }))) : [];
  return {
    status: !graph ? 'inventory_ready' : missing.length ? 'incomplete' : 'declared_coverage_complete',
    coverage_verified: graph !== null && missing.length === 0,
    visual_verified: false,
    scope: scene.scope,
    completion_mode: scene.completion_mode,
    building_entities: scene.entities.filter(e => e.kind === 'building').map(e => e.id),
    building_groups: scene.entities.filter(e => e.kind === 'building_group').map(e => e.id),
    building_count_is_verified: false,
    inferred_entities: scene.entities.filter(e => e.provenance !== 'observed').map(e => e.id),
    missing,
    blockers: missing.map(e => `scene_required_part_missing:${e.entity_id}:${e.part_id}`),
    visual_checks: [
      'Compare all building masses, street depth and negative spaces from the source camera.',
      'Check high-priority silhouettes, canopies, entrance levels, railings and primary signage in close-up.',
      'Check declared adjacency, connectivity and occlusion in source view and another view.',
      'Inspect unseen completion for continuity; keep inferred dimensions and geometry labeled as estimates.'
    ]
  };
}
