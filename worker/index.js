const MAX_FILE = 25 * 1024 * 1024;
const TYPES = { json: 'application/json', zip: 'application/zip', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', avif: 'image/avif', mp4: 'video/mp4', mov: 'video/quicktime', m4v: 'video/mp4', webm: 'video/webm', ttf: 'font/ttf', otf: 'font/otf', woff: 'font/woff', woff2: 'font/woff2' };
const json = (data, status = 200, headers = {}) => Response.json(data, { status, headers: { 'Cache-Control': 'no-store', ...headers } });
const fail = (message, status) => { throw Object.assign(new Error(message), { status }); };
const hash = async (value) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))), b => b.toString(16).padStart(2, '0')).join('');
const getSession = request => request.headers.get('Cookie')?.match(/(?:^|;\s*)animax_session=([a-f0-9]{64})(?:;|$)/)?.[1];

export function validateFile(file) {
  if (!(file instanceof File) || !file.size) fail('请选择非空文件', 400);
  if (file.size > MAX_FILE) fail('单文件不能超过 25 MB', 413);
  if (file.name.length > 240 || /[\x00-\x1f/\\]/.test(file.name)) fail('文件名无效', 400);
  const type = TYPES[file.name.split('.').pop().toLowerCase()];
  if (!type) fail('不支持的文件类型', 415);
  return type;
}

async function boundedForm(request) {
  if (!request.headers.get('Content-Type')?.startsWith('multipart/form-data;')) fail('需要文件表单', 415);
  const limit = MAX_FILE + 1024 * 1024;
  if (Number(request.headers.get('Content-Length')) > limit) fail('文件过大', 413);
  const reader = request.body?.getReader();
  if (!reader) fail('缺少文件', 400);
  const chunks = []; let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > limit) { await reader.cancel(); fail('文件过大', 413); }
    chunks.push(value);
  }
  try { return await new Response(new Blob(chunks), { headers: request.headers }).formData(); }
  catch { fail('文件表单无效', 400); }
}

async function reserve(db, key, size, maxBytes, maxCount) {
  const result = await db.prepare(`INSERT INTO quotas (id, bytes, count) VALUES (?, ?, 1)
    ON CONFLICT(id) DO UPDATE SET bytes = bytes + excluded.bytes, count = count + 1
    WHERE bytes + excluded.bytes <= ? AND count < ? RETURNING id`).bind(key, size, maxBytes, maxCount).first();
  if (!result) fail('免费使用额度已达到站点上限，请稍后再试或联系管理员', 429);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;
    if (!path.startsWith('/api/')) return env.ASSETS.fetch(request);
    try {
      if (path === '/api/session' && request.method === 'GET') {
        const session = getSession(request) || Array.from(crypto.getRandomValues(new Uint8Array(32)), b => b.toString(16).padStart(2, '0')).join('');
        return json({ ready: Boolean(env.DB && env.FILES) }, 200, {
          'Set-Cookie': `animax_session=${session}; Path=/; HttpOnly; SameSite=Strict; Max-Age=31536000${url.protocol === 'https:' ? '; Secure' : ''}`,
        });
      }
      if (!env.DB || !env.FILES) return json({ error: '云端存储尚未配置' }, 503);
      const objectMatch = path.match(/^\/api\/objects\/([0-9a-f-]{36})\/[^/]+$/);
      if (objectMatch && ['GET', 'HEAD'].includes(request.method)) {
        await reserve(env.DB, `reads:${new Date().toISOString().slice(0, 7)}`, 0, 0, 1000000);
        const object = await env.FILES.get(objectMatch[1]);
        if (!object) return json({ error: '文件不存在' }, 404);
        const headers = new Headers(); object.writeHttpMetadata(headers);
        headers.set('ETag', object.httpEtag);
        headers.set('Cache-Control', 'public, max-age=31536000, immutable');
        headers.set('X-Content-Type-Options', 'nosniff');
        headers.set('Content-Security-Policy', "default-src 'none'; sandbox");
        headers.set('Access-Control-Allow-Origin', '*');
        return new Response(request.method === 'HEAD' ? null : object.body, { headers });
      }
      const session = getSession(request);
      if (!session) return json({ error: '请刷新页面后重试' }, 401);
      const owner = await hash(session);
      if (path === '/api/files' && request.method === 'GET') {
        const { results } = await env.DB.prepare("SELECT id, name AS fileName, created_at AS createdAt FROM files WHERE owner = ? AND hidden = 0 AND content_type = 'application/json' ORDER BY created_at DESC LIMIT 100").bind(owner).all();
        return json({ files: results.map(file => ({ ...file, url: `${url.origin}/api/objects/${file.id}/${encodeURIComponent(file.fileName)}` })) });
      }
      if (request.headers.get('Origin') !== url.origin) return json({ error: '不允许跨站写入' }, 403);
      const hideMatch = path.match(/^\/api\/files\/([0-9a-f-]{36})\/hide$/);
      if (hideMatch && request.method === 'POST') {
        await env.DB.prepare('UPDATE files SET hidden = 1 WHERE id = ? AND owner = ?').bind(hideMatch[1], owner).run();
        return json({ ok: true });
      }
      if (path !== '/api/files' || request.method !== 'POST') return json({ error: '接口不存在' }, 404);
      const form = await boundedForm(request);
      const file = form.get('file');
      const type = validateFile(file);
      if (type === 'application/json') {
        try { JSON.parse(await file.text()); } catch { return json({ error: 'JSON 格式无效' }, 400); }
      }
      const day = new Date().toISOString().slice(0, 10);
      const ip = await hash(`${day}:${request.headers.get('CF-Connecting-IP') || 'local'}`);
      await reserve(env.DB, `day:${day}:${ip}`, file.size, 200 * 1024 * 1024, 1000);
      // ponytail: a conservative lifetime 8 GiB ceiling; add garbage collection before raising it.
      await reserve(env.DB, 'storage', file.size, 8 * 1024 ** 3, 100000);
      const id = crypto.randomUUID();
      await env.FILES.put(id, file.stream(), { httpMetadata: { contentType: type } });
      try {
        await env.DB.prepare('INSERT INTO files (id, owner, name, size, content_type, created_at) VALUES (?, ?, ?, ?, ?, ?)').bind(id, owner, file.name, file.size, type, Date.now()).run();
      } catch (error) {
        await env.FILES.delete(id);
        throw error;
      }
      return json({ id, url: `${url.origin}/api/objects/${id}/${encodeURIComponent(file.name)}` }, 201);
    } catch (error) {
      if (error.status) return json({ error: error.message }, error.status);
      console.error('Storage operation failed', error.message);
      return json({ error: '存储服务暂时不可用，请稍后重试' }, 500);
    }
  },
};
