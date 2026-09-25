(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.MapperCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const aliases = {
    aluminium: ['aluminum', 'aluminium', 'alu'], steel: ['steel', 'acciaio'],
    copper: ['copper', 'rame'], abs: ['abs', 'acrylonitrile butadiene styrene'],
    polypropylene: ['polypropylene', 'pp'], polyethylene: ['polyethylene', 'pe'],
    extrusion: ['extrusion', 'extruded', 'estruso', 'estrusione', 'profile extrusion'],
    rolling: ['rolling', 'rolled', 'laminato', 'laminazione'],
    moulding: ['moulding', 'molding', 'stampaggio iniezione'],
    anodising: ['anodising', 'anodizing', 'anodizzato', 'anodizzazione'],
    galvanizing: ['galvanizing', 'galvanising', 'galvanized', 'zinc coating', 'zinc coated', 'zincatura', 'zincato'],
    drawing: ['wire drawing', 'drawing', 'trafilatura', 'trafilato'],
    casting: ['casting', 'cast', 'fusione', 'colata'],
    machining: ['machining', 'machined', 'lavorazione meccanica'],
    sheet: ['sheet', 'lamiera'], profile: ['profile', 'profilo'],
    wire: ['wire', 'filo'], market: ['market for', 'market group for']
  };
  const stopWords = new Set(['for', 'of', 'the', 'and', 'in', 'a', 'di', 'per', 'da', 'con']);
  const text = x => String(x ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const tokens = x => [...new Set(text(x).split(/\s+/).filter(w => w && !stopWords.has(w)))];
  function canonical(x) {
    let s = ` ${text(x)} `;
    for (const [key, forms] of Object.entries(aliases)) {
      for (const form of [...forms].sort((a, b) => b.length - a.length)) {
        const escaped = text(form).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        s = s.replace(new RegExp(` ${escaped} `, 'g'), ` ${key} `);
      }
    }
    return s.trim();
  }
  function parseDelimited(input, delimiter) {
    const raw = String(input).replace(/^\uFEFF/, '');
    if (!delimiter) {
      const first = raw.split(/\r?\n/, 1)[0];
      delimiter = [';', '\t', ','].map(d => [d, (first.match(new RegExp(d === '\t' ? '\t' : `\\${d}`, 'g')) || []).length]).sort((a, b) => b[1] - a[1])[0][0];
    }
    const rows = [], row = [];
    let field = '', quoted = false;
    for (let i = 0; i < raw.length; i++) {
      const c = raw[i];
      if (quoted) {
        if (c === '"' && raw[i + 1] === '"') { field += '"'; i++; }
        else if (c === '"') quoted = false;
        else field += c;
      } else if (c === '"' && field === '') quoted = true;
      else if (c === delimiter) { row.push(field); field = ''; }
      else if (c === '\n' || c === '\r') {
        if (c === '\r' && raw[i + 1] === '\n') i++;
        row.push(field); if (row.some(v => v !== '')) rows.push(row.slice());
        row.length = 0; field = '';
      } else field += c;
    }
    row.push(field); if (row.some(v => v !== '')) rows.push(row);
    if (quoted) throw new Error('CSV non valido: virgolette non chiuse.');
    if (rows.length < 2) throw new Error('Il file deve contenere intestazioni e almeno una riga.');
    const headers = rows.shift().map(x => x.trim());
    return { headers, rows: rows.map(r => Object.fromEntries(headers.map((h, i) => [h, (r[i] ?? '').trim()]))) };
  }
  function detect(headers, variants) {
    const wanted = variants.map(text);
    return headers.find(h => wanted.includes(text(h))) || '';
  }
  const fields = {
    datasets: {
      activity: ['activity name', 'activity', 'name', 'nome attività', 'nome attivita'],
      product: ['reference product', 'product', 'prodotto di riferimento'],
      geography: ['geography', 'geo', 'location', 'geografia'],
      unit: ['unit', 'unit name', 'unità', 'unita'],
      activityType: ['special activity type', 'activity type', 'tipo attività'],
      sector: ['sector', 'settore'],
      information: ['product information', 'description', 'informazioni prodotto'],
      classification: ['isic classification', 'classification', 'category', 'classificazione'],
      uuid: ['activity uuid', 'uuid', 'id']
    },
    bom: {
      component: ['component', 'component name', 'componente', 'part', 'item', 'description', 'descrizione'],
      material: ['material', 'materiale'],
      grade: ['grade', 'material specification', 'specifica materiale', 'specification'],
      mass: ['mass', 'mass kg', 'massa', 'massa kg', 'quantity', 'quantità', 'quantita'],
      unit: ['unit', 'unità', 'unita', 'mass unit'],
      form: ['semi-finished form', 'form', 'semilavorato', 'forma'],
      process: ['manufacturing process', 'transformation', 'process', 'processo', 'lavorazione'],
      finishing: ['finishing', 'finitura', 'treatment', 'trattamento'],
      geography: ['supplier country', 'country', 'paese fornitore', 'geography']
    }
  };
  function autoMap(headers, kind) { return Object.fromEntries(Object.entries(fields[kind]).map(([k, names]) => [k, detect(headers, names)])); }
  function normalizeDatasets(rows, map) {
    return rows.map((r, i) => ({
      id: String(r[map.uuid] || `${i + 1}`), activity: r[map.activity] || '',
      product: r[map.product] || '', geography: r[map.geography] || '',
      unit: r[map.unit] || '', classification: r[map.classification] || '',
      activityType: r[map.activityType] || '', sector: r[map.sector] || '',
      information: r[map.information] || ''
    })).filter(x => x.activity);
  }
  function inferProcess(form, process) {
    const s = canonical(`${form} ${process}`);
    if (/extrusion|profile/.test(s)) return 'extrusion';
    if (/rolling|sheet|plate|foil/.test(s)) return 'rolling';
    if (/injection.*moulding|moulding/.test(s)) return 'injection moulding';
    if (/drawing|wire/.test(s)) return 'drawing';
    if (/casting|die cast/.test(s)) return 'casting';
    if (/machining/.test(s)) return 'machining';
    return text(process);
  }
  function normalizeBom(rows, map) {
    return rows.map((r, i) => {
      const unit = text(r[map.unit] || 'kg');
      const raw = String(r[map.mass] || '').replace(/\s/g, '');
      const n = Number(raw.includes(',') && !raw.includes('.') ? raw.replace(',', '.') : raw);
      const factor = ({ kg: 1, g: .001, t: 1000, tonne: 1000, ton: 1000 })[unit];
      return {
        id: `bom-${i + 1}`, component: r[map.component] || '', material: r[map.material] || '',
        grade: r[map.grade] || '', massKg: Number.isFinite(n) && factor ? n * factor : null,
        massOriginal: r[map.mass] || '', unit: r[map.unit] || 'kg',
        form: r[map.form] || '', process: r[map.process] || '', finishing: r[map.finishing] || '',
        geography: r[map.geography] || '', selected: { material: null, transformation: null, finishing: null },
        rationale: '', transformationStatus: 'pending', finishingStatus: 'pending'
      };
    }).filter(x => x.component || x.material);
  }
  const searchCache = new WeakMap();
  function classifyText(d, a, p) {
    const joined = `${a} ${p}`;
    if (/transport|freight|electricity|waste treatment/.test(joined)) return 'other';
    if (/^market( group)? for\b/.test(text(d.activity))) {
      return /(sheet|profile|wire|foil|tube|cable)/.test(joined) ? 'semifinished' : 'market';
    }
    if (/anodising|galvanizing|coating|painting|plating/.test(a)) return 'finishing';
    if (/extrusion|rolling|moulding|drawing|machining|casting|forging|stamping|thermoforming|welding/.test(a)) {
      if (/(sheet|profile|wire|foil|tube|cable)/.test(p) && !/service|operation/.test(p)) return 'semifinished';
      return 'transformation';
    }
    if (/(sheet|profile|wire|foil|tube|cable)/.test(p)) return 'semifinished';
    return 'material';
  }
  function indexDataset(d) {
    let indexed = searchCache.get(d);
    if (indexed) return indexed;
    const activity = canonical(d.activity), product = canonical(d.product);
    indexed = {
      activity, activityWords: new Set(tokens(activity)),
      productWords: new Set(tokens(product)),
      sectorWords: new Set(tokens(text(d.sector))),
      // Product Information is descriptive evidence, not a reference product.
      information: ` ${text(d.information)} `,
      market: /^market( group)? for\b/.test(text(d.activity)),
      kind: classifyText(d, activity, product)
    };
    searchCache.set(d, indexed);
    return indexed;
  }
  function classify(d) { return indexDataset(d).kind; }
  function tokenMatch(token, words) {
    if (words.has(token)) return 1;
    for (const word of words) {
      if (token.length >= 4 && word.length >= 4 && (word.startsWith(token) || token.startsWith(word))) return .72;
      if (token.length >= 5 && word.length >= 5 && Math.abs(token.length - word.length) <= 1) {
        let i = 0, j = 0, edits = 0;
        while (i < token.length && j < word.length && edits <= 1) {
          if (token[i] === word[j]) { i++; j++; continue; }
          edits++;
          if (token.length > word.length) i++;
          else if (word.length > token.length) j++;
          else { i++; j++; }
        }
        if (edits + (i < token.length || j < word.length ? 1 : 0) <= 1) return .55;
      }
    }
    return 0;
  }
  function scoreDataset(d, query, stage, options = {}) {
    const q = tokens(canonical(query));
    if (!q.length) return null;
    if (options.strictGeography && options.geography && text(d.geography) !== text(options.geography)) return null;
    if (options.strictUnit && options.unit && text(d.unit) !== text(options.unit)) return null;
    if (options.sector && !text(d.sector).includes(text(options.sector))) return null;
    const idx = indexDataset(d), kind = idx.kind;
    if (options.type === 'market' && !idx.market || options.type === 'production' && idx.market) return null;
    const activityText = idx.activity, activityWords = idx.activityWords;
    let matched = 0, titleHits = 0;
    const reasons = [];
    for (const t of q) {
      const a = tokenMatch(t, activityWords);
      if (a) { matched += a; titleHits++; continue; }
      const p = tokenMatch(t, idx.productWords);
      if (p) { matched += .8 * p; continue; }
      const s = idx.sectorWords.has(t) ? 1 : 0;
      if (s) { matched += .3 * s; continue; }
      if (idx.information.includes(` ${t} `)) matched += .18;
    }
    if (!matched) return null;
    let score = 58 * matched / q.length;
    if (titleHits === q.length) { score += 18; reasons.push('tutti i termini nel nome'); }
    else if (titleHits) reasons.push(`${titleHits}/${q.length} termini nel nome`);
    else reasons.push('corrispondenza nella descrizione o nel settore');
    if (activityText.includes(canonical(query))) { score += 12; reasons.push('frase nel nome'); }
    if (stage && stage !== 'any') {
      const wanted = stage === 'material' ? ['material', 'market', 'semifinished'] : [stage];
      score += wanted.includes(kind) ? 7 : -12;
      if (stage === 'transformation' && kind === 'semifinished') score -= 5;
    }
    const extra = [...activityWords].filter(w => !q.includes(w) && !['market', 'production'].includes(w));
    score -= Math.min(25, extra.length * 4);
    if (/(coating|painting|plating|blasting|drilling|milling)/.test(activityText) && !q.some(t => /(coating|painting|plating|blasting|drilling|milling)/.test(t))) score -= 9;
    if (options.geography) {
      const geo = text(d.geography), target = text(options.geography);
      if (geo === target) { score += 6; reasons.push('geografia selezionata'); }
    }
    if (options.unit) score += text(d.unit) === text(options.unit) ? 4 : -6;
    return { dataset: d, score: Math.max(1, Math.min(99, Math.round(score))), kind, reasons };
  }
  function search(datasets, query, stage, options = {}, limit = 12) {
    return datasets.map(d => scoreDataset(d, query, stage, options)).filter(x => x && x.score >= 12)
      .sort((a, b) => b.score - a.score || a.dataset.activity.localeCompare(b.dataset.activity)).slice(0, limit);
  }
  function searchGrouped(datasets, query, stage, options = {}, limit = 30) {
    const hits = search(datasets, query, stage, options, datasets.length);
    const groups = new Map();
    for (const hit of hits) {
      const key = text(hit.dataset.activity);
      if (!groups.has(key)) groups.set(key, { ...hit, alternatives: [] });
      groups.get(key).alternatives.push(hit.dataset);
    }
    return { totalActivities: groups.size, totalDatasets: hits.length, results: [...groups.values()].slice(0, limit) };
  }
  function issues(item, byId) {
    const out = [];
    if (!item.selected.material) out.push('Materiale: dataset mancante.');
    if (item.massKg == null || item.massKg <= 0) out.push('Massa: valore assente o non valido.');
    const expected = inferProcess(item.form, item.process);
    if (expected && item.transformationStatus === 'pending' && !item.selected.transformation) out.push(`Trasformazione attesa (${expected}): da selezionare o motivare come già inclusa/non applicabile.`);
    if (item.finishing && item.finishingStatus === 'pending' && !item.selected.finishing) out.push('Finitura indicata: da selezionare o motivare come già inclusa/non applicabile.');
    const m = byId.get(item.selected.material), t = byId.get(item.selected.transformation), f = byId.get(item.selected.finishing);
    if (m && t && classify(m) === 'semifinished') out.push('Possibile doppio conteggio: il dataset del materiale potrebbe già includere il semilavorato. Verificare i confini dei processi.');
    if (m && f && /anodising|galvanizing|coating/.test(canonical(`${m.activity} ${m.product}`))) out.push('Possibile sovrapposizione tra materiale e finitura.');
    if (m && item.geography && m.geography && text(m.geography) !== text(item.geography)) out.push('Geografia del dataset materiale diversa dal paese fornitore: valutare rappresentatività.');
    for (const [name, d] of [['Materiale', m], ['Trasformazione', t], ['Finitura', f]]) {
      if (d && d.unit && text(d.unit) !== 'kg') out.push(`${name}: unità dataset ${d.unit}; serve un fattore di conversione prima di usare la massa.`);
    }
    return out;
  }
  function csvEscape(v) {
    let s = String(v ?? '');
    if (/^[\s]*[=+@-]/.test(s) && !/^-[0-9.,]+$/.test(s)) s = "'" + s;
    return '"' + s.replace(/"/g, '""') + '"';
  }
  function toCsv(rows) { return rows.map(row => row.map(csvEscape).join(';')).join('\r\n') + '\r\n'; }
  return { parseDelimited, autoMap, normalizeDatasets, normalizeBom, inferProcess, classify, scoreDataset, search, searchGrouped, issues, toCsv, canonical };
});
