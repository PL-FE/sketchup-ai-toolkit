import test from 'node:test';
import assert from 'node:assert/strict';
import { compilePartGraphToSketchUpDsl } from '../src/product-modeling/part-graph-compiler.mjs';

const part = (primitive = 'text_emboss', parameters = {}, role = 'shop_name') => ({
  id: 'sign', name: 'Store lettering', role,
  shape: { primitive, parameters: { text: '乡村基', font: 'Example CJK Font', height: 120, depth: 8, ...parameters } }
});
const compile = (parts, extra = {}) => compilePartGraphToSketchUpDsl({ parts, ...extra }, {}, { includeReset: false });

test('primary Chinese lettering compiles to font outlines without mutating source', () => {
  for (const primitive of ['text_emboss', 'text_engrave']) {
    const source = part(primitive);
    const before = structuredClone(source);
    const op = compile([source]).operations[0];
    assert.equal(op.mode, 'font_outline');
    assert.equal(op.outline, true);
    assert.equal(op.text, '乡村基');
    assert.equal(op.depth, 8);
    assert.deepEqual(source, before);
  }
});

test('primary lettering rejects placeholders, unreadable strings and implicit fonts', () => {
  for (const role of ['shop_name', 'brand_text', 'signage_text']) {
    assert.throws(() => compile([part('box', {}, role)]), /placeholder/);
    for (const text of ['', '  ', '□村基', '\uFFFD']) {
      assert.throws(() => compile([part('text_3d', { text }, role)]), /readable source text/);
    }
    assert.throws(() => compile([part('text_3d', { font: '' }, role)]), /explicit host font/);
    for (const parameters of [{ mode: 'block' }, { text_mode: 'marker' }, { textMode: 'block' }, { outline: false }]) {
      assert.throws(() => compile([part('text_emboss', parameters, role)]), /block\/marker/);
    }
  }
});

test('native text, traced glyphs and unrelated signboard geometry stay supported', () => {
  assert.equal(compile([part('text_3d')]).operations[0].text, '乡村基');
  assert.equal(compile([part('mesh', { vertices: [], faces: [] })]).operations[0].op, 'mesh');
  assert.equal(compile([part('box', {}, 'signboard')]).operations[0].op, 'box');
  const legacy = compile([part('text_emboss', {}, 'product_label')]).operations[0];
  assert.equal(legacy.mode, undefined);
  assert.equal(legacy.outline, undefined);
});

test('assembly leaves receive the same lettering enforcement', () => {
  const root = { id: 'store', name: 'Store', assembly: { children: [{ part_id: 'sign' }] } };
  const extra = { version: 2, roots: [{ part_id: 'store' }] };
  const result = compile([root, part()], extra);
  assert.equal(result.operations[0].operations[0].mode, 'font_outline');
  assert.throws(() => compile([root, part('box')], extra), /placeholder/);
});
