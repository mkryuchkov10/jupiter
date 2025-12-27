// pages/api/ultra/order.js
const API_KEY = '12f29858-726d-43d1-bf0c-be5df2afbf54'; // ваш Jupiter API key
const BASE = 'https://api.jup.ag/ultra/v1';

export default async function handler(req, res) {
  try {
    if (!['GET', 'HEAD'].includes(req.method || '')) {
      res.status(405).json({ ok: false, error: 'Use GET' });
      return;
    }

    const u = new URL(req.url || '', `https://${req.headers.host}`);
    const target = `${BASE}/order?${u.searchParams.toString()}`;

    const t0 = Date.now();
    const r = await fetch(target, {
      headers: {
        'x-api-key': API_KEY,
        'accept': 'application/json',
        'user-agent': 'vercel-ultra-proxy/1',
      },
    });
    const txt = await r.text();

    res
      .status(r.status)
      .setHeader('content-type', r.headers.get('content-type') || 'application/json')
      .setHeader('x-debug-target', target)
      .setHeader('x-debug-duration-ms', String(Date.now() - t0))
      .setHeader('x-debug-cf-ray', r.headers.get('cf-ray') || '')
      .setHeader('x-debug-server', r.headers.get('server') || '')
      .send(txt);
  } catch (e) {
    res.status(502).json({ ok: false, error: String(e) });
  }
}
