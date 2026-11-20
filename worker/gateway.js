// qg-resident-card.yuenszemam.workers.dev：轉送入口
// 宣傳製作中心已併入 QG 異世界居民報更系統（https://qg-shift-system.queenxsgarden.workers.dev/card/）。
// 舊網址保持公開，並以「同一網址轉送」方式運作，居民瀏覽器內的製作記錄（IndexedDB／localStorage）不會遺失。
// - 製作器頁面、圖片、公開 API、/media：轉送到新系統 /card/*（只接受 GET／HEAD，不轉送 Cookie）
// - 管理中心：轉到新系統的 /card/admin/（以報更系統 Google 管理員登入）
export const TARGET = 'https://qg-shift-system.queenxsgarden.workers.dev';
const PREFIX = '/card';

export function targetPath(pathname) {
  if (pathname === PREFIX || pathname.startsWith(PREFIX + '/')) return pathname;
  return PREFIX + (pathname.startsWith('/') ? pathname : '/' + pathname);
}

export async function forward(request, fetchImpl = fetch) {
  const url = new URL(request.url);
  const path = targetPath(url.pathname);
  // 管理中心需要新系統的 Google 登入：直接轉到新網址
  if (path === PREFIX + '/admin' || path.startsWith(PREFIX + '/admin/')) {
    return Response.redirect(TARGET + PREFIX + '/admin/', 302);
  }
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return new Response(JSON.stringify({ error: 'moved', message: '宣傳製作中心已搬到新網址，請使用 ' + TARGET + PREFIX + '/' }), {
      status: 405, headers: { 'Content-Type': 'application/json; charset=utf-8', Allow: 'GET, HEAD' },
    });
  }
  const headers = new Headers();
  for (const h of ['accept', 'accept-language', 'if-none-match', 'if-modified-since', 'user-agent']) {
    const v = request.headers.get(h);
    if (v) headers.set(h, v);
  }
  const upstream = await fetchImpl(new Request(TARGET + path + url.search, { method: request.method, headers, redirect: 'manual' }));
  const out = new Response(upstream.body, upstream);
  out.headers.delete('set-cookie');
  const location = out.headers.get('location');
  if (location) {
    // 新系統內的轉址（例如 /card/admin → /card/admin/）：保持在舊網址
    const loc = new URL(location, TARGET);
    if (loc.origin === TARGET && !loc.pathname.startsWith(PREFIX + '/admin')) out.headers.set('location', loc.pathname + loc.search);
  }
  out.headers.set('X-QG-Backend', 'qg-shift-system');
  return out;
}

export default {
  async fetch(request) {
    try {
      return await forward(request);
    } catch {
      return new Response('暫時未能連接宣傳製作中心，請稍後再試', { status: 502, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' } });
    }
  },
};
