// pages/api/jup.js
const ORIGIN = 'https://quote-api.jup.ag';

function send(r, res, rawText) {
  res
    .status(r.status)
    .setHeader('content-type', r.headers.get('content-type') || 'application/json')
    .send(rawText);
}

async function readBody(req) {
  if (req.body) return typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
  return await new Promise((resolve) => {
    let data = '';
    req.on('data', (c) => (data += c));
    req.on('end', () => resolve(data || '{}'));
  });
}

export default async function handler(req, res) {
  try {
    const url = new URL(req.url || '', `https://${req.headers.host}`);

    // Health
    if (url.pathname === '/api/jup') {
      res.status(200).json({
        ok: true,
        hint: 'use /api/jup/quote (GET) and /api/jup/swap (POST)',
        exampleQuote:
          '/api/jup/quote?inputMint=So11111111111111111111111111111111111111112&outputMint=EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v&amount=100000000&slippageBps=50&swapMode=ExactIn',
      });
      return;
    }

    // GET /api/jup/quote -> ORIGIN /v6/quote
    if (url.pathname === '/api/jup/quote') {
      const target = `${ORIGIN}/v6/quote?${url.searchParams.toString()}`;
      const r = await fetch(target, { method: 'GET' });
      const txt = await r.text();
      return send(r, res, txt);
    }

    // POST /api/jup/swap -> ORIGIN /v6/swap
    if (url.pathname === '/api/jup/swap') {
      if (req.method === 'OPTIONS') { res.status(204).end(); return; }
      if (req.method !== 'POST') { res.status(405).json({ error: 'Use POST' }); return; }
      const body = await readBody(req);
      const r = await fetch(`${ORIGIN}/v6/swap`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body,
      });
      const txt = await r.text();
      return send(r, res, txt);
    }

    res.status(404).json({ ok: false, error: 'Not found' });
  } catch (e) {
    res.status(502).json({ ok: false, error: String(e) });
  }
}
