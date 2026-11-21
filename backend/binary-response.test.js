import test from 'node:test';
import assert from 'node:assert/strict';
import worker from './worker.js';

// Real D1 runtimes (including local wrangler persistence) can return BLOB
// columns as plain number arrays. The Worker must still serve the bytes.
const IMAGE = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82]);
const ID = '5e2891aa-e15c-4dfc-8856-0f1d7e646f51';

const env = {
  PUBLIC_ORIGINS: 'https://mzactive.com',
  DB: {
    prepare(sql) {
      return {
        bind() { return this; },
        first() {
          if (sql.includes('provider_covers')) return { bytes: Array.from(IMAGE), content_type: 'image/png' };
          if (sql.includes('profile_photo_bytes')) return {
            profile_photo_bytes: Array.from(IMAGE),
            profile_photo_content_type: 'image/png',
            public_fields_json: JSON.stringify(['profile_photo']),
          };
          return null;
        },
      };
    },
  },
};

for (const path of ['photo', 'cover']) {
  test(`public ${path} serves D1 number-array blobs as real bytes`, async () => {
    const response = await worker.fetch(new Request(`https://api.example.test/api/providers/${ID}/${path}`, {
      headers: { origin: 'https://mzactive.com' },
    }), env);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('content-type'), 'image/png');
    assert.deepEqual(new Uint8Array(await response.arrayBuffer()), IMAGE);
  });
}
