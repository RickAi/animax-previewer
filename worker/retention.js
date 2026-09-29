const MONTH = 30 * 24 * 60 * 60 * 1000;

// Uploaded JSON is immutable. Keep its cloud dependencies alive even when the
// browser serves their bytes from cache; UNION also terminates reference cycles.
export async function touchFile(db, id, now) {
  return db.prepare(`WITH RECURSIVE used(id) AS (
    SELECT id FROM files WHERE id = ? AND deleting = 0
    UNION SELECT child_id FROM file_dependencies JOIN used ON parent_id = used.id
  ) UPDATE files SET last_accessed_at = MAX(last_accessed_at, ?)
    WHERE id IN (SELECT id FROM used) AND deleting = 0 RETURNING id, protected, content_type`)
    .bind(id, now).all();
}

export async function recordDependencies(db, id, data, now) {
  const ids = [...new Set(Array.from(JSON.stringify(data).matchAll(/\/api\/objects\/([a-f0-9-]{36})\//g), match => match[1]))];
  await db.prepare(`INSERT OR IGNORE INTO file_dependencies (parent_id, child_id)
    SELECT ?, value FROM json_each(?) WHERE EXISTS (SELECT 1 FROM files WHERE id = ? AND deleting = 0)`)
    .bind(id, JSON.stringify(ids), id).run();
  await touchFile(db, id, now);
}

export async function cleanupUnused(env, now) {
  // Claim before deleting: readers cannot revive a file already being removed.
  // 500 per minute on reset day covers the 100,000-object cap with bounded calls.
  const { results } = await env.DB.prepare(`UPDATE files SET deleting = 1 WHERE id IN (
    SELECT id FROM files WHERE protected = 0 AND (deleting = 1 OR last_accessed_at < ?)
    ORDER BY deleting DESC, last_accessed_at, id LIMIT 500
  ) RETURNING id`).bind(now - MONTH).all();
  if (!results.length) return 0;
  const ids = results.map(file => file.id);
  await env.FILES.delete(ids);
  // If either service fails, leave claimed rows for the next tick. R2 delete is
  // idempotent and the SQL trigger refunds capacity only once, on actual deletion.
  await env.DB.prepare('DELETE FROM files WHERE deleting = 1 AND id IN (SELECT value FROM json_each(?))')
    .bind(JSON.stringify(ids)).run();
  console.log('Retention cleanup completed', { deleted: ids.length });
  return ids.length;
}
