import type { NextApiRequest, NextApiResponse } from 'next'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-api-key')
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
    res.status(200).end()
    return
  }
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }
  try {
    const q = new URLSearchParams(req.query as Record<string, string>)
    // Ensure platform is set
    if (!q.has('platform')) q.set('platform', 'SOLANA')

    // Handle USDC mint aliases (UI mint vs canonical)
    const reqOut = q.get('outputMint')
    const usdc_canonical = 'EPjFWdd5AufqSSqeMqXw7A9FQ8cHkY3n6w4pZ7CkXNj'
    const usdc_ui = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'
    const outMintsToTry: string[] = []
    if (reqOut) outMintsToTry.push(reqOut)
    if (reqOut !== usdc_canonical) outMintsToTry.push(usdc_canonical)
    if (reqOut !== usdc_ui && reqOut !== usdc_canonical) outMintsToTry.push(usdc_ui)

    const endpoints = [
      'https://api.jup.ag/swap/v1/quote',
      'https://quote-api.jup.ag/v6/quote',
    ]

    const headers: Record<string, string> = { accept: 'application/json' }
    if (process.env.JUP_API_KEY) headers['x-api-key'] = process.env.JUP_API_KEY

    let lastStatus = 500
    let lastBody = '{"error":"quote failed"}'
    for (const outMint of outMintsToTry) {
      q.set('outputMint', outMint)
      const qs = q.toString()
      for (const ep of endpoints) {
        const url = `${ep}?${qs}`
        const r = await fetch(url, { headers })
        const body = await r.text()
        lastStatus = r.status
        lastBody = body
        if (r.ok) {
          res.setHeader('Access-Control-Allow-Origin', '*')
          res.status(r.status).send(body)
          return
        }
      }
    }
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.status(lastStatus).send(lastBody)
  } catch (e: unknown) {
    res.status(500).json({ error: String(e) })
  }
}
