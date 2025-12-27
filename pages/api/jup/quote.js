// pages/api/jup/quote.js
import https from 'node:https';

const ORIGIN_HOST = 'quote-api.jup.ag';
const ORIGIN = `https://${ORIGIN_HOST}`;

function sendWithDebug(res, status, body, extra = {}, hdrs = {}) {
  const h = { 'content-type': 'application/json', ...hdrs };
  Object.entries(extra).forEach(([k, v]) => h[`x-debug-${k}`] = String(v ?? ''));
  res.writeHead(status, h);
  res.end(body);
}

async function dohA(name) {
  const eps = [
    `https://dns.google/resolve?name=${name}&type=A`,
    `https://cloudflare-dns.com/dns-query?name=${name}&type=A`,
    `https://1.1.1.1/dns-query?name=${name}&type=A`,
  ];
  for (const url of eps) {
    try {
      const r = await fetch(url, { headers: { accept: 'application/dns-json' } });
      const j = await r.json();
      const ans = Array.isArray(j?.Answer) ? j.Answer : [];
      const ips = ans.filter(a => a?.type === 1 && typeof a?.data === 'string').map(a => a.data);
      if (ips.length) return { ips, src: url };
    } catch { /* try next */ }
  }
  return { ips: [], src: 'none' };
}

function httpsGetByIp(ip, path) {
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        protocol: 'https:',
        hostname: ip,
        port: 443,
        method: 'GET',
        path,
        headers: {
          Host: ORIGIN_HOST,
          Accept: 'application/json',
          'User-Agent': 'vercel-jup-proxy/1'
        },
        servername: ORIGIN_HOST, // важное: SNI
      },
      (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => resolve({ status: res.statusCode || 502, headers: res.headers, body: data }));
      }
    );
    req.on('error', reject);
    req.end();
  });
}

export default async function handler(req, res) {
  try {
    if (!['GET', 'HEAD'].includes(req.method || '')) {
      sendWithDebug(res, 405, JSON.stringify({ ok: false, error: 'Use GET' }));
      return;
    }

    const url = new URL(req.url || '', `https://${req.headers.host}`);
    const targetPath = `/v6/quote?${url.searchParams.toString()}`;
    const target = `${ORIGIN}${targetPath}`;
    const started = Date.now();

    // 1) Прямой запрос (нормальный путь)
    try {
      const r = await fetch(target, { method: 'GET', headers: { accept: 'application/json' }, cache: 'no-store' });
      const txt = await r.text();
      sendWithDebug(
        res,
        r.status,
        txt,
        { phase: 'primary', duration_ms: Date.now() - started, target },
        { 'cf-ray': r.headers.get('cf-ray') || '', server: r.headers.get('server') || '' }
      );
      return;
    } catch (e) {
      // если не DNS — отдаём сразу
      const name = e?.name;
      const code = e?.cause?.code || e?.code;
      if (!String(code).includes('ENOTFOUND') && !String(code).includes('EAI_AGAIN')) {
        sendWithDebug(
          res,
          502,
          JSON.stringify({ ok: false, error: String(e), name, target, durationMs: Date.now() - started }),
          { phase: 'primary_fail' }
        );
        return;
      }
    }

    // 2) Резерв: DoH -> IP -> HTTPS с SNI
    const { ips, src } = await dohA(ORIGIN_HOST);
    if (!ips.length) {
      sendWithDebug(
        res,
        502,
        JSON.stringify({ ok: false, error: 'DoH returned no A records', target, dohSrc: src }),
        { phase: 'fallback_doh_empty', duration_ms: Date.now() - started }
      );
      return;
    }

    let last;
    for (const ip of ips) {
      try {
        const r = await httpsGetByIp(ip, targetPath);
        sendWithDebug(
          res,
          r.status,
          r.body,
          { phase: 'fallback_ip', ip, dohSrc: src, duration_ms: Date.now() - started, target },
          { 'cf-ray': r.headers['cf-ray'] || '', server: r.headers['server'] || '', 'content-type': r.headers['content-type'] || 'application/json' }
        );
        return;
      } catch (e) {
        last = String(e);
      }
    }

    sendWithDebug(
      res,
      502,
      JSON.stringify({ ok: false, error: 'All IP attempts failed', lastError: last, ips, target, dohSrc: src }),
      { phase: 'fallback_ip_fail', duration_ms: Date.now() - started }
    );
  } catch (e) {
    sendWithDebug(res, 502, JSON.stringify({ ok: false, error: String(e) }), { phase: 'handler_catch' });
  }
}
