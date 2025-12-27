const ORIGIN = 'https://quote-api.jup.ag';

async function doh(name, type, url, headers) {
  try {
    const r = await fetch(url, { headers, cache: 'no-store' });
    const status = r.status;
    const txt = await r.text();
    let json;
    try { json = JSON.parse(txt); } catch { json = { raw: txt.slice(0, 1000) }; }
    const ips = (json?.Answer || []).filter(a => a?.type === 1 && typeof a?.data === 'string').map(a => a.data);
    return { ok: true, status, url, ips, jsonShort: { Status: json?.Status, AD: json?.AD, AnswerLen: (json?.Answer || []).length } };
  } catch (e) {
    return { ok: false, url, error: String(e) };
  }
}

export default async function handler(req, res) {
  try {
    const url = new URL(req.url || '', `https://${req.headers.host}`);
    const qs = url.searchParams.toString();
    const target = `${ORIGIN}/v6/quote?${qs}`;

    const [headRoot, headQuote] = await Promise.all([
      fetch(ORIGIN, { method: 'HEAD' }).then(r => ({ ok: r.ok, status: r.status, server: r.headers.get('server') })).catch(e => ({ error: String(e) })),
      fetch(`${ORIGIN}/v6/quote`, { method: 'HEAD' }).then(r => ({ ok: r.ok, status: r.status, server: r.headers.get('server') })).catch(e => ({ error: String(e) })),
    ]);

    const dns = await Promise.all([
      doh('quote-api.jup.ag', 1, 'https://dns.google/resolve?name=quote-api.jup.ag&type=A', {}),
      doh('quote-api.jup.ag', 1, 'https://cloudflare-dns.com/dns-query?name=quote-api.jup.ag&type=A', { accept: 'application/dns-json' }),
      doh('quote-api.jup.ag', 1, 'https://dns.quad9.net/dns-query?name=quote-api.jup.ag&type=A', { accept: 'application/dns-json' }),
      doh('quote-api.jup.ag', 1, 'https://doh.opendns.com/dns-query?name=quote-api.jup.ag&type=A', { accept: 'application/dns-json' }),
    ]);

    const trace = await fetch('https://quote-api.jup.ag/cdn-cgi/trace').then(r => r.text()).catch(e => String(e)).then(t => String(t).slice(0, 2000));

    res.status(200).json({
      ok: true,
      vercelId: req.headers['x-vercel-id'] || '',
      target,
      headRoot, headQuote,
      dns,
      tracePreview: trace,
    });
  } catch (e) {
    res.status(502).json({ ok: false, error: String(e) });
  }
}
