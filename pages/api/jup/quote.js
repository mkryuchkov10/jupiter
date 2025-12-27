import https from 'node:https';

const ORIGIN_HOST = 'quote-api.jup.ag';
const ORIGIN = `https://${ORIGIN_HOST}`;

function send(res, status, body, meta = {}, extraHeaders = {}) {
  const headers = { 'content-type': 'application/json', ...extraHeaders };
  for (const [k, v] of Object.entries(meta)) headers[`x-debug-${k}`] = String(v ?? '');
  res.writeHead(status, headers); res.end(body);
}

async function dohAAll() {
  const tries = [
    ['google', 'https://dns.google/resolve?name=quote-api.jup.ag&type=A', {}],
    ['cloudflare', 'https://cloudflare-dns.com/dns-query?name=quote-api.jup.ag&type=A', { accept: 'application/dns-json' }],
    ['quad9', 'https://dns.quad9.net/dns-query?name=quote-api.jup.ag&type=A', { accept: 'application/dns-json' }],
    ['opendns', 'https://doh.opendns.com/dns-query?name=quote-api.jup.ag&type=A', { accept: 'application/dns-json' }],
  ];
  const results = [];
  for (const [name, url, headers] of tries) {
    try {
      const r = await fetch(url, { headers, cache: 'no-store' });
      const status = r.status;
      const txt = await r.text();
      let j; try { j = JSON.parse(txt); } catch { j = { raw: txt.slice(0, 600) }; }
      const ips = (j?.Answer || []).filter(a => a?.type === 1 && typeof a?.data === 'string').map(a => a.data);
      results.push({ source: name, status, ips, short: { Status: j?.Status, AD: j?.AD, AnswerLen: (j?.Answer || []).length } });
    } catch (e) {
      results.push({ source: name, error: String(e) });
    }
  }
  const ips = results.flatMap(r => r.ips || []);
  return { ips: Array.from(new Set(ips)), results };
}

function httpsGetByIp(ip, path) {
  return new Promise((resolve, reject) => {
    const req = https.request({
      protocol: 'https:', hostname: ip, servername: ORIGIN_HOST, port: 443, method: 'GET', path,
      headers: { Host: ORIGIN_HOST, Accept: 'application/json', 'User-Agent': 'vercel-jup-proxy/1' },
    }, (res) => {
      let data = ''; res.on('data', c => data += c); res.on('end', () => resolve({ status: res.statusCode || 502, headers: res.headers, body: data }));
    });
    req.on('error', reject); req.end();
  });
}

export default async function handler(req, res) {
  try {
    if (!['GET', 'HEAD'].includes(req.method || '')) return send(res, 405, JSON.stringify({ ok: false, error: 'Use GET' }));

    const url = new URL(req.url || '', `https://${req.headers.host}`);
    const path = `/v6/quote?${url.searchParams.toString()}`;
    const target = `${ORIGIN}${path}`;
    const started = Date.now();

    // primary
    try {
      const r = await fetch(target, { method: 'GET', headers: { accept: 'application/json' }, cache: 'no-store' });
      const txt = await r.text();
      return send(res, r.status, txt, { phase: 'primary', duration_ms: Date.now() - started, target }, { 'cf-ray': r.headers.get('cf-ray') || '', server: r.headers.get('server') || '' });
    } catch (e) {
      const cause = e?.cause || {};
      if (!String(cause?.code).includes('ENOTFOUND') && !String(cause?.code).includes('EAI_AGAIN')) {
        return send(res, 502, JSON.stringify({ ok: false, error: String(e), cause }), { phase: 'primary_fail', target, duration_ms: Date.now() - started });
      }
    }

    // DoH → IP+SNI
    const doh = await dohAAll();
    if (!doh.ips.length) return send(res, 502, JSON.stringify({ ok: false, error: 'DoH returned no A records', target, doh }), { phase: 'doh_empty', duration_ms: Date.now() - started });

    let lastErr = '';
    for (const ip of doh.ips) {
      try {
        const r = await httpsGetByIp(ip, path);
        return send(res, r.status, r.body, { phase: 'fallback_ip', ip, target, duration_ms: Date.now() - started }, { server: r.headers['server'] || '', 'content-type': r.headers['content-type'] || 'application/json' });
      } catch (e) { lastErr = String(e); }
    }
    return send(res, 502, JSON.stringify({ ok: false, error: 'All IP attempts failed', lastErr, ips: doh.ips, target, doh }), { phase: 'fallback_ip_fail', duration_ms: Date.now() - started });
  } catch (e) {
    return send(res, 502, JSON.stringify({ ok: false, error: String(e) }), { phase: 'handler_catch' });
  }
}
