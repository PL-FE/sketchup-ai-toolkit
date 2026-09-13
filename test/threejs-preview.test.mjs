import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import fs from 'node:fs';
const assets = new URL('../skills/sketchup-ai-modeling/assets/threejs-preview/', import.meta.url);
const hooks = registerHooks({
  resolve(specifier, context, nextResolve) {
    return nextResolve(specifier === 'three' ? new URL('vendor/three.module.js', assets).href : specifier, context);
  },
});
const THREE = await import(new URL('vendor/three.module.js', assets));
const { definitions, validateDocument, makeComponent, disposeComponent } = await import(new URL('recipes.js', assets));
hooks.deregister();
const demo = JSON.parse(fs.readFileSync(new URL('scene.json', assets), 'utf8'));

test('all preview recipes preserve declared outer dimensions and base origin', () => {
  for (const [type, definition] of Object.entries(definitions)) {
    const params = Object.fromEntries(Object.entries(definition.fields).map(([key, spec]) => [key, spec[3]]));
    const component = { id: type, name: type, type, params, position: [0, 0, 0], rotation: 0, color: '#ec752b' };
    validateDocument({ schemaVersion: 1, units: 'm', components: [component] });
    const geometry = makeComponent(component);
    try {
      const box = new THREE.Box3().setFromObject(geometry);
      const size = box.getSize(new THREE.Vector3()).toArray();
      [params.width, params.height, params.depth].forEach((value, axis) => assert.ok(Math.abs(size[axis] - value) < 0.011, `${type}, axis ${axis}`));
      assert.ok(Math.abs(box.min.y) < 1e-6, type);
    } finally { disposeComponent(geometry); }
  }
});

test('preview transforms retain component identity and world placement', () => {
  const component = { ...structuredClone(demo.components[0]), position: [10, 2, -5], rotation: 90 };
  const geometry = makeComponent(component);
  try {
    const box = new THREE.Box3().setFromObject(geometry);
    const center = box.getCenter(new THREE.Vector3());
    assert.equal(geometry.userData.componentId, component.id);
    assert.ok(Math.abs(center.x - 10) < 1e-6);
    assert.ok(Math.abs(center.z + 5) < 1e-6);
    assert.ok(Math.abs(box.min.y - 2) < 1e-6);
    assert.ok(Math.abs(box.max.x - box.min.x - component.params.depth) < 1e-6);
  } finally { disposeComponent(geometry); }
});

test('preview validation rejects ambiguous identity, invalid sizes and impossible joins', () => {
  const duplicate = structuredClone(demo); duplicate.components.push(structuredClone(duplicate.components[0]));
  assert.throws(() => validateDocument(duplicate), /ID/);
  const negative = structuredClone(demo); negative.components[0].params.width = -1;
  assert.throws(() => validateDocument(negative), /总宽/);
  const overlap = structuredClone(demo); Object.assign(overlap.components[0].params, { width: 0.6, post: 0.4 });
  assert.throws(() => validateDocument(overlap), /冲突/);
  const invalid = structuredClone(demo); invalid.components[0].position[0] = NaN;
  assert.throws(() => validateDocument(invalid), /坐标/);
});

test('single and multi-building example data retain pending review and independent components', () => {
  const single = structuredClone(demo); single.components = single.components.slice(0, 1);
  assert.equal(validateDocument(single).components.length, 1);
  const corner = validateDocument(JSON.parse(fs.readFileSync(new URL('examples/street-corner.json', assets), 'utf8')));
  assert.equal(corner.components.filter(c => c.type === 'building').length, 3);
  assert.equal(corner.review.status, 'pending');
  assert.ok(corner.components.every(c => c.provenance.status === 'pending'));
  const input = structuredClone(demo), output = validateDocument(input);
  output.components[0].params.width += 1;
  assert.deepEqual(input, demo);
});
