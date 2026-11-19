// HTTP helpers: JSON responses with safe headers and generic error bodies.

export class HttpError extends Error {
  constructor(status, code, message) {
    super(message || code);
    this.status = status;
    this.code = code;
  }
}

const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'same-origin',
};

export function json(data, status = 200, extra = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...SECURITY_HEADERS, ...extra },
  });
}

export function errorResponse(err) {
  if (err instanceof HttpError) return json({ error: err.code, message: err.message }, err.status);
  // Never echo internal errors (they may contain bindings or upstream bodies).
  console.error('internal_error', err && err.name);
  return json({ error: 'internal_error', message: '伺服器暫時出現問題，請稍後再試' }, 500);
}

export async function readJson(request, limit = 256 * 1024) {
  const type = request.headers.get('content-type') || '';
  if (!type.includes('application/json')) throw new HttpError(415, 'unsupported_media_type', '需要 JSON');
  const text = await request.text();
  if (text.length > limit) throw new HttpError(413, 'too_large', '資料太大');
  try { return JSON.parse(text); } catch { throw new HttpError(400, 'bad_json', 'JSON 格式錯誤'); }
}

export async function readBytes(request, limit) {
  const len = Number(request.headers.get('content-length') || 0);
  if (len > limit) throw new HttpError(413, 'too_large', '檔案太大');
  const buf = new Uint8Array(await request.arrayBuffer());
  if (buf.length > limit) throw new HttpError(413, 'too_large', '檔案太大');
  if (!buf.length) throw new HttpError(400, 'empty', '沒有檔案內容');
  return buf;
}

export function clientIp(request) {
  return request.headers.get('cf-connecting-ip') || 'local';
}
