(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.CatalogStore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const DB_NAME = 'sgs-toolkit-local-catalog';
  const STORE = 'catalogs';
  const KEY = 'active';

  function open() {
    return new Promise((resolve, reject) => {
      if (typeof indexedDB === 'undefined') return reject(new Error('IndexedDB non disponibile in questo browser.'));
      let request;
      try { request = indexedDB.open(DB_NAME, 1); }
      catch (error) { reject(error); return; }
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('Impossibile aprire l’archivio locale.'));
      request.onblocked = () => reject(new Error('Archivio locale occupato da un’altra scheda.'));
    });
  }
  async function transact(mode, operation) {
    const db = await open();
    return new Promise((resolve, reject) => {
      let result;
      let tx;
      try {
        tx = db.transaction(STORE, mode);
        const request = operation(tx.objectStore(STORE));
        request.onsuccess = () => { result = request.result; };
        request.onerror = () => { /* transaction.onerror reports the failure */ };
        tx.oncomplete = () => { db.close(); resolve(result); };
        tx.onerror = () => { const error = tx.error || new Error('Errore nell’archivio locale.'); db.close(); reject(error); };
        tx.onabort = () => { const error = tx.error || new Error('Salvataggio locale interrotto.'); db.close(); reject(error); };
      } catch (error) { db.close(); reject(error); }
    });
  }
  const load = () => transact('readonly', store => store.get(KEY));
  const save = record => transact('readwrite', store => store.put(record, KEY));
  const remove = () => transact('readwrite', store => store.delete(KEY));
  return { load, save, remove };
});
