const test = require('node:test');
const assert = require('node:assert/strict');
const Store = require('../catalog-store.js');

test('saved catalog can be restored and removed across store operations', async () => {
  const records = new Map();
  let created = false;
  global.indexedDB = {
    open() {
      const req = {};
      queueMicrotask(() => {
        req.result = {
          objectStoreNames: { contains: () => created },
          createObjectStore: () => { created = true; },
          close: () => {},
          transaction() {
            const tx = { error: null, objectStore: () => ({
              get(key) { return request(() => records.get(key), tx); },
              put(value, key) { return request(() => records.set(key, value), tx); },
              delete(key) { return request(() => records.delete(key), tx); }
            }) };
            return tx;
          }
        };
        if (!created) req.onupgradeneeded();
        req.onsuccess();
      });
      return req;
    }
  };
  function request(action, tx) {
    const req = {};
    queueMicrotask(() => { req.result = action(); req.onsuccess(); tx.oncomplete(); });
    return req;
  }
  try {
    const record = { name: 'catalog.xlsx', blob: new Blob(['local data']), count: 2, version: '3.11' };
    await Store.save(record);
    assert.equal((await Store.load()).name, 'catalog.xlsx');
    await Store.remove();
    assert.equal(await Store.load(), undefined);
  } finally { delete global.indexedDB; }
});
