import assert from 'node:assert/strict';
import worker, { validateFile } from '../worker/index.js';
assert.equal(validateFile(new File(['{}'], 'animation.json')), 'application/json');
for (const name of ['x.html', '../x.json', 'x.svg']) assert.throws(() => validateFile(new File(['x'], name)));
assert.throws(() => validateFile(new File([], 'empty.json')));
assert.throws(() => validateFile(new File([new Uint8Array(20 * 1024 * 1024 + 1)], 'large.zip')));
const session = await worker.fetch(new Request('https://example.com/api/session'), {});
assert.match(session.headers.get('Set-Cookie'), /HttpOnly; SameSite=Strict;.*Secure/);
const denied = await worker.fetch(new Request('https://example.com/api/files', { method: 'POST', headers: { Cookie: 'animax_session=' + 'a'.repeat(64), Origin: 'https://evil.example' } }), { DB: {}, FILES: {} });
assert.equal(denied.status, 403);
const anonymous = await worker.fetch(new Request('https://example.com/api/files'), { DB: {}, FILES: {} });
assert.equal(anonymous.status, 401);
console.log('Storage validation, session and cross-origin checks passed');

let touchedR2 = false;
const quotaExceeded = { prepare: () => ({ bind: () => ({ first: async () => null }) }) };
const limited = await worker.fetch(new Request('https://example.com/api/objects/12345678-1234-1234-1234-123456789012/test.json'), { DB: quotaExceeded, FILES: { get: () => { touchedR2 = true; } } });
assert.equal(limited.status, 429);
assert.equal(touchedR2, false, 'Quota rejection must happen before any billable R2 read');
const quotaUnavailable = { prepare: () => { throw new Error('D1 unavailable'); } };
const failedClosed = await worker.fetch(new Request('https://example.com/api/objects/12345678-1234-1234-1234-123456789012/test.json'), { DB: quotaUnavailable, FILES: { get: () => { touchedR2 = true; } } });
assert.equal(failedClosed.status, 500);
assert.equal(touchedR2, false);
console.log('Quota exhaustion and database failures reject before R2 access');

assert.equal(validateFile(new File([new Uint8Array(20 * 1024 * 1024)], 'boundary.mp4')), 'video/mp4');
for (const deniedKey of ['user-day:', 'day:', 'storage']) {
  let putCalled = false;
  const db = { prepare: () => ({ bind: (key) => ({ first: async () => key.startsWith(deniedKey) ? null : { id: key } }) }) };
  const body = new FormData(); body.set('file', new File(['{}'], 'quota.json'));
  const result = await worker.fetch(new Request('https://example.com/api/files', { method: 'POST', headers: { Cookie: 'animax_session=' + 'b'.repeat(64), Origin: 'https://example.com' }, body }), { DB: db, FILES: { put: () => { putCalled = true; } } });
  assert.equal(result.status, 429);
  assert.match((await result.json()).error, deniedKey === 'storage' ? /站点存储份额已满/ : /今日上传的份额已经满了/);
  assert.equal(putCalled, false);
}
console.log('20 MiB boundary and user/IP/global upload quota rejection passed');

// Exercise the actual quota SQL at the daily boundary, without sending 200 MiB.
const { DatabaseSync } = await import('node:sqlite');
const { readFileSync } = await import('node:fs');
const sqlite = new DatabaseSync(':memory:');
sqlite.exec(readFileSync(new URL('../migrations/0001_files.sql', import.meta.url), 'utf8'));
const realDB = { prepare: sql => ({ bind: (...args) => ({
  first: async () => sqlite.prepare(sql).get(...args),
  run: async () => sqlite.prepare(sql).run(...args),
}) }) };
const seedUpload = () => {
  const body = new FormData(); body.set('file', new File(['{}'], 'boundary.json'));
  return new Request('https://example.com/api/files', {method:'POST', headers:{Cookie:'animax_session='+'c'.repeat(64),Origin:'https://example.com'},body});
};
let writes = 0;
const realEnv = { DB:realDB, FILES:{put:async()=>{writes++}} };
assert.equal((await worker.fetch(seedUpload(),realEnv)).status,201);
sqlite.exec("UPDATE quotas SET bytes = 209715198 WHERE id LIKE 'user-day:%' OR id LIKE 'day:%'");
assert.equal((await worker.fetch(seedUpload(),realEnv)).status,201, 'Exactly 200 MiB is allowed');
const exhausted = await worker.fetch(seedUpload(),realEnv);
assert.equal(exhausted.status,429);
assert.match((await exhausted.json()).error,/今日上传的份额已经满了/);
assert.equal(writes,2);
sqlite.close();
console.log('Real SQLite quota boundary: exactly 200 MiB accepted, next upload rejected');
