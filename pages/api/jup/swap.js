const ORIGIN = 'https://quote-api.jup.ag';

async function readBody(req) {
  if (req.body) return typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
  return await new Promise((resolve) => {
    let data = ''; req.on('data', c => data += c); req.on('end', () => resolve(data || '{}'));
  });
}

export default async function handler(req, res) {
  try {
    if (req.method === 'OPTIONS') { res.status(204).end(); return; }
    if (req.method !== 'POST') { res.status(405).json({ ok: false, error: 'Use POST' }); return; }

    const body = await readBody(req);
    const started = Date.now();
    const r = await fetch(`${ORIGIN}/v6/swap`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
    });
    const txt = await r.text();

    res
      .status(r.status)
      .setHeader('content-type', r.headers.get('content-type') || 'application/json')
      .setHeader('x-debug-origin', `${ORIGIN}/v6/swap`)
      .setHeader('x-debug-duration-ms', String(Date.now() - started))
      .send(txt);
  } catch (e) {
    res.status(502).json({ ok: false, error: String(e) });
  }
}
