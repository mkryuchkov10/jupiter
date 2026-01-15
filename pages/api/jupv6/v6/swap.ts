import type { NextApiRequest, NextApiResponse } from 'next'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-api-key')
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
    res.status(200).end()
    return
  }
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }
  try {
    const headers: Record<string, string> = {
      'content-type': 'application/json',
      accept: 'application/json',
    }
    if (process.env.JUP_API_KEY) headers['x-api-key'] = process.env.JUP_API_KEY
    const bodyStr = typeof req.body === 'string' ? req.body : JSON.stringify(req.body || {})
    const r = await fetch('https://api.jup.ag/swap/v1/swap', {
      method: 'POST',
      headers,
      body: bodyStr,
    })
    const text = await r.text()
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.status(r.status).send(text)
  } catch (e: unknown) {
    res.status(500).json({ error: String(e) })
  }
}
