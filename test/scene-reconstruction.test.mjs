import test from 'node:test';
import assert from 'node:assert/strict';
import { validateSceneReconstruction, assessSceneCoverage } from '../src/scene-reconstruction.mjs';
import { compilePartGraphToSketchUpDsl } from '../src/product-modeling/part-graph-compiler.mjs';
import { mergeImageUnderstanding, compileImageModel } from '../src/image-structure.mjs';
import { buildMcpModelingBrief, renderMcpModelingBriefMarkdown } from '../src/image-modeling-brief.mjs';

const entity = (id, kind = 'building') => ({ id, label: id, kind, visibility: 'partial', provenance: 'observed', evidence: 'Visible facade in the source region; building ownership uncertain.', source_region: [0.1,0.1,0.5,0.9], part_ids: [id], required: true, priority: 'high' });
const scene = () => ({ version: 1, scene_type: 'commercial_street_corner', scope: 'full_scene', completion_mode: 'plausible_complete', entities: [entity('main'),entity('left','building_group'),entity('street','street'),entity('canopy','canopy')], relations: [{ from:'main',to:'left',type:'must_not_merge',provenance:'observed',evidence:'Separate visible massing'}] });
const graph = () => ({ version:1,parts:scene().entities.map((e,i)=>({ id:e.id,name:e.id,shape:{primitive:'box',parameters:{origin:[i*100,0,0],size:[50,50,50]}} })) });

test('scene inventory does not turn groups into verified building counts', () => {
  const result = assessSceneCoverage(scene());
  assert.deepEqual(result.building_entities, ['main']);
  assert.deepEqual(result.building_groups, ['left']);
  assert.equal(result.building_count_is_verified, false);
  assert.equal(result.coverage_verified, false);
  assert.equal(result.visual_verified, false);
});

test('compiler blocks the single-building collapse and omitted identity details', () => {
  for (const id of ['left','street','canopy']) {
    const g=graph();g.parts=g.parts.filter(p=>p.id!==id);
    assert.throws(()=>compilePartGraphToSketchUpDsl(g,{}, {includeReset:false,sceneReconstruction:scene()}),new RegExp(`scene_required_part_missing:${id}:${id}`));
  }
  const result=compilePartGraphToSketchUpDsl(graph(),{}, {includeReset:false,sceneReconstruction:scene()});
  assert.equal(result.operations.length,4);
  assert.equal(assessSceneCoverage(scene(),graph()).visual_verified,false);
});

test('suppressed and unreachable assembly parts cannot satisfy coverage', () => {
  const g=graph();g.parts[1].compile={emit:false};
  assert.equal(assessSceneCoverage(scene(),g).missing[0].part_id,'left');
  delete g.parts[1].compile;g.version=2;g.roots=[{part_id:'main'}];
  assert.equal(assessSceneCoverage(scene(),g).missing.length,3);
});

test('unseen completion retains inference and requires explicit completion mode', () => {
  const s=scene();s.entities.push({...entity('roof'),visibility:'unseen',provenance:'assumed',building_type:'commercial_block',evidence:'Proposed flat closure above crop, height is an estimate'});
  assert.equal(validateSceneReconstruction(s),s);
  assert.deepEqual(assessSceneCoverage(s).inferred_entities,['roof']);
  s.entities.at(-1).provenance='observed';assert.throws(()=>validateSceneReconstruction(s),/cannot be observed/);
  s.entities.at(-1).provenance='inferred';s.completion_mode='visible_only';assert.throws(()=>validateSceneReconstruction(s),/plausible_complete/);
});

test('duplicate bindings, invalid image regions and dangling relations fail validation', () => {
  let s=scene();s.entities[1].part_ids=['main'];assert.throws(()=>validateSceneReconstruction(s),/share part/);
  s=scene();s.entities[0].source_region=[0.5,0.1,0.2,0.8];assert.throws(()=>validateSceneReconstruction(s),/region/);
  s=scene();s.relations[0].to='missing';assert.throws(()=>validateSceneReconstruction(s),/known entities/);
});

test('image understanding persists scene inventory across incremental edits and enforces it at compile', () => {
  const image='image-artifact:sha256:'+'a'.repeat(64);
  const g=graph();
  const observations=g.parts.map(p=>({instance_id:p.id,role:'building_main_mass',evidence:{image_handle:image,description:'source region'},parameters:{}}));
  for(const p of g.parts) p.parameter_provenance={origin:'inferred',size:'inferred'};
  const first=mergeImageUnderstanding({domain:'building',image_handle:image,observations,scene_reconstruction:scene(),part_graph:g});
  const next=mergeImageUnderstanding({unknowns:['Unseen roof dimensions are estimates']},first);
  assert.deepEqual(next.scene_reconstruction,scene());
  assert.equal(compileImageModel(next).scene_coverage.coverage_verified,true);
  next.part_graph.parts.pop();assert.throws(()=>compileImageModel(next),/canopy/);
  delete next.scene_reconstruction;assert.throws(()=>compileImageModel(next),/requires scene_reconstruction/);
});

test('MCP brief carries inventory without truncation and requests it for a building group', () => {
  const input={assetSet:{id:'scene',assets:[]},observationSet:{object:{profile:'building_group'}},candidateGraph:{profile_id:'scene',candidates:[]},modelingBrief:{status:'review',compile_allowed:false}};
  const missing=buildMcpModelingBrief(input);
  assert.ok(missing.compile_permission.reasons.includes('scene_inventory_required_for_building_group'));
  input.observationSet.scene_reconstruction=scene();
  const brief=buildMcpModelingBrief({...input,maxCandidates:1});
  assert.equal(brief.scene_reconstruction.entities.length,4);
  assert.match(renderMcpModelingBriefMarkdown(brief),/must_not_merge/);
  brief.scene_reconstruction.entities.pop();assert.equal(input.observationSet.scene_reconstruction.entities.length,4);
});
