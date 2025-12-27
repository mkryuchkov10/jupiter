const ORIGIN = 'https://quote-api.jup.ag';

async function doh(name, type) {
  try {
    const [g, cf] = await Promise.all([
      fetch(`https://dns.google/resolve?name=${name}&type=${type}`).then(r => r.json()),
      fetch(`https://cloudflare-dns.com/dns-query?name=${name}&type=${type}`, {
        headers: { 'accept': 'application/dns-json' }
      }).then(r => r.json()),
    ]);
    return { google: g, cloudflare: cf };
  } catch (e) {
    return { error: String(e) };
  }
}

export default async function handler(req, res) {
  try {
    const url = new URL(req.url || '', `https://${req.headers.host}`);
    const qs = url.searchParams.toString();
    const target = `${ORIGIN}/v6/quote?${qs}`;
    const started = Date.now();

    let headRoot, headOk, quoteRes;
    try {
      // проверка TLS/доступности корня
      headRoot = await fetch('https://quote-api.jup.ag', { method: 'HEAD' })
        .then(r => ({ ok: r.ok, status: r.status, server: r.headers.get('server') }))
        .catch(e => ({ error: String(e) }));
      // «пустой» HEAD к эндпойнту (ожидаем не обязательно 200, важен сам коннект)
      headOk = await fetch(`${ORIGIN}/v6/quote`, { method: 'HEAD' })
        .then(r => ({ ok: r.ok, status: r.status, server: r.headers.get('server') }))
        .catch(e => ({ error: String(e) }));
      // реальный GET к quote
      quoteRes = await fetch(target, { method: 'GET', headers: { 'accept': 'application/json' } })
        .then(async r => ({
          ok: r.ok,
          status: r.status,
          cfRay: r.headers.get('cf-ray'),
          server: r.headers.get('server'),
          contentType: r.headers.get('content-type'),
          bodyPreview: (await r.text()).slice(0, 1500),
        }))
        .catch(e => ({ ok: false, error: String(e) }));
    } catch (e) {
      quoteRes = { ok: false, error: String(e) };
    }

    const dnsA = await doh('quote-api.jup.ag', 1);
    const dnsAAAA = await doh('quote-api.jup.ag', 28);

    res.status(200).json({
      ok: true,
      vercelId: req.headers['x-vercel-id'] || '',
      durationMs: Date.now() - started,
      target,
      dns: { A: dnsA, AAAA: dnsAAAA },
      headRoot, headOk, quoteRes,
      hint: 'Проверьте status/ok, cfRay, server, bodyPreview; ошибки сети будут в error',
    });
  } catch (e) {
    res.status(502).json({ ok: false, error: String(e) });
  }
}
