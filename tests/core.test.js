const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../core.js');

test('CSV quoted multiline, separator and BOM decimal comma', () => {
  const p = C.parseDelimited('Component;Material;Mass;Unit\r\n"Case; top";ABS;"2,5";kg\r\n');
  const bom = C.normalizeBom(p.rows, C.autoMap(p.headers, 'bom'));
  assert.equal(bom[0].component, 'Case; top');
  assert.equal(bom[0].massKg, 2.5);
});
test('material and transformation remain separate in ranking', () => {
  const datasets = [
    { id: 'a', activity: 'market for aluminium, wrought alloy', product: 'aluminium, wrought alloy', geography: 'RER', unit: 'kg' },
    { id: 'b', activity: 'extrusion of aluminium', product: 'extrusion of aluminium', geography: 'RER', unit: 'kg' },
    { id: 'c', activity: 'market for aluminium profile', product: 'aluminium profile', geography: 'RER', unit: 'kg' }
  ];
  assert.equal(C.search(datasets, 'aluminium wrought alloy', 'material', { unit: 'kg' })[0].dataset.id, 'a');
  assert.equal(C.search(datasets, 'extrusion aluminium', 'transformation', { unit: 'kg' })[0].dataset.id, 'b');
  const item = { selected: { material: 'c', transformation: 'b', finishing: null }, massKg: 2, form: 'extruded profile', process: '', finishing: '', geography: '', transformationStatus: 'pending', finishingStatus: 'pending' };
  assert.match(C.issues(item, new Map(datasets.map(d => [d.id, d]))).join(' '), /doppio conteggio/);
});
test('missing process and unit warning', () => {
  const item = { selected: { material: 'a', transformation: null, finishing: null }, massKg: 2, form: 'sheet', process: '', finishing: '', geography: '', transformationStatus: 'pending', finishingStatus: 'pending' };
  const warnings = C.issues(item, new Map([['a', { activity: 'steel production', product: 'steel', unit: 'm2' }]])).join(' ');
  assert.match(warnings, /Trasformazione attesa/);
  assert.match(warnings, /fattore di conversione/);
});
test('spreadsheet formula injection is neutralized on export', () => {
  const csv = C.toCsv([['Component', '=HYPERLINK("bad")', '+SUM(1,2)', '-3']]);
  assert.match(csv, /"'=HYPERLINK/);
  assert.match(csv, /"'\+SUM/);
  assert.match(csv, /"-3"/);
});
