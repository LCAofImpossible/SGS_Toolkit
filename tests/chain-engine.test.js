const test = require('node:test');
const assert = require('node:assert/strict');
const E = require('../chain-engine.js');
const d = (id, activity, info, geography = 'RER', unit = 'kg') => ({ id, activity, information: info, geography, unit, product: '' });

test('descriptive input separates material, transformation and finishing', () => {
  const spec = E.parseDescription('Lamiera in acciaio DX51D laminata e zincata');
  assert.match(spec.material, /steel/);
  assert.match(spec.transformation, /sheet rolling/);
  assert.match(spec.finishing, /zinc coating/);
  assert.equal(spec.form, 'sheet');
});

test('a service excluding material is combined with its separate material market', () => {
  const catalog = [
    d('m', 'market for acrylonitrile-butadiene-styrene copolymer', 'Polymer granulate.', 'GLO'),
    d('t', 'injection moulding', 'This is delivering the service of injection moulding. The converted amount of plastics is not included into the dataset.'),
    d('tm', 'market for injection moulding', 'This is delivering the service of injection moulding. The converted amount of plastics is not included into the dataset.', 'GLO')
  ];
  const result = E.generate(catalog, { material: 'acrylonitrile butadiene styrene copolymer', transformation: 'injection moulding' });
  assert.equal(result.chains[0].steps.map(s => s.dataset.id).join(','), 'm,t');
  assert.ok(result.chains.some(c => c.steps.map(s => s.dataset.id).join(',') === 'm,tm'));
});

test('finished product activity and its market are alternatives, not material plus process', () => {
  const catalog = [
    d('raw', 'market for aluminium, wrought alloy', 'Material.', 'GLO'),
    d('p', 'section bar extrusion, aluminium', 'This is the finished section bar produced by extrusion.'),
    d('pm', 'market for section bar extrusion, aluminium', 'This is the finished section bar produced by extrusion.', 'GLO'),
    d('finish', 'anodising, aluminium sheet', 'This is delivering the service of anodising. The service includes the input of aluminium needed.', 'RER', 'm2')
  ];
  const result = E.generate(catalog, { material: 'aluminium wrought alloy', transformation: 'section bar extrusion aluminium', finishing: 'anodising aluminium', form: 'profile' });
  assert.equal(result.chains.length, 2);
  assert.deepEqual(result.chains.map(c => c.steps.map(s => s.dataset.id)), [['pm'], ['p']]);
  assert.match(result.chains[0].checks.join(' '), /sheet\/coil/);
});

test('surface service with different unit is flagged for physical conversion', () => {
  const catalog = [
    d('m', 'market for steel, low-alloyed', 'Material.', 'GLO'),
    d('t', 'sheet rolling, steel', 'This is delivering the service of sheet rolling. The material being rolled is not included in the dataset.'),
    d('f', 'zinc coating, coils', 'This is delivering the service of zinc coating. It does not include the steel strip.', 'RER', 'm2')
  ];
  const result = E.generate(catalog, { material: 'steel low alloyed', transformation: 'sheet rolling steel', finishing: 'zinc coating coils', form: 'sheet' });
  assert.equal(result.chains[0].steps.length, 3);
  assert.match(result.chains[0].checks.join(' '), /m2/);
});

test('free description suggests chains without manually assigning stages', () => {
  const catalog = [
    d('m', 'market for acrylonitrile-butadiene-styrene copolymer', 'Polymer granulate.', 'GLO'),
    d('t', 'injection moulding', 'This is delivering the service of injection moulding. The converted amount of plastics is not included into the dataset.')
  ];
  const result = E.suggest(catalog, 'Cover in ABS stampato a iniezione');
  assert.equal(result.interpretation.transformation, 'injection moulding');
  assert.deepEqual(result.chains[0].steps.map(s => s.dataset.id), ['m', 't']);
});

test('stainless steel and blast furnace do not become a fabricated combined chain', () => {
  const catalog = [
    d('m', 'market for steel, chromium steel 18/8', 'Stainless steel.', 'GLO'),
    d('e', 'steel production, electric, chromium steel 18/8', 'Electric steel production.'),
    d('f', 'blast furnace production', 'Infrastructure representing construction of blast furnace.', 'RER', 'unit'),
    d('p', 'pig iron production', 'Pig iron production.')
  ];
  const result = E.suggest(catalog, 'acciaio inox in altoforno');
  assert.deepEqual(result.chains.map(c => c.steps.map(s => s.dataset.id)), [['m'], ['e']]);
  assert.match(result.notes.join(' '), /altoforno produce ghisa/);
});

test('milling service with unspecified workpiece inclusion is conditional', () => {
  const catalog = [
    d('m', 'market for steel, chromium steel 18/8', 'Stainless steel.', 'GLO'),
    d('t', 'chromium steel milling, average', 'This is delivering the service of chromium steel removed by milling. The service includes materials input, energy and infrastructure.')
  ];
  const result = E.suggest(catalog, 'acciaio inox fresato');
  assert.deepEqual(result.chains[0].steps.map(s => s.dataset.id), ['m', 't']);
  assert.match(result.chains[0].checks.join(' '), /non includa già/);
});
