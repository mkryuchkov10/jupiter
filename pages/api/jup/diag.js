// pages/api/jup/_diag.js
const ORIGIN = 'https://quote-api.jup.ag';

async function doh(url, headers = {}) {
  try {
    const r = await fetch(url, { headers, cache: 'no-store' });
    const status = r.status;
    const txt = await r.text();
    let j; try { j = JSON.parse(txt); } catch { j = { raw: txt.slice(0, 1000) }; }
    const answers = Array.isArray(j?.Answer) ? j.Answer : [];
    const a = answers.filter(x => x?.type === 1).map(x => x.data);
    const aaaa = answers.filter(x => x?.type === 28).map(x => x.data);
    const cname = answers.filter(x => x?.type === 5).map(x => x.data);
    return { ok: true, status, url, a, aaaa, cname, short: { Status: j?.Status, AD: j?.AD, AnswerLen: answers.length } };
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

    // DoH: A, AAAA, CNAME + последующее разрешение CNAME
    const base = 'quote-api.jup.ag';
    const dns = await Promise.all([
      doh(`https://dns.google/resolve?name=${base}&type=A`),
      doh(`https://cloudflare-dns.com/dns-query?name=${base}&type=A`, { accept: 'application/dns-json' }),
      doh(`https://dns.google/resolve?name=${base}&type=AAAA`),
      doh(`https://cloudflare-dns.com/dns-query?name=${base}&type=AAAA`, { accept: 'application/dns-json' }),
      doh(`https://dns.google/resolve?name=${base}&type=CNAME`),
      doh(`https://cloudflare-dns.com/dns-query?name=${base}&type=CNAME`, { accept: 'application/dns-json' }),
    ]);

    const cnames = Array.from(new Set(dns.flatMap(d => d.cname || [])));
    const cnameResolutions = [];
    for (const c of cnames) {
      cnameResolutions.push(
        await doh(`https://dns.google/resolve?name=${c}&type=A`),
        await doh(`https://cloudflare-dns.com/dns-query?name=${c}&type=A`, { accept: 'application/dns-json' }),
        await doh(`https://dns.google/resolve?name=${c}&type=AAAA`),
        await doh(`https://cloudflare-dns.com/dns-query?name=${c}&type=AAAA`, { accept: 'application/dns-json' }),
      );
    }

    const trace = await fetch(`${ORIGIN}/cdn-cgi/trace`).then(r => r.text()).catch(e => String(e)).then(t => String(t).slice(0, 2000));

    res.status(200).json({
      ok: true,
      vercelId: req.headers['x-vercel-id'] || '',
      target,
      headRoot, headQuote,
      dns, cnames, cnameResolutions,
      tracePreview: trace,
    });
  } catch (e) {
    res.status(502).json({ ok: false, error: String(e) });
  }
}
