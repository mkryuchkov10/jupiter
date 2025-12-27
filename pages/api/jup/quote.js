// pages/api/jup/quote.js
import https from 'node:https';
import net from 'node:net';

const ORIGIN_HOST = 'quote-api.jup.ag';
const ORIGIN = `https://${ORIGIN_HOST}`;

function send(res, status, body, meta = {}, extraHeaders = {}) {
  const headers = { 'content-type': 'application/json', ...extraHeaders };
  for (const [k, v] of Object.entries(meta)) headers[`x-debug-${k}`] = String(v ?? '');
  res.writeHead(status, headers);
  res.end(body);
}

async function doh(url, headers = {}) {
  try {
    const r = await fetch(url, { headers, cache: 'no-store' });
    const status = r.status;
    const txt = await r.text();
    let j; try { j = JSON.parse(txt); } catch { j = { raw: txt.slice(0, 600) }; }
    const ans = Array.isArray(j?.Answer) ? j.Answer : [];
    const a = ans.filter(x => x?.type === 1).map(x => x.data);
    const aaaa = ans.filter(x => x?.type === 28).map(x => x.data);
    const cname = ans.filter(x => x?.type === 5).map(x => x.data);
    return { status, a, aaaa, cname, short: { Status: j?.Status, AD: j?.AD, AnswerLen: ans.length } };
  } catch (e) {
    return { error: String(e) };
  }
}

async function resolveTargets() {
  const base = 'quote-api.jup.ag';
  const tries = [
    ['google-A', `https://dns.google/resolve?name=${base}&type=A`, {}],
    ['cf-A', `https://cloudflare-dns.com/dns-query?name=${base}&type=A`, { accept: 'application/dns-json' }],
    ['google-AAAA', `https://dns.google/resolve?name=${base}&type=AAAA`, {}],
    ['cf-AAAA', `https://cloudflare-dns.com/dns-query?name=${base}&type=AAAA`, { accept: 'application/dns-json' }],
    ['google-CNAME', `https://dns.google/resolve?name=${base}&type=CNAME`, {}],
    ['cf-CNAME', `https://cloudflare-dns.com/dns-query?name=${base}&type=CNAME`, { accept: 'application/dns-json' }],
  ];
  const details = [];
  let ips = new Set();
  let cnames = new Set();

  for (const [name, url, hdrs] of tries) {
    const r = await doh(url, hdrs);
    details.push([name, r]);
    (r.a || []).forEach(x => ips.add(x));
    (r.aaaa || []).forEach(x => ips.add(x));
    (r.cname || []).forEach(x => cnames.add(x));
  }

  for (const c of cnames) {
    const sub = [
      ['google-A', `https://dns.google/resolve?name=${c}&type=A`, {}],
      ['cf-A', `https://cloudflare-dns.com/dns-query?name=${c}&type=A`, { accept: 'application/dns-json' }],
      ['google-AAAA', `https://dns.google/resolve?name=${c}&type=AAAA`, {}],
      ['cf-AAAA', `https://cloudflare-dns.com/dns-query?name=${c}&type=AAAA`, { accept: 'application/dns-json' }],
    ];
    for (const [name, url, hdrs] of sub) {
      const r = await doh(url, hdrs);
      details.push([`CNAME:${c}:${name}`, r]);
      (r.a || []).forEach(x => ips.add(x));
      (r.aaaa || []).forEach(x => ips.add(x));
    }
  }

  return { ips: Array.from(ips), cnames: Array.from(cnames), details };
}

function httpsGetByIp(ip, path) {
  return new Promise((resolve, reject) => {
    const isV6 = net.isIP(ip) === 6;
    const req = https.request(
      {
        protocol: 'https:',
        hostname: ip,
        family: isV6 ? 6 : 4,
        port: 443,
        method: 'GET',
        path,
        headers: {
          Host: ORIGIN_HOST, // HTTP Host
          Accept: 'application/json',
          'User-Agent': 'vercel-jup-proxy/1',
        },
        servername: ORIGIN_HOST, // TLS SNI
        timeout: 10000,
      },
      (res) => {
        let data = '';
        res.on('data', c => data += c);
        res.on('end', () => resolve({ status: res.statusCode || 502, headers: res.headers, body: data }));
      }
    );
    req.on('timeout', () => { req.destroy(new Error('timeout')); });
    req.on('error', reject);
    req.end();
  });
}

export default async function handler(req, res) {
  try {
    if (!['GET', 'HEAD'].includes(req.method || '')) {
      return send(res, 405, JSON.stringify({ ok: false, error: 'Use GET' }));
    }

    const url = new URL(req.url || '', `https://${req.headers.host}`);
    const path = `/v6/quote?${url.searchParams.toString()}`;
    const target = `${ORIGIN}${path}`;
    const started = Date.now();

    // 1) Обычный путь
    try {
      const r = await fetch(target, { method: 'GET', headers: { accept: 'application/json' }, cache: 'no-store' });
      const txt = await r.text();
      return send(res, r.status, txt, { phase: 'primary', duration_ms: Date.now() - started, target }, { 'cf-ray': r.headers.get('cf-ray') || '', server: r.headers.get('server') || '' });
    } catch (e) {
      const cause = e?.cause || {};
      const code = String(cause?.code || e?.code || '');
      if (!code.includes('ENOTFOUND') && !code.includes('EAI_AGAIN')) {
        return send(res, 502, JSON.stringify({ ok: false, error: String(e), cause }), { phase: 'primary_fail', target, duration_ms: Date.now() - started });
      }
    }

    // 2) DoH → A/AAAA и CNAME→A/AAAA → IP+SNI
    const rslv = await resolveTargets();
    if (!rslv.ips.length) {
      return send(res, 502, JSON.stringify({ ok: false, error: 'No A/AAAA via DoH', target, rslv }), { phase: 'doh_empty', duration_ms: Date.now() - started });
    }

    let lastErr = '';
    for (const ip of rslv.ips) {
      try {
        const r = await httpsGetByIp(ip, path);
        return send(
          res,
          r.status,
          r.body,
          { phase: 'fallback_ip', ip, ips_tried: rslv.ips.length, cnames: rslv.cnames.join(','), duration_ms: Date.now() - started, target },
          { server: r.headers['server'] || '', 'content-type': r.headers['content-type'] || 'application/json' }
        );
      } catch (e) { lastErr = String(e); }
    }

    return send(res, 502, JSON.stringify({ ok: false, error: 'All IP attempts failed', lastErr, target, rslv }), { phase: 'fallback_ip_fail', duration_ms: Date.now() - started });
  } catch (e) {
    return send(res, 502, JSON.stringify({ ok: false, error: String(e) }), { phase: 'handler_catch' });
  }
}
