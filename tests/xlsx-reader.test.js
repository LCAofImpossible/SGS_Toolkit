const test = require('node:test');
const assert = require('node:assert/strict');
const JSZip = require('../vendor/jszip.min.js');
const Reader = require('../xlsx-reader.js');
const C = require('../core.js');

test('XLSX shared strings, empty cells, inline strings and missing reference product', async () => {
  const zip = new JSZip();
  zip.file('xl/sharedStrings.xml', '<?xml version="1.0"?><sst><si><t>Activity Name</t></si><si><t>Geography</t></si><si><t>Unit</t></si><si><t>Product Information</t></si><si><t>market for steel</t></si><si><t>Steel &amp; alloy</t></si></sst>');
  zip.file('xl/worksheets/sheet1.xml', '<?xml version="1.0"?><worksheet><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c><c r="C1" t="s"><v>2</v></c><c r="D1" t="s"><v>3</v></c></row><row r="2"><c r="A2" t="s"><v>4</v></c><c r="B2" t="inlineStr"><is><t>RER</t></is></c><c r="C2" t="inlineStr"><is><t>kg</t></is></c><c r="D2" t="s"><v>5</v></c></row></sheetData></worksheet>');
  const file = await zip.generateAsync({ type: 'uint8array' });
  const parsed = await Reader.read(file, JSZip);
  const datasets = C.normalizeDatasets(parsed.rows, C.autoMap(parsed.headers, 'datasets'));
  assert.equal(datasets.length, 1);
  assert.equal(datasets[0].information, 'Steel & alloy');
  assert.equal(datasets[0].geography, 'RER');
  assert.equal(C.searchGrouped(datasets, 'steel', 'any').results[0].dataset.activity, 'market for steel');
});

test('Finder groups the same activity across geographies', () => {
  const datasets = [
    { id: '1', activity: 'sheet rolling, steel', geography: 'RER', unit: 'kg' },
    { id: '2', activity: 'sheet rolling, steel', geography: 'RoW', unit: 'kg' },
    { id: '3', activity: 'tin plated chromium steel sheet production', geography: 'GLO', unit: 'kg' }
  ];
  const result = C.searchGrouped(datasets, 'steel sheet', 'any');
  assert.equal(result.results.find(x => x.dataset.activity === 'sheet rolling, steel').alternatives.length, 2);
  assert.equal(C.searchGrouped(datasets, 'steel sheet', 'any', { geography: 'RER', strictGeography: true }).totalDatasets, 1);
});

test('Two-word process query outranks incidental single-word activity', () => {
  const rows = [
    { id: 'a', activity: 'injection moulding', geography: 'RER', unit: 'kg' },
    { id: 'b', activity: 'fertilising, by injection', geography: 'US', unit: 'kg' }
  ];
  assert.equal(C.search(rows, 'injection moulding', 'any')[0].dataset.id, 'a');
});
