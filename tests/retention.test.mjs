import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import worker from '../worker/index.js';
import { cleanupUnused, recordDependencies, touchFile } from '../worker/retention.js';

const sqlite = new DatabaseSync(':memory:');
sqlite.exec('PRAGMA foreign_keys = ON');
sqlite.exec(readFileSync(new URL('../migrations/0001_files.sql', import.meta.url), 'utf8'));
const seed = (id, time) => sqlite.prepare("INSERT INTO files (id,owner,name,size,content_type,created_at) VALUES (?,'test','data.json',10,'application/json',?)").run(id, time);
seed('legacy', 1);
sqlite.exec(readFileSync(new URL('../migrations/0003_retention.sql', import.meta.url), 'utf8'));
assert.ok(sqlite.prepare("SELECT last_accessed_at FROM files WHERE id='legacy'").get().last_accessed_at > Date.now() - 2000, 'Historical files get a grace period');
sqlite.exec('DELETE FROM files');
const DB = { prepare: sql => ({ bind: (...args) => ({
  first: async () => sqlite.prepare(sql).get(...args),
  all: async () => ({ results: sqlite.prepare(sql).all(...args) }),
  run: async () => sqlite.prepare(sql).run(...args),
}) }) };
const now = Date.now();
const cutoff = now - 30 * 86400000;
const ids = Array.from({ length: 8 }, () => crypto.randomUUID());
for (const id of ids) seed(id, 1);
sqlite.prepare('UPDATE files SET last_accessed_at=?').run(cutoff - 1);
sqlite.prepare('UPDATE files SET last_accessed_at=? WHERE id=?').run(cutoff, ids[0]);
sqlite.prepare('UPDATE files SET protected=1 WHERE id=?').run(ids[1]);
sqlite.prepare('UPDATE files SET hidden=1 WHERE id=?').run(ids[2]);
sqlite.exec("INSERT INTO quotas VALUES ('storage',80,8), ('upload-month:test',80,8)");
// Active animation protects nested/shared dependencies, including cycles.
await recordDependencies(DB, ids[3], { url: `/api/objects/${ids[4]}/image.png` }, cutoff - 1);
await recordDependencies(DB, ids[4], { url: `/api/objects/${ids[5]}/nested.json` }, cutoff - 1);
await recordDependencies(DB, ids[5], { url: `/api/objects/${ids[3]}/cycle.json` }, cutoff - 1);
await touchFile(DB, ids[3], now);
let deleted = [];
let failR2 = true;
const env = { DB, FILES: { delete: async values => {
  if (failR2) throw new Error('R2 deletion failed');
  deleted.push(...values);
} } };
await assert.rejects(cleanupUnused(env, now), /R2 deletion failed/);
assert.equal(sqlite.prepare("SELECT bytes FROM quotas WHERE id='storage'").get().bytes, 80);
assert.equal((await touchFile(DB, ids[2], now)).results.length, 0, 'Claimed files cannot be revived');
failR2 = false;
assert.equal(await cleanupUnused(env, now), 3);
assert.deepEqual(new Set(deleted), new Set([ids[2], ids[6], ids[7]]));
assert.equal(sqlite.prepare("SELECT bytes FROM quotas WHERE id='storage'").get().bytes, 50);
assert.equal(sqlite.prepare("SELECT bytes FROM quotas WHERE id='upload-month:test'").get().bytes, 80);
assert.equal(await cleanupUnused(env, now), 0, 'Repeat cannot refund twice');
// R2 succeeds but D1 fails: retry still refunds exactly once.
sqlite.prepare('UPDATE files SET last_accessed_at=? WHERE id=?').run(cutoff - 1, ids[0]);
const brokenDB = { prepare: sql => {
  if (sql.startsWith('DELETE FROM files')) throw new Error('D1 unavailable');
  return DB.prepare(sql);
} };
await assert.rejects(cleanupUnused({ ...env, DB: brokenDB }, now), /D1 unavailable/);
assert.equal(sqlite.prepare("SELECT bytes FROM quotas WHERE id='storage'").get().bytes, 50);
assert.equal(await cleanupUnused(env, now), 1);
assert.equal(sqlite.prepare("SELECT bytes FROM quotas WHERE id='storage'").get().bytes, 40);
// Exercise the public read path: lazy dependency discovery and no immutable cache.
env.FILES.get = async () => ({ body: null, text: async () => JSON.stringify({ image: `/api/objects/${ids[1]}/font.ttf` }), writeHttpMetadata: h => h.set('Content-Type','application/json'), httpEtag: 'test' });
const response = await worker.fetch(new Request(`https://example.com/api/objects/${ids[3]}/data.json`), env);
assert.equal(response.status, 200);
assert.equal(response.headers.get('Cache-Control'), 'no-cache');
assert.ok(sqlite.prepare('SELECT last_accessed_at FROM files WHERE id=?').get(ids[1]).last_accessed_at >= now);
assert.equal((await worker.fetch(new Request(`https://example.com/api/objects/${ids[2]}/data.json`), env)).status, 404);
// GitHub Pages uses bearer identity without third-party cookies.
const origin = 'https://rickai.github.io';
const token = 'd'.repeat(64);
const preflight = await worker.fetch(new Request('https://example.com/api/files', { method: 'OPTIONS', headers: { Origin: origin, 'Access-Control-Request-Headers': 'authorization' } }), env);
assert.equal(preflight.status, 204);
assert.equal(preflight.headers.get('Access-Control-Allow-Origin'), origin);
assert.match(preflight.headers.get('Access-Control-Allow-Headers'), /Authorization/);
assert.equal((await worker.fetch(new Request('https://example.com/api/files', { method: 'OPTIONS', headers: { Origin: 'https://evil.example' } }), env)).status, 403);
env.FILES.put = async () => {};
const form = new FormData(); form.set('file', new File(['{}'], 'pages-test.json'));
const uploaded = await worker.fetch(new Request('https://example.com/api/files', { method: 'POST', headers: { Origin: origin, Authorization: `Bearer ${token}` }, body: form }), env);
assert.equal(uploaded.status, 201);
assert.equal(uploaded.headers.get('Access-Control-Allow-Origin'), origin);
const uploadedId = (await uploaded.json()).id;
const list = async bearer => worker.fetch(new Request('https://example.com/api/files', { headers: { Origin: origin, Authorization: `Bearer ${bearer}` } }), env);
assert.ok((await (await list(token)).json()).files.some(file => file.id === uploadedId));
assert.equal((await (await list('e'.repeat(64))).json()).files.length, 0);
const invalid = await list('bad');
assert.equal(invalid.status, 401);
assert.equal(invalid.headers.get('Access-Control-Allow-Origin'), origin);
console.log('Pages CORS, bearer upload, record isolation and readable errors passed');
sqlite.close();
console.log('Retention: grace, cutoff, built-ins, dependencies, cache, failure retries and exact-once refunds passed');
