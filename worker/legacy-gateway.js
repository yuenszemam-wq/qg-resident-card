// Preserves the old browser origin (IndexedDB/localStorage/cookies) at cutover.
// Deploy only after final data verification. No fallback to a stale database.
const TARGET = 'https://qg-resident-card-prod.queenxsgarden.workers.dev';
export async function forward(request, env, fetchImpl = fetch) {
  if (env.GATEWAY_ENABLED !== 'true') return new Response('Gateway not enabled', { status: 503 });
  const original = new URL(request.url);
  const target = new URL(TARGET);
  target.pathname = original.pathname;
  target.search = original.search;
  const headers = new Headers(request.headers);
  // Never forward a client-supplied verification credential.
  headers.delete('x-qg-migration-key');
  if (env.MIGRATION_ACCESS_KEY) headers.set('x-qg-migration-key', env.MIGRATION_ACCESS_KEY);
  const origin = headers.get('origin');
  if (origin === original.origin) headers.set('origin', TARGET);
  else if (origin === TARGET) {
    // A cross-origin caller must not become same-origin through this proxy.
    return new Response('Cross-origin request denied', { status: 403 });
  }
  const upstream = new Request(target, request);
  const response = await fetchImpl(new Request(upstream, { headers, redirect: 'manual' }));
  const out = new Response(response.body, response);
  const location = out.headers.get('location');
  if (location) {
    const redirect = new URL(location, target);
    if (redirect.origin === TARGET) {
      redirect.protocol = original.protocol;
      redirect.host = original.host;
      out.headers.set('location', redirect.href);
    }
  }
  out.headers.set('X-QG-Backend', 'qg-production');
  return out;
}
export default {
  async fetch(request, env) {
    try { return await forward(request, env); }
    catch { return new Response('Service temporarily unavailable; please retry', { status: 502, headers: { 'Cache-Control': 'no-store' } }); }
  },
};
