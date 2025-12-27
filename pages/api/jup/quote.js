const ORIGIN = 'https://quote-api.jup.ag';

export default async function handler(req, res) {
  try {
    if (!['GET', 'HEAD'].includes(req.method || '')) {
      res.status(405).json({ ok: false, error: 'Use GET' }); return;
    }

    const url = new URL(req.url || '', `https://${req.headers.host}`);
    const target = `${ORIGIN}/v6/quote?${url.searchParams.toString()}`;
    const started = Date.now();

    let r, txt;
    try {
      r = await fetch(target, {
        method: 'GET',
        headers: { 'accept': 'application/json', 'user-agent': 'vercel-jup-proxy/1' },
        cache: 'no-store',
      });
      txt = await r.text();
    } catch (e) {
      const cause = e?.cause || {};
      res.status(502).json({
        ok: false,
        error: String(e),
        name: e?.name,
        target,
        durationMs: Date.now() - started,
        cause: {
          code: cause?.code, errno: cause?.errno,
          syscall: cause?.syscall, hostname: cause?.hostname
        }
      });
      return;
    }

    res
      .status(r.status)
      .setHeader('content-type', r.headers.get('content-type') || 'application/json')
      .setHeader('x-debug-target', target)
      .setHeader('x-debug-vercel-id', req.headers['x-vercel-id'] || '')
      .setHeader('x-debug-duration-ms', String(Date.now() - started))
      .send(txt);
  } catch (e) {
    res.status(502).json({ ok: false, error: String(e) });
  }
}
