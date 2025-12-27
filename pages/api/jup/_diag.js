// pages/api/jup/_diag.js
export default async function handler(req, res) {
  try {
    const url = new URL(req.url || '', `https://${req.headers.host}`);
    const qs = url.searchParams.toString();
    const target = `https://quote-api.jup.ag/v6/quote?${qs}`;

    const headRoot = await fetch('https://quote-api.jup.ag', { method: 'HEAD' })
      .then(r => ({ ok: r.ok, status: r.status, server: r.headers.get('server') }))
      .catch(e => ({ error: String(e) }));

    const headQuote = await fetch('https://quote-api.jup.ag/v6/quote', { method: 'HEAD' })
      .then(r => ({ ok: r.ok, status: r.status, server: r.headers.get('server') }))
      .catch(e => ({ error: String(e) }));

    const dns = await fetch('https://dns.google/resolve?name=quote-api.jup.ag&type=A')
      .then(r => r.json()).catch(e => ({ error: String(e) }));

    res.status(200).json({ ok: true, target, headRoot, headQuote, dns, vercelId: req.headers['x-vercel-id'] || '' });
  } catch (e) {
    res.status(502).json({ ok: false, error: String(e) });
  }
}
