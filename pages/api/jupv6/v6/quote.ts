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
    const params = new URLSearchParams(req.query as Record<string, string>).toString()
    const url = `https://api.jup.ag/swap/v1/quote?${params}`
    const headers: Record<string, string> = { accept: 'application/json' }
    if (process.env.JUP_API_KEY) headers['x-api-key'] = process.env.JUP_API_KEY
    const r = await fetch(url, { headers })
    const body = await r.text()
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.status(r.status).send(body)
  } catch (e: unknown) {
    res.status(500).json({ error: String(e) })
  }
}
