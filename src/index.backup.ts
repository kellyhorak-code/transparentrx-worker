import { Router } from 'itty-router'
import Stripe from 'stripe'
import { calculateTruePrice } from './algorithms/trueprice'
import { calculateDistortionScore } from './algorithms/distortion'
import { refreshNDC } from './handlers/refresh'
import { importNDCFromFDA } from './handlers/fdaImport'
import { D1Database } from '@cloudflare/workers-types'

interface Env {
  DB: D1Database
  STRIPE_SECRET_KEY: string
  STRIPE_WEBHOOK_SECRET: string
  REFRESH_TOKEN?: string
}

const router = Router()

function json(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' }
  })
}

/* ---------------- HEALTH ---------------- */

router.get('/', () => new Response('OK'))

/* ---------------- SEARCH (DEDUPED) ---------------- */

router.get('/api/search', async (request: Request, env: Env) => {
  try {
    const url = new URL(request.url)
    const q = (url.searchParams.get('q') || '').toLowerCase().trim()

    if (q.length < 2) return json([])

    const { results } = await env.DB.prepare(`
      SELECT ndc_11, proprietary_name, nonproprietary_name, strength, dosage_form
      FROM ndc_master
      WHERE proprietary_name LIKE ? OR nonproprietary_name LIKE ?
      LIMIT 50
    `).bind(`%${q}%`, `%${q}%`).all()

    const grouped: Record<string, any> = {}

    for (const row of results || []) {
      const name = (row.nonproprietary_name || row.proprietary_name || '')
        .toLowerCase()
        .trim()

      const strength = (row.strength || '').toLowerCase().trim()
      const form = (row.dosage_form || '').toLowerCase().trim()

      const key = `${name}|${strength}|${form}`

      if (!grouped[key]) {
        grouped[key] = {
          display: `${name} ${strength} ${form}`.replace(/\s+/g, ' ').trim(),
          drug: name,
          strength,
          form,
          ndc: row.ndc_11
        }
      }
    }

    const formatted = Object.values(grouped)

    return json(formatted)

  } catch (e: any) {
    return json({ error: e.message }, 500)
  }
})

/* ---------------- STRENGTHS ---------------- */

router.get('/api/strengths', async (request: Request, env: Env) => {
  try {
    const url = new URL(request.url)
    const drug = url.searchParams.get('drug') || ''

    if (!drug) return json([])

    const { results } = await env.DB.prepare(`
      SELECT DISTINCT ndc_11, strength, dosage_form
      FROM ndc_master
      WHERE nonproprietary_name LIKE ?
      LIMIT 20
    `).bind(`%${drug}%`).all()

    return json(results || [])

  } catch (e: any) {
    return json({ error: e.message }, 500)
  }
})

/* ---------------- PRICE ENGINE ---------------- */

router.post('/api/price', async (request: Request, env: Env) => {
  try {
    const body = await request.json()

    const ndc = body.ndc
    const userPrice = Number(body.userPrice || 0)
    const dailyDosage = Number(body.dailyDosage || 1)

    if (!ndc) return json({ error: 'missing ndc' }, 400)

    const drugRow = await env.DB.prepare(`
      SELECT * FROM ndc_master WHERE ndc_11 = ?
    `).bind(ndc).first()

    if (!drugRow) return json({ error: 'NDC not found' }, 404)

    const drug: any = { ...drugRow }

    const nadacRow = await env.DB.prepare(`
      SELECT nadac_per_unit FROM nadac_prices WHERE ndc = ?
      LIMIT 1
    `).bind(ndc).first()

    drug.nadac_price = nadacRow?.nadac_per_unit ?? 0

    const tp = calculateTruePrice(drug, body.zip || '76102')

    const monthlySavings =
      (userPrice - tp.trueMid) * dailyDosage

    const distortionScore = calculateDistortionScore({
      userPrice,
      trueMid: tp.trueMid,
      trueLow: tp.trueLow,
      trueHigh: tp.trueHigh,
      dataFreshness: drug.last_updated ? 0.9 : 0.5
    })

    return json({
      ndc,
      drugName: drug.nonproprietary_name || drug.proprietary_name,

      acquisitionCost: Number(tp.trueLow.toFixed(2)),
      transdexPrice: Number(tp.trueMid.toFixed(2)),

      truePrice: {
        low: Number(tp.trueLow.toFixed(2)),
        mid: Number(tp.trueMid.toFixed(2)),
        high: Number(tp.trueHigh.toFixed(2))
      },

      distortionScore: Number(distortionScore.toFixed(2)),
      monthlySavings: Number(monthlySavings.toFixed(2)),
      userPrice
    })

  } catch (e: any) {
    return json({ error: e.message }, 500)
  }
})

/* ---------------- USER STATUS ---------------- */

router.get('/api/user-status', async (request: Request, env: Env) => {
  try {
    const cookie = request.headers.get('Cookie') || ''
    const match = cookie.match(/trx_session=([^;]+)/)

    if (!match) return json({ premium: false })

    const user = await env.DB.prepare(`
      SELECT status, email FROM users WHERE session_token = ?
    `).bind(match[1]).first()

    if (!user) return json({ premium: false })

    return json({
      premium: user.status === 'active',
      email: user.email
    })

  } catch {
    return json({ premium: false })
  }
})

/* ---------------- 404 ---------------- */

router.all('*', () => new Response('Not Found', { status: 404 }))

/* ---------------- EXPORT ---------------- */

export default {
  fetch: router.handle,

  async scheduled(event: any, env: Env, ctx: any) {
    if (env.REFRESH_TOKEN) {
      ctx.waitUntil(importNDCFromFDA(env))
      ctx.waitUntil(refreshNDC(env))
    }
  }
}