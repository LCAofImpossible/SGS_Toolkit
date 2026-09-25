(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.XlsxReader = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  // Focused OOXML reader for flat, tabular XLSX exports. No workbook data leaves the browser.
  const entities = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
  function decode(s) {
    return String(s || '').replace(/&(#x[0-9a-f]+|#[0-9]+|amp|lt|gt|quot|apos);/gi, (_, entity) => {
      if (entity[0] !== '#') return entities[entity.toLowerCase()] || `&${entity};`;
      const hex = entity[1].toLowerCase() === 'x';
      const n = parseInt(entity.slice(hex ? 2 : 1), hex ? 16 : 10);
      return n >= 0 && n <= 0x10ffff && !(n >= 0xd800 && n <= 0xdfff) ? String.fromCodePoint(n) : '';
    });
  }
  function xmlText(xml) {
    return [...String(xml).matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map(m => decode(m[1])).join('');
  }
  function sharedStrings(xml) {
    const values = [];
    for (const match of xml.matchAll(/<si(?:\s[^>]*)?>([\s\S]*?)<\/si>/g)) values.push(xmlText(match[1]));
    return values;
  }
  function columnIndex(address) {
    const letters = String(address).match(/^[A-Z]+/i)?.[0].toUpperCase() || '';
    let index = 0;
    for (const c of letters) index = index * 26 + c.charCodeAt(0) - 64;
    return index - 1;
  }
  function parseSheet(xml, strings) {
    const result = [];
    for (const rowMatch of xml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
      const values = [];
      let next = 0;
      for (const cell of rowMatch[1].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
        const attr = cell[1], body = cell[2] || '';
        const address = /\br="([A-Z]+\d+)"/i.exec(attr)?.[1];
        const col = address ? columnIndex(address) : next;
        if (col < 0 || col > 1000) continue;
        const type = /\bt="([^"]+)"/.exec(attr)?.[1];
        const raw = /<v(?:\s[^>]*)?>([\s\S]*?)<\/v>/.exec(body)?.[1] || '';
        values[col] = type === 's' ? (strings[Number(raw)] || '') : type === 'inlineStr' ? xmlText(body) : decode(raw);
        next = col + 1;
      }
      if (values.some(v => v !== '' && v != null)) result.push(values);
    }
    if (result.length < 2) throw new Error('Il primo foglio non contiene intestazioni e dati.');
    const headers = result.shift().map(v => String(v || '').trim());
    return { headers, rows: result.map(values => Object.fromEntries(headers.map((h, i) => [h, String(values[i] ?? '').trim()]))) };
  }
  async function read(input, zipLib) {
    const JSZip = zipLib || (typeof globalThis !== 'undefined' && globalThis.JSZip);
    if (!JSZip) throw new Error('Lettore XLSX non disponibile. Ricarica la pagina.');
    const zip = await JSZip.loadAsync(input);
    const sheets = Object.keys(zip.files).filter(p => /^xl\/worksheets\/sheet\d+\.xml$/.test(p)).sort((a, b) => Number(a.match(/sheet(\d+)/)[1]) - Number(b.match(/sheet(\d+)/)[1]));
    if (!sheets.length) throw new Error('Nessun foglio di lavoro XLSX trovato.');
    const worksheet = zip.file(sheets[0]);
    const shared = zip.file('xl/sharedStrings.xml');
    const [sheetXml, stringsXml] = await Promise.all([worksheet.async('string'), shared ? shared.async('string') : Promise.resolve('')]);
    if (sheetXml.length > 75_000_000 || stringsXml.length > 40_000_000) throw new Error('Foglio XLSX troppo grande per questa versione del lettore.');
    return { ...parseSheet(sheetXml, sharedStrings(stringsXml)), sheetName: sheets[0] };
  }
  return { read, parseSheet, sharedStrings, decode };
});
