(() => {
  'use strict';
  const C = window.MapperCore;
  const $ = selector => document.querySelector(selector);
  const state = { datasets: [], bom: [], parsed: {}, picker: null, version: '', pendingCatalogFile: null, cachedRecord: null, activeCatalogRecord: null, catalogLoadToken: 0 };
  const byId = () => new Map(state.datasets.map(d => [d.id, d]));
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const notify = msg => { $('#toast').textContent = msg; $('#toast').classList.add('show'); clearTimeout(notify.timer); notify.timer = setTimeout(() => $('#toast').classList.remove('show'), 4500); };
  const download = (name, content, mime) => {
    const url = URL.createObjectURL(new Blob(['\uFEFF', content], { type: mime }));
    const a = document.createElement('a'); a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 10000);
  };
  function tabs(name) {
    document.querySelectorAll('.nav').forEach(b => b.classList.toggle('active', b.dataset.tab === name));
    document.querySelectorAll('.panel').forEach(p => p.classList.toggle('active', p.id === name));
  }
  document.querySelectorAll('.nav').forEach(b => b.addEventListener('click', () => tabs(b.dataset.tab)));
  function status() {
    $('#dataset-count').textContent = `${state.datasets.length.toLocaleString('it-IT')} dataset caricati`;
    $('#bom-count').textContent = `${state.bom.length} righe BOM`;
    $('#db-version').textContent = state.version || 'Versione non indicata';
  }
  $('#version').addEventListener('input', e => { state.version = e.target.value.trim(); status(); });
  $('#version').addEventListener('change', async () => {
    if (!state.activeCatalogRecord) return;
    const record = { ...state.activeCatalogRecord, version: state.version, savedAt: new Date().toISOString() };
    try {
      await window.CatalogStore.save(record);
      state.activeCatalogRecord = record; state.cachedRecord = record; renderCacheStatus();
    } catch (error) { notify(`Versione non salvata nel browser: ${error.message}`); }
  });
  function renderCacheStatus() {
    const record = state.cachedRecord;
    $('#catalog-cache-status').textContent = record
      ? `${record.name} · ${Number(record.count || 0).toLocaleString('it-IT')} attività · memorizzato su questo dispositivo il ${new Date(record.savedAt).toLocaleString('it-IT')}.`
      : 'Nessun catalogo memorizzato su questo browser. Caricalo una volta per ritrovarlo alle prossime aperture.';
    $('#restore-catalog-btn').classList.toggle('hidden', !record);
    $('#remove-catalog-btn').classList.toggle('hidden', !record);
  }
  async function parseCatalogFile(file, name) {
    return /\.xlsx$/i.test(name) ? window.XlsxReader.read(await file.arrayBuffer()) : C.parseDelimited(await file.text());
  }
  async function restoreSavedCatalog() {
    const token = ++state.catalogLoadToken;
    try {
      const record = await window.CatalogStore.load();
      if (token !== state.catalogLoadToken) return;
      state.cachedRecord = record || null;
      renderCacheStatus();
      if (!record) return;
      const parsed = await parseCatalogFile(record.blob, record.name);
      const datasets = C.normalizeDatasets(parsed.rows, record.map);
      if (!datasets.length) throw new Error('Il catalogo salvato non contiene attività valide.');
      if (token !== state.catalogLoadToken) return;
      state.datasets = datasets; state.version = record.version || '';
      state.activeCatalogRecord = record;
      state.bom.forEach(item => { item.selected = { material: null, transformation: null, finishing: null }; });
      $('#version').value = state.version;
      populateFilters(); status(); renderBom(); renderQA(); tabs('finder');
      notify(`${datasets.length.toLocaleString('it-IT')} attività ripristinate dal browser.`);
    } catch (error) {
      if (token !== state.catalogLoadToken) return;
      $('#catalog-cache-status').textContent = `Archivio locale non disponibile: ${error.message}. Puoi caricare il file manualmente.`;
    }
  }
  $('#restore-catalog-btn').addEventListener('click', restoreSavedCatalog);
  $('#remove-catalog-btn').addEventListener('click', async () => {
    try {
      await window.CatalogStore.remove();
      ++state.catalogLoadToken;
      if (state.activeCatalogRecord) {
        state.datasets = []; state.version = ''; state.activeCatalogRecord = null;
        $('#version').value = '';
        state.bom.forEach(item => { item.selected = { material: null, transformation: null, finishing: null }; });
        $('#finder-results').innerHTML = '<p class="empty">Carica il catalogo per iniziare.</p>';
        populateFilters(); status(); renderBom(); renderQA(); tabs('setup');
      }
      state.cachedRecord = null; renderCacheStatus(); notify('Catalogo rimosso dal browser.');
    } catch (error) { notify(`Impossibile rimuovere il catalogo: ${error.message}`); }
  });
  async function importFile(file, kind) {
    if (!file) return;
    try {
      if (kind === 'datasets') ++state.catalogLoadToken;
      if (file.size > 40 * 1024 * 1024) throw new Error('File superiore a 40 MB. Seleziona un catalogo più compatto.');
      notify('Lettura del file in corso…');
      await new Promise(resolve => requestAnimationFrame(() => setTimeout(resolve, 0)));
      const parsed = await parseCatalogFile(file, file.name);
      state.parsed[kind] = parsed;
      if (kind === 'datasets') state.pendingCatalogFile = file;
      renderMap(kind);
      notify(`${parsed.rows.length.toLocaleString('it-IT')} righe lette. Controlla le colonne e conferma.`);
    } catch (e) { notify(e.message); }
  }
  $('#dataset-file').addEventListener('change', e => importFile(e.target.files[0], 'datasets'));
  $('#bom-file').addEventListener('change', e => importFile(e.target.files[0], 'bom'));
  $('#demo-catalog-btn').addEventListener('click', () => {
    if (state.datasets.length && !confirm('Sostituire il catalogo attuale con dati dimostrativi sintetici?')) return;
    ++state.catalogLoadToken; state.activeCatalogRecord = null;
    state.datasets = [
      ['market for aluminium, wrought alloy', 'aluminium, wrought alloy'],
      ['extrusion of aluminium', 'extrusion of aluminium'],
      ['anodising of aluminium', 'anodising service'],
      ['market for acrylonitrile butadiene styrene', 'acrylonitrile butadiene styrene'],
      ['injection moulding of plastic', 'injection moulding service'],
      ['market for aluminium profile', 'aluminium profile']
    ].map(([activity, product], i) => ({ id: `demo-${i}`, activity, product, geography: 'RER', unit: 'kg', classification: 'DEMO · dati inventati' }));
    state.version = 'DEMO · dati sintetici, non ecoinvent';
    $('#version').value = state.version;
    state.bom.forEach(item => { item.selected = { material: null, transformation: null, finishing: null }; });
    populateFilters(); status(); renderBom(); renderQA(); tabs('finder'); notify('Catalogo sintetico caricato. Non utilizzare i risultati per studi LCA.');
  });
  function renderMap(kind) {
    const parsed = state.parsed[kind], map = C.autoMap(parsed.headers, kind);
    const box = kind === 'datasets' ? $('#dataset-map') : $('#bom-map');
    const labels = kind === 'datasets' ? {
      activity: 'Activity Name *', product: 'Reference product (facoltativo)', geography: 'Geography', unit: 'Unit', activityType: 'Special Activity Type', sector: 'Sector', information: 'Product Information', classification: 'Classification', uuid: 'UUID'
    } : {
      component: 'Component *', material: 'Material *', grade: 'Material specification', mass: 'Mass', unit: 'Mass unit', form: 'Semi-finished form', process: 'Manufacturing process', finishing: 'Finishing', geography: 'Supplier country'
    };
    box.innerHTML = `<h3>Associa le colonne · ${parsed.rows.length.toLocaleString('it-IT')} righe</h3><div class="field-grid">${Object.entries(labels).map(([key, label]) => `<label>${label}<select data-field="${key}"><option value="">— Non presente —</option>${parsed.headers.map(h => `<option value="${esc(h)}" ${map[key] === h ? 'selected' : ''}>${esc(h)}</option>`).join('')}</select></label>`).join('')}</div><button class="primary" data-apply="${kind}">Conferma importazione</button>`;
    box.classList.remove('hidden');
  }
  document.addEventListener('click', async e => {
    const button = e.target.closest('[data-apply]'); if (!button) return;
    const kind = button.dataset.apply, box = kind === 'datasets' ? $('#dataset-map') : $('#bom-map');
    const map = Object.fromEntries([...box.querySelectorAll('[data-field]')].map(s => [s.dataset.field, s.value]));
    if (kind === 'datasets' && !map.activity || kind === 'bom' && (!map.component || !map.material)) { notify('Associa le colonne obbligatorie.'); return; }
    if (kind === 'datasets') {
      const next = C.normalizeDatasets(state.parsed.datasets.rows, map);
      if (!next.length) { notify('Nessun dataset valido: verifica le colonne selezionate.'); return; }
      state.datasets = next;
      delete state.parsed.datasets;
      state.bom.forEach(item => { item.selected = { material: null, transformation: null, finishing: null }; });
      populateFilters();
      box.classList.add('hidden'); status(); renderBom(); renderQA(); tabs('finder');
      notify(`${next.length.toLocaleString('it-IT')} dataset disponibili. Salvataggio locale in corso…`);
      const file = state.pendingCatalogFile;
      if (file) {
        const record = { name: file.name, blob: file, map, version: state.version, count: next.length, savedAt: new Date().toISOString() };
        state.activeCatalogRecord = record;
        try {
          await window.CatalogStore.save(record);
          state.cachedRecord = record; renderCacheStatus(); notify('Catalogo memorizzato in questo browser.');
        } catch (error) { notify(`Catalogo utilizzabile ora, ma non memorizzato: ${error.message}`); }
        state.pendingCatalogFile = null;
      }
      return;
    } else {
      state.bom = C.normalizeBom(state.parsed.bom.rows, map);
      notify(`${state.bom.length} componenti importati.`); tabs('mapper');
    }
    box.classList.add('hidden'); status(); renderBom(); renderQA();
  });
  function datasetCard(hit, action = '') {
    const d = hit.dataset;
    return `<article class="dataset"><div class="score">${hit.score}<small>match</small></div><div><strong>${esc(d.activity)}</strong><p>${d.product ? `${esc(d.product)} · ` : ''}<span class="tag">${esc(d.geography || '—')}</span> <span class="tag">${esc(d.unit || '—')}</span> <span class="tag">${esc(hit.kind)}</span></p><small>${esc(hit.reasons.join(' · ') || 'corrispondenza parziale')} · ${esc(state.version || 'Versione da indicare')}</small></div>${action}</article>`;
  }
  function populateFilters() {
    for (const [id, values] of [['#search-geo', [...new Set(state.datasets.map(d => d.geography).filter(Boolean))]], ['#search-unit', [...new Set(state.datasets.map(d => d.unit).filter(Boolean))]]]) {
      const select = $(id), current = select.value, label = id === '#search-geo' ? 'Tutte' : 'Qualsiasi';
      select.innerHTML = `<option value="">${label}</option>${values.sort((a, b) => a.localeCompare(b)).map(v => `<option value="${esc(v)}">${esc(v)}</option>`).join('')}`;
      if (values.includes(current)) select.value = current;
    }
  }
  function finderCard(hit) {
    const d = hit.dataset;
    const geos = hit.alternatives.map(x => x.geography || '—').filter((x, i, list) => list.indexOf(x) === i);
    return `<article class="dataset"><div class="score">${hit.score}<small>match</small></div><div><strong>${esc(d.activity)}</strong><p><span class="tag">${esc(hit.kind)}</span> <span class="tag">${esc(d.unit || '—')}</span> ${geos.slice(0, 10).map(g => `<span class="tag">${esc(g)}</span>`).join(' ')}${geos.length > 10 ? ` +${geos.length - 10}` : ''}</p><small>${esc(hit.reasons.join(' · '))}${d.sector ? ` · ${esc(d.sector)}` : ''}</small>${d.product || d.information || d.activityType ? `<details><summary>Dettagli del processo</summary>${d.product ? `<p><b>Reference product:</b> ${esc(d.product)}</p>` : ''}${d.activityType ? `<p><b>Special Activity Type:</b> ${esc(d.activityType)}</p>` : ''}${d.information ? `<p><b>Product Information:</b> ${esc(d.information.slice(0, 1200))}${d.information.length > 1200 ? '…' : ''}</p>` : ''}<p>Versione: ${esc(state.version || 'da indicare')}</p></details>` : ''}</div></article>`;
  }
  async function finder() {
    if (!state.datasets.length) { $('#finder-results').innerHTML = '<p class="empty">Carica prima un catalogo.</p>'; return; }
    const q = $('#search-query').value.trim();
    if (!q) { notify('Inserisci un termine di ricerca.'); return; }
    $('#finder-results').innerHTML = '<p class="empty">Ricerca nel catalogo in corso…</p>';
    await new Promise(resolve => requestAnimationFrame(() => setTimeout(resolve, 0)));
    const hits = C.searchGrouped(state.datasets, q, $('#search-stage').value, { geography: $('#search-geo').value, strictGeography: true, unit: $('#search-unit').value, strictUnit: true, type: $('#search-type').value }, 30);
    $('#finder-results').innerHTML = hits.results.length ? `<p class="result-note">${hits.totalActivities.toLocaleString('it-IT')} attività corrispondenti (${hits.totalDatasets.toLocaleString('it-IT')} varianti geografiche) · prime ${hits.results.length} per somiglianza</p>${hits.results.map(finderCard).join('')}` : '<p class="empty">Nessun risultato. Prova con termini più generici o cambia i filtri.</p>';
  }
  $('#search-btn').addEventListener('click', finder);
  $('#search-query').addEventListener('keydown', e => { if (e.key === 'Enter') finder(); });
  function selectedHtml(item, stage, map) {
    const d = map.get(item.selected[stage]);
    const names = { material: '01 · Produzione materiale', transformation: '02 · Semilavorato', finishing: '03 · Finitura' };
    const status = stage === 'material' ? '' : item[`${stage}Status`];
    return `<div class="step"><div><span class="step-label">${names[stage]}</span><strong>${d ? esc(d.activity) : status && status !== 'pending' ? esc(status === 'included' ? 'Già incluso nel dataset precedente' : 'Non applicabile') : 'Da definire'}</strong><small>${d ? `${esc(d.product)} · ${esc(d.geography)} · ${esc(d.unit)}` : stage === 'transformation' ? esc(C.inferProcess(item.form, item.process) || 'Processo da specificare') : esc(item.finishing || 'Nessuna finitura indicata')}</small></div><div class="step-actions"><button class="secondary small" data-pick="${stage}" data-id="${esc(item.id)}">${d ? 'Cambia' : 'Seleziona'}</button>${d ? `<button class="ghost small" data-clear="${stage}" data-id="${esc(item.id)}">Rimuovi</button>` : ''}${stage !== 'material' ? `<select aria-label="Stato ${names[stage]}" data-status="${stage}" data-id="${esc(item.id)}"><option value="pending" ${status === 'pending' ? 'selected' : ''}>Da valutare</option><option value="included" ${status === 'included' ? 'selected' : ''}>Già incluso</option><option value="na" ${status === 'na' ? 'selected' : ''}>Non applicabile</option></select>` : ''}</div></div>`;
  }
  function renderBom() {
    const box = $('#bom-list');
    if (!state.bom.length) { box.innerHTML = '<p class="empty">Importa una BOM per iniziare.</p>'; return; }
    const map = byId();
    box.innerHTML = state.bom.map((item, i) => {
      const warnings = C.issues(item, map);
      return `<article class="bom-card"><div class="bom-head"><div><span class="eyebrow">COMPONENTE ${String(i + 1).padStart(2, '0')}</span><h3>${esc(item.component || item.material)}</h3><p>${esc(item.material)} ${item.grade ? `· ${esc(item.grade)}` : ''} · ${item.massKg == null ? 'Massa non valida' : `${item.massKg.toLocaleString('it-IT')} kg`}${item.form ? ` · ${esc(item.form)}` : ''}</p></div><span class="badge ${warnings.length ? 'warn' : 'ok'}">${warnings.length ? `${warnings.length} da verificare` : 'Completo'}</span></div><div class="steps">${['material', 'transformation', 'finishing'].map(stage => selectedHtml(item, stage, map)).join('')}</div><label class="rationale">Motivazione della scelta<textarea data-rationale="${esc(item.id)}" placeholder="Es. EN AW-6060 estruso; dataset scelti per forma, tecnologia e geografia">${esc(item.rationale)}</textarea></label></article>`;
    }).join('');
  }
  $('#bom-list').addEventListener('click', e => {
    const pick = e.target.closest('[data-pick]'), clear = e.target.closest('[data-clear]');
    if (pick) openPicker(pick.dataset.id, pick.dataset.pick);
    if (clear) { const item = state.bom.find(x => x.id === clear.dataset.id); item.selected[clear.dataset.clear] = null; renderBom(); renderQA(); }
  });
  $('#bom-list').addEventListener('change', e => {
    if (!e.target.matches('[data-status]')) return;
    const item = state.bom.find(x => x.id === e.target.dataset.id);
    item[`${e.target.dataset.status}Status`] = e.target.value;
    if (e.target.value !== 'pending') item.selected[e.target.dataset.status] = null;
    renderBom(); renderQA();
  });
  $('#bom-list').addEventListener('input', e => {
    if (!e.target.matches('[data-rationale]')) return;
    state.bom.find(x => x.id === e.target.dataset.rationale).rationale = e.target.value;
  });
  function openPicker(id, stage) {
    if (!state.datasets.length) { notify('Carica prima il catalogo dataset.'); tabs('setup'); return; }
    state.picker = { id, stage };
    const item = state.bom.find(x => x.id === id);
    const query = stage === 'material' ? `${item.grade} ${item.material}`.trim() : stage === 'transformation' ? C.inferProcess(item.form, item.process) : item.finishing;
    $('#picker-label').textContent = `${item.component} · ${stage}`;
    $('#picker-query').value = query;
    $('#picker').showModal(); pickerSearch();
  }
  function pickerSearch() {
    if (!state.picker) return;
    const item = state.bom.find(x => x.id === state.picker.id), q = $('#picker-query').value.trim();
    const hits = C.search(state.datasets, q, state.picker.stage, { geography: item.geography, unit: 'kg' }, 30);
    $('#picker-results').innerHTML = hits.length ? hits.map(h => datasetCard(h, `<button class="primary small" data-select="${esc(h.dataset.id)}">Scegli</button>`)).join('') : '<p class="empty">Nessun risultato. Modifica i termini di ricerca.</p>';
  }
  $('#picker-search-btn').addEventListener('click', pickerSearch);
  $('#picker-query').addEventListener('keydown', e => { if (e.key === 'Enter') pickerSearch(); });
  $('#picker-results').addEventListener('click', e => {
    const b = e.target.closest('[data-select]'); if (!b || !state.picker) return;
    const item = state.bom.find(x => x.id === state.picker.id);
    item.selected[state.picker.stage] = b.dataset.select;
    if (state.picker.stage !== 'material') item[`${state.picker.stage}Status`] = 'pending';
    $('#picker').close(); state.picker = null; renderBom(); renderQA();
  });
  function renderQA() {
    const map = byId(), reports = state.bom.map(item => ({ item, warnings: C.issues(item, map) }));
    const complete = reports.filter(r => !r.warnings.length).length;
    $('#qa-summary').innerHTML = `<div class="metric"><strong>${reports.length}</strong><span>componenti</span></div><div class="metric"><strong>${complete}</strong><span>senza segnalazioni</span></div><div class="metric"><strong>${reports.reduce((n, r) => n + r.warnings.length, 0)}</strong><span>punti da verificare</span></div>`;
    $('#qa-list').innerHTML = reports.length ? reports.map(({ item, warnings }) => `<article class="qa-item"><h3>${esc(item.component || item.material)}</h3>${warnings.length ? `<ul>${warnings.map(w => `<li>${esc(w)}</li>`).join('')}</ul>` : '<p class="good">Nessuna segnalazione automatica.</p>'}</article>`).join('') : '<p class="empty">Nessuna BOM caricata.</p>';
  }
  $('#template-btn').addEventListener('click', () => download('BOM_template.csv', C.toCsv([['Component', 'Material', 'Material specification', 'Mass', 'Unit', 'Semi-finished form', 'Manufacturing process', 'Finishing', 'Supplier country'], ['Heat sink', 'Aluminium', 'EN AW-6060', '8,4', 'kg', 'Extruded profile', 'Extrusion', 'Anodising', 'IT']]), 'text/csv;charset=utf-8'));
  $('#sample-btn').addEventListener('click', () => {
    if (state.bom.length && !confirm('Sostituire la BOM attuale con l’esempio?')) return;
    const csv = C.parseDelimited(C.toCsv([['Component', 'Material', 'Material specification', 'Mass', 'Unit', 'Semi-finished form', 'Manufacturing process', 'Finishing', 'Supplier country'], ['Heat sink', 'Aluminium', 'EN AW-6060', '8,4', 'kg', 'Extruded profile', 'Extrusion', 'Anodising', 'IT'], ['Cover', 'ABS', '', '2,1', 'kg', 'Injection moulded', 'Injection moulding', '', 'IT']]));
    state.bom = C.normalizeBom(csv.rows, C.autoMap(csv.headers, 'bom')); status(); renderBom(); renderQA(); notify('BOM dimostrativa caricata.');
  });
  $('#export-btn').addEventListener('click', () => {
    if (!state.bom.length) { notify('Importa una BOM prima di esportare.'); return; }
    const map = byId();
    const headers = ['Component', 'Material', 'Specification', 'Mass kg', 'Semi-finished form', 'Declared process', 'Declared finishing', 'Supplier country', 'Material activity', 'Material reference product', 'Material geography', 'Material unit', 'Material UUID', 'Transformation activity', 'Transformation reference product', 'Transformation geography', 'Transformation unit', 'Transformation UUID', 'Transformation status', 'Finishing activity', 'Finishing reference product', 'Finishing geography', 'Finishing unit', 'Finishing UUID', 'Finishing status', 'Ecoinvent version and system model', 'Rationale', 'QA flags'];
    const rows = state.bom.map(x => {
      const m = map.get(x.selected.material) || {}, t = map.get(x.selected.transformation) || {}, f = map.get(x.selected.finishing) || {};
      return [x.component, x.material, x.grade, x.massKg, x.form, x.process, x.finishing, x.geography, m.activity, m.product, m.geography, m.unit, m.id, t.activity, t.product, t.geography, t.unit, t.id, x.transformationStatus, f.activity, f.product, f.geography, f.unit, f.id, x.finishingStatus, state.version, x.rationale, C.issues(x, map).join(' | ')];
    });
    download('LCA_material_mapping.csv', C.toCsv([headers, ...rows]), 'text/csv;charset=utf-8');
  });
  $('#save-btn').addEventListener('click', () => {
    if (!state.bom.length) { notify('Nessuna BOM da salvare.'); return; }
    download('LCA_material_mapping_project.json', JSON.stringify({ schema: 1, version: state.version, datasets: state.datasets, bom: state.bom }, null, 2), 'application/json');
  });
  $('#project-file').addEventListener('change', async e => {
    try {
      const file = e.target.files[0]; if (!file) return;
      if (file.size > 40 * 1024 * 1024) throw new Error('Progetto troppo grande.');
      const data = JSON.parse(await file.text());
      if (data.schema !== 1 || !Array.isArray(data.datasets) || !Array.isArray(data.bom)) throw new Error('Formato progetto non riconosciuto.');
      state.version = String(data.version || ''); state.datasets = data.datasets; state.bom = data.bom;
      ++state.catalogLoadToken; state.activeCatalogRecord = null;
      $('#version').value = state.version; populateFilters(); status(); renderBom(); renderQA(); tabs('audit'); notify('Progetto caricato.');
    } catch (err) { notify(err.message); }
    e.target.value = '';
  });
  renderQA(); status(); restoreSavedCatalog();
})();
