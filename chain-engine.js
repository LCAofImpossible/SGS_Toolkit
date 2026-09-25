(function (root, factory) {
  const api = factory(typeof module !== 'undefined' && module.exports ? require('./core.js') : root.MapperCore);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.ChainEngine = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (C) {
  'use strict';
  const norm = x => C.canonical(x);
  const materialFamilies = [
    { re: /\b(abs|acrylonitrile butadiene styrene)\b/i, query: 'acrylonitrile butadiene styrene copolymer', family: 'abs' },
    { re: /\b(polypropylene|polipropilene|pp)\b/i, query: 'polypropylene', family: 'polypropylene' },
    { re: /\b(polyethylene|polietilene|pe)\b/i, query: 'polyethylene', family: 'polyethylene' },
    { re: /\b(aisi\s*30[46]|stainless steel|acciaio inox|chromium steel)\b/i, query: 'steel chromium steel 18/8', family: 'stainless' },
    { re: /\b(aluminium|aluminum|alluminio|al\s*6060|en aw\s*6060)\b/i, query: 'aluminium wrought alloy', family: 'aluminium' },
    { re: /\b(steel|acciaio|dx51d)\b/i, query: 'steel low alloyed', family: 'steel' },
    { re: /\b(copper|rame|cu etp)\b/i, query: 'copper', family: 'copper' },
    { re: /\b(pig iron|ghisa grezza)\b/i, query: 'pig iron', family: 'iron' },
    { re: /\b(concrete|calcestruzzo)\b/i, query: 'concrete', family: 'concrete' },
    { re: /\b(glass|vetro)\b/i, query: 'glass', family: 'glass' },
    { re: /\b(pvc|polyvinyl chloride|polivinilcloruro)\b/i, query: 'polyvinylchloride', family: 'pvc' },
    { re: /\b(pet|polyethylene terephthalate|polietilene tereftalato)\b/i, query: 'polyethylene terephthalate', family: 'pet' }
  ];
  function parseDescription(description) {
    const raw = String(description || '');
    const material = materialFamilies.find(x => x.re.test(raw));
    const family = material?.family || '';
    const form = /\b(profile|profilo|estruso)\b/i.test(raw) ? 'profile' : /\b(sheet|lamiera|lastra|coil|nastro)\b/i.test(raw) ? 'sheet' : /\b(pipe|tubo)\b/i.test(raw) ? 'pipe' : '';
    const blastFurnace = /\b(altoforno|blast furnace)\b/i.test(raw);
    let transformation = '';
    if (/estrus|extrud|extrusion/i.test(raw)) transformation = family === 'aluminium' ? 'section bar extrusion aluminium' : 'extrusion';
    else if (/stampat\w*\s+a\s+iniezion|stampaggio\s+(?:a\s+)?iniezione|injection mould|injection mold|iniettat/i.test(raw)) transformation = 'injection moulding';
    else if (/laminat|rolling|rolled/i.test(raw) || form === 'sheet' && family === 'steel') transformation = `sheet rolling ${family || 'steel'}`;
    else if (/trafilat|wire drawing/i.test(raw)) transformation = `wire drawing ${family}`.trim();
    else if (/fresat|milling/i.test(raw)) transformation = `${family === 'stainless' ? 'chromium steel ' : ''}milling`;
    else if (/tornit|turning/i.test(raw)) transformation = `${family === 'stainless' ? 'chromium steel ' : ''}turning`;
    else if (/forat|drill/i.test(raw)) transformation = `${family === 'stainless' ? 'chromium steel ' : ''}drilling`;
    else if (/forgiat|forging/i.test(raw)) transformation = 'forging';
    else if (/pressofus|die cast/i.test(raw)) transformation = 'die casting';
    else if (/saldat|welding/i.test(raw)) transformation = 'welding';
    const finishing = /anodiz|anodis|anodiz/i.test(raw) ? 'anodising aluminium' : /zincat|galvaniz|zinc coat/i.test(raw) ? `zinc coating ${form === 'sheet' ? 'coils' : 'pieces'}` : /verniciat|powder coat/i.test(raw) ? 'powder coating' : '';
    return { material: material?.query || '', transformation, finishing, form, family, blastFurnace };
  }
  function describeDataset(d) {
    const information = String(d.information || '');
    const info = information.toLowerCase();
    const service = /delivering the service|service of ['‘]|this service (?:is|should)/.test(info);
    const excludesMaterial = /material[^.]{0,90}not included|material[^.]{0,90}needs to be added separately|converted amount[^.]{0,90}not included|does not include the (?:steel|plastic|aluminium|aluminum|material)|not include the (?:steel|plastic|aluminium|aluminum|material)|exclude[s]? the (?:steel|plastic|aluminium|aluminum|material)/.test(info);
    const includesMaterial = /service includes the input of [^.]*?(?:aluminium|aluminum|steel|plastic|material)/.test(info);
    const market = /^market( group)? for\b/i.test(String(d.activity || ''));
    const evidenceMatch = /[^.!?]*(?:not included|added separately|does not include|not include|excludes? the (?:steel|plastic|aluminium|aluminum|material)|includes the input of)[^.!?]*[.!?]?/i.exec(information);
    return { service, excludesMaterial, includesMaterial, market, evidence: evidenceMatch?.[0].trim().slice(0, 360) || '' };
  }
  function candidateSearch(datasets, query, stage, geography, limit = 150) {
    if (!query.trim()) return [];
    return C.search(datasets, query, stage, { geography, unit: 'kg' }, limit);
  }
  function isRelevant(hit, words) {
    const name = norm(hit.dataset.activity);
    return words.some(w => name.includes(w));
  }
  function bestBy(hits, predicate) { return hits.find(h => predicate(h.dataset, describeDataset(h.dataset)))?.dataset || null; }
  function step(role, dataset) { return { role, dataset }; }
  function addFinish(chain, finish, spec) {
    if (!spec.finishing.trim()) return;
    if (!finish) { chain.checks.push('Finitura richiesta ma nessun servizio sufficientemente pertinente è stato identificato nel catalogo.'); return; }
    const profileMismatch = /profile/.test(norm(spec.form)) && /sheet|coil/.test(norm(finish.activity));
    if (profileMismatch) {
      chain.checks.push(`Finitura non associata: ${finish.activity} riguarda sheet/coil, mentre il componente è un profilo.`);
      return;
    }
    const meta = describeDataset(finish);
    if (meta.includesMaterial) {
      chain.checks.push(`Finitura non sommata automaticamente: ${finish.activity} dichiara un input di materiale incluso. Verificare il confine prima di combinarla.`);
      return;
    }
    chain.steps.push(step('Finitura', finish));
    if (!meta.excludesMaterial) chain.checks.push(`Verificare nella scheda completa se ${finish.activity} include il materiale trattato.`);
    if (finish.unit !== 'kg') chain.checks.push(`La finitura usa ${finish.unit || 'un’unità non indicata'}: serve un fattore fisico per passare dalla massa del componente alla quantità di servizio.`);
  }
  function generate(datasets, spec) {
    const material = String(spec.material || '').trim();
    const transformation = String(spec.transformation || '').trim();
    const finishing = String(spec.finishing || '').trim();
    const geography = String(spec.geography || '').trim();
    if (!material && !transformation) return { chains: [], message: 'Inserisci almeno il materiale o la trasformazione.' };
    const materials = candidateSearch(datasets, material, 'material', geography);
    const transforms = candidateSearch(datasets, transformation, 'transformation', geography);
    const finishes = candidateSearch(datasets, finishing, 'finishing', geography);
    const materialWords = norm(material).split(' ').filter(w => w.length > 2 && !['alloy', 'copolymer', 'low'].includes(w));
    const processWords = norm(transformation).split(' ').filter(w => w.length > 3 && !['steel', 'aluminium', 'plastic'].includes(w));
    const materialMarket = bestBy(materials, d => describeDataset(d).market && materialWords.every(w => norm(d.activity).includes(w)) && !describeDataset(d).service);
    const materialProducer = bestBy(materials, d => !describeDataset(d).market && !describeDataset(d).service && materialWords.every(w => norm(d.activity).includes(w)));
    const transformService = bestBy(transforms, d => {
      const meta = describeDataset(d);
      return meta.service && !meta.includesMaterial && !meta.market && processWords.every(w => norm(d.activity).includes(w));
    });
    const transformMarketService = bestBy(transforms, d => {
      const meta = describeDataset(d);
      return meta.service && !meta.includesMaterial && meta.market && processWords.every(w => norm(d.activity).includes(w));
    });
    const transformProduct = bestBy(transforms, d => {
      const meta = describeDataset(d);
      return !meta.service && !meta.market && processWords.every(w => norm(d.activity).includes(w)) && (!materialWords.length || materialWords.some(w => norm(d.activity).includes(w)));
    });
    const integratedMarket = transformProduct && bestBy(transforms, d => norm(d.activity) === `market ${norm(transformProduct.activity)}` || norm(d.activity) === `market for ${norm(transformProduct.activity)}`);
    const finishWords = norm(finishing).split(' ').filter(w => w.length > 3 && !['aluminium', 'steel', 'plastic'].includes(w));
    const finishService = bestBy(finishes, d => describeDataset(d).service && !describeDataset(d).market && finishWords.every(w => norm(d.activity).includes(w)))
      || bestBy(finishes, d => !describeDataset(d).market && finishWords.every(w => norm(d.activity).includes(w)));
    const chains = [];
    const push = (title, steps, basis, checks = []) => {
      if (!steps.length) return;
      const chain = { title, steps, basis, checks };
      addFinish(chain, finishService, { ...spec, finishing });
      const key = chain.steps.map(s => s.dataset.id).join('|');
      if (!chains.some(c => c.steps.map(s => s.dataset.id).join('|') === key)) chains.push(chain);
    };
    if (transformation && integratedMarket) push('Semilavorato acquistato sul mercato', [step('Prodotto/semilavorato', integratedMarket)], 'Il processo di mercato rappresenta il prodotto trasformato; non aggiungere automaticamente il materiale di partenza.', ['Verificare nella scheda completa che il materiale e la lavorazione siano entrambi nel confine del dataset.']);
    if (transformation && transformProduct) push('Produzione del semilavorato', [step('Prodotto/semilavorato', transformProduct)], 'Attività produttiva che descrive il semilavorato; il catalogo non espone tutti gli input.', ['Controllare gli scambi del dataset prima di aggiungere eventuali input di materiale.']);
    if (materialMarket && transformService) push('Materiale di mercato + servizio', [step('Materiale', materialMarket), step('Trasformazione', transformService)], describeDataset(transformService).excludesMaterial ? 'La descrizione del servizio dichiara che il materiale trattato va aggiunto separatamente.' : 'Il servizio descrive la lavorazione; il confine del materiale trattato va verificato.', describeDataset(transformService).excludesMaterial ? [] : ['Verificare nella scheda completa che il servizio non includa già il materiale lavorato.']);
    if (materialProducer && transformService && geography && norm(materialProducer.geography) === norm(geography) && chains.length < 3) push('Produzione specifica + servizio', [step('Materiale', materialProducer), step('Trasformazione', transformService)], 'Alternativa per un fornitore o una tecnologia produttiva nota.', ['Usare la produzione specifica solo se rappresentativa del fornitore reale.']);
    if (materialMarket && transformMarketService && chains.length < 3) push('Materiale di mercato + mercato del servizio', [step('Materiale', materialMarket), step('Trasformazione', transformMarketService)], 'Il servizio è fornito attraverso una market activity.', [!describeDataset(transformMarketService).excludesMaterial ? 'Verificare nella scheda completa che il servizio non includa già il materiale lavorato.' : '', 'Verificare se la geografia del mercato del servizio rappresenta il processo reale.'].filter(Boolean));
    if (!transformation && materialMarket) push('Materiale acquistato', [step('Materiale', materialMarket)], 'Mercato del materiale richiesto.', []);
    if (!transformation && materialProducer && geography && norm(materialProducer.geography) === norm(geography) && chains.length < 3) push('Produzione del materiale', [step('Materiale', materialProducer)], 'Attività produttiva specifica, se coerente con il fornitore.', []);
    if (!chains.length) return { chains: [], message: 'Nessuna catena con confini sufficientemente chiari. Prova termini più specifici e verifica la scheda ecoinvent.' };
    for (const chain of chains) {
      if (geography && chain.steps.some(s => norm(s.dataset.geography) !== norm(geography))) chain.checks.push('Una o più geografie differiscono dal luogo indicato: verificare la rappresentatività.');
      if (chain.steps.length > 1 && chain.steps.some(s => s.dataset.unit && s.dataset.unit !== 'kg')) chain.checks.push('Le unità dei passaggi differiscono: definire i fattori di conversione fisici.');
    }
    return { chains: chains.slice(0, 3), message: '' };
  }
  function suggest(datasets, description) {
    const interpretation = parseDescription(description);
    const notes = [];
    if (!String(description || '').trim()) return { interpretation, chains: [], notes, message: 'Descrivi il processo reale da modellare.' };
    if (interpretation.blastFurnace) {
      if (interpretation.family === 'stainless') {
        notes.push('L’altoforno produce ghisa, mentre la descrizione richiede acciaio inox. Non sommare automaticamente una ghisa da altoforno al dataset dell’acciaio inox: servono la rotta produttiva e i relativi flussi.');
        const names = ['market for steel, chromium steel 18/8', 'steel production, electric, chromium steel 18/8'];
        const chains = names.map((name, i) => {
          const matches = datasets.filter(d => norm(d.activity) === norm(name) && d.unit === 'kg');
          const dataset = matches.find(d => d.geography === (i ? 'RER' : 'GLO')) || matches[0];
          return dataset && { title: i ? 'Produzione di acciaio inox, rotta elettrica' : 'Acciaio inox da mercato', steps: [step('Acciaio inox', dataset)], basis: i ? 'Attività produttiva specifica presente nel catalogo; la rotta indicata è elettrica.' : 'Mercato del materiale finito presente nel catalogo.', checks: [i ? 'Confermare che la rotta elettrica rappresenti il fornitore reale.' : 'Il mercato non identifica da solo la quota prodotta tramite altoforno.'] };
        }).filter(Boolean);
        return { interpretation, chains, notes, message: chains.length ? '' : 'Nessun dataset di acciaio inox sufficientemente pertinente nel catalogo.' };
      }
      if (interpretation.family === 'iron') interpretation.material = 'pig iron';
      else notes.push('L’altoforno riguarda la produzione di ghisa a monte. Non è una lavorazione applicabile automaticamente al materiale descritto; occorrono i flussi della rotta produttiva.');
    }
    if (!interpretation.material && !interpretation.transformation) return { interpretation, chains: [], notes, message: 'Non riesco a identificare materiale o lavorazione con sufficiente affidabilità. Aggiungi nella descrizione il materiale, la forma o l’operazione reale.' };
    const result = generate(datasets, interpretation);
    if (!interpretation.material) notes.push('Il materiale non è riconosciuto: le combinazioni non possono includere con certezza l’input materiale.');
    if (!interpretation.transformation && !interpretation.blastFurnace) notes.push('Non è stata riconosciuta una trasformazione; le proposte coprono il materiale e le eventuali finiture indicate.');
    return { ...result, interpretation, notes };
  }
  return { parseDescription, describeDataset, generate, suggest };
});
