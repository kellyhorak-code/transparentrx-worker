import { Router } from 'itty-router'
import { calculateTruePrice } from './algorithms/trueprice'
import { calculateDistortionScore } from './algorithms/distortion'
import { refreshNDC } from './handlers/refresh'
import { importNDCFromFDA } from './handlers/fdaImport'
import { D1Database } from '@cloudflare/workers-types'

interface Env {
  DB: D1Database
  REFRESH_TOKEN?: string
  OPENAI_API_KEY?: string
}

const router = Router()

// ✅ GLOBAL HEADERS (CORS + CONSISTENT RESPONSES)
const headers = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type'
}

function json(data: any, status = 200) {
  return new Response(JSON.stringify(data), { status, headers })
}

// ✅ CORS PREFLIGHT
router.options('*', () => new Response(null, { headers }))

/* ---------------- HEALTH ---------------- */

router.get('/', () => json({ status: 'ok' }))

/* ---------------- TEST (DEBUG) ---------------- */

router.get('/api/test', () => json({ ok: true }))

/* ---------------- SEARCH ---------------- */

router.get('/api/search', async (request: Request, env: Env) => {
  try {
    const url = new URL(request.url)
    const q = (url.searchParams.get('q') || '').toLowerCase().trim()

    if (q.length < 2) return json([])

    const result = await env.DB.prepare(`
      SELECT ndc, ndc_description, nadac_per_unit
      FROM nadac_prices
      WHERE LOWER(ndc_description) LIKE ?
      AND nadac_per_unit > 0
      GROUP BY LOWER(ndc_description)
      ORDER BY nadac_per_unit ASC
      LIMIT 20
    `).bind(`${q}%`).all()

    const rows = result?.results || []

    const formatted = rows.map((row: any) => ({
      display: row.ndc_description || '',
      ndc: row.ndc
    }))

    return json(formatted)

  } catch (e: any) {
    console.error("SEARCH ERROR:", e)
    return json({
      error: "search_failed",
      details: e.message
    }, 500)
  }
})

/* ---------------- PRICE ENGINE ---------------- */

router.post('/api/price', async (request: Request, env: Env) => {
  try {
    const body = await request.json()

    const ndc = body.ndc
    const userPrice = Number(body.userPrice || 0)
    const dailyDosage = Number(body.dailyDosage || 1)
    const quantity = Number(body.quantity || 30)

    if (!ndc) return json({ error: 'missing_ndc' }, 400)

    const drugRow = await env.DB.prepare(`
      SELECT * FROM ndc_master WHERE ndc_11 = ?
    `).bind(ndc).first()

    if (!drugRow) return json({ error: 'ndc_not_found' }, 404)

    const drug: any = { ...drugRow }

    let nadacRow = await env.DB.prepare(`
      SELECT nadac_per_unit FROM nadac_prices WHERE ndc = ?
      LIMIT 1
    `).bind(ndc).first()

    // Fallback: look up by drug name if NDC is fake or missing
    if (!nadacRow?.nadac_per_unit) {
      const drugName = (drug.nonproprietary_name || drug.proprietary_name || '').toLowerCase()
      if (drugName) {
        nadacRow = await env.DB.prepare(`
          SELECT nadac_per_unit FROM nadac_prices
          WHERE LOWER(ndc_description) LIKE ?
          ORDER BY effective_date DESC
          LIMIT 1
        `).bind(`${drugName.split(' ')[0]}%`).first()
      }
    }

    drug.nadac_price = nadacRow?.nadac_per_unit ?? 0

    // If no NADAC price found, use retail data as price floor instead of $10 estimate
    if (!drug.nadac_price || drug.nadac_price <= 0) {
      const retailFallback = await env.DB.prepare(`
        SELECT MIN(cash_price) as min_price
        FROM retail_prices
        WHERE LOWER(drug_name) LIKE ?
        AND quantity = ?
        AND cash_price > 0
      `).bind(`${(drug.nonproprietary_name || '').toLowerCase().split(' ')[0]}%`, quantity).first()

      if (retailFallback?.min_price) {
        // Back-calculate per-unit from retail minimum
        drug.nadac_price = Number(retailFallback.min_price) / quantity * 0.55
      }
    }

    const tp = calculateTruePrice(drug, body.zip || '76102')

    const monthlySavings = (userPrice - tp.trueMid) * dailyDosage

    const distortionScore = calculateDistortionScore({
      userPrice,
      trueMid: tp.trueMid,
      trueLow: tp.trueLow,
      trueHigh: tp.trueHigh,
      dataFreshness: drug.last_updated ? 0.9 : 0.5
    })

    // Pull real retail prices from DB
    const drugNameLower = (drug.nonproprietary_name || drug.proprietary_name || '').toLowerCase().split(' ')[0]
    const retailRows = await env.DB.prepare(`
      SELECT pharmacy_name, pharmacy_chain,
             MIN(cash_price) as cash_price,
             MIN(coupon_price) as coupon_price,
             zip_code, source
      FROM retail_prices
      WHERE (ndc = ? OR LOWER(drug_name) LIKE ?)
      AND quantity = ?
      AND cash_price > 0
      GROUP BY pharmacy_name, zip_code
      ORDER BY cash_price ASC
      LIMIT 20
    `).bind(ndc, `${drugNameLower}%`, quantity).all()

    const retailPrices = retailRows?.results || []

    // Build pharmacy ranking from real data or fallback to algorithm
    let ranking: any[]
    let bestPharmacy = "Lowest Observed Option"
    let bestPrice = Number(tp.trueLow.toFixed(2))
    let sampleSize = 3

    if (retailPrices.length > 0) {
      const sorted = [...retailPrices].sort((a: any, b: any) => a.cash_price - b.cash_price)
      // Deduplicate by pharmacy name + zip
      // Deduplicate by chain — keep lowest price per chain
      const chainBest = new Map()
      sorted.forEach((r: any) => {
        const chain = (r.pharmacy_chain || r.pharmacy_name || '').toLowerCase()
        if (!chainBest.has(chain) || r.cash_price < chainBest.get(chain).cash_price) {
          chainBest.set(chain, r)
        }
      })
      const deduped = Array.from(chainBest.values()).sort((a: any, b: any) => a.cash_price - b.cash_price)
      ranking = deduped.slice(0, 10).map((r: any) => ({
        name: r.pharmacy_name,
        chain: r.pharmacy_chain,
        price: Number(Number(r.cash_price).toFixed(2)),
        coupon_price: Number(Number(r.coupon_price || r.cash_price).toFixed(2)),
        zip: r.zip_code,
        source: r.source
      }))
      bestPharmacy = deduped[0].pharmacy_name
      bestPrice = Number(Number(deduped[0].cash_price).toFixed(2))
      sampleSize = deduped.length
    } else {
      ranking = [
        { name: "Lowest Observed", price: Number(tp.trueLow.toFixed(2)) },
        { name: "Market Average",  price: Number(tp.trueMid.toFixed(2)) },
        { name: "Highest Observed",price: Number(tp.trueHigh.toFixed(2)) }
      ]
    }

    const savings = Number((userPrice - bestPrice).toFixed(2))
    const monthlySavingsFinal = Number(((userPrice - tp.trueMid) * dailyDosage).toFixed(2))

    // Price layers from algorithm
    const layers = tp.layers || []

    // Distortion interpretation
    const distLabel = distortionScore <= 10 ? 'efficient pricing' :
                      distortionScore <= 30 ? 'mild markup above market' :
                      distortionScore <= 70 ? 'significantly overpriced' :
                      'extreme price distortion'

    const verdictText = userPrice > tp.trueHigh ? 'strong case to switch pharmacy immediately' :
                        userPrice > tp.trueMid  ? 'worth shopping around for better pricing' :
                        'near the market low — fair price'

    // Generate dynamic AI insight via OpenAI
    let insight = ''
    try {
      const promptData = {
        drugName: drug.nonproprietary_name || drug.proprietary_name,
        strength: drug.strength || body.strength || '',
        quantity,
        userPrice,
        truePrice: { low: Number(tp.trueLow.toFixed(2)), mid: Number(tp.trueMid.toFixed(2)), high: Number(tp.trueHigh.toFixed(2)) },
        distortionScore: Number(distortionScore.toFixed(2)),
        distortionLabel: distLabel,
        verdict: verdictText,
        bestPharmacy,
        bestPrice,
        monthlySavings: monthlySavingsFinal,
        annualSavings: Number((monthlySavingsFinal * 12).toFixed(2)),
        nadacCost: Number((drug.nadac_price || 0).toFixed(4)),
        sampleSize,
        zip: body.zip || '76102',
        pharmacyCount: retailPrices.length
      }

      const aiRes = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${env.OPENAI_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          max_tokens: 250,
          messages: [{
            role: 'system',
            content: 'You are TransparentRx, a prescription pricing intelligence engine. Write a 100-150 word analysis that is specific, data-driven, and actionable. Never use generic filler. Reference the actual numbers. Be direct and helpful. Do not use bullet points.'
          }, {
            role: 'user',
            content: `Analyze this prescription pricing data and write a personalized insight:
Drug: ${promptData.drugName} ${promptData.strength}
Quantity: ${promptData.quantity} tablets
User paid: $${promptData.userPrice}
Fair market price (TruePrice™ mid): $${promptData.truePrice.mid}
Market low: $${promptData.truePrice.low} | Market high: $${promptData.truePrice.high}
NADAC acquisition cost: $${promptData.nadacCost} per unit
Distortion score: ${promptData.distortionScore}/100 (${promptData.distortionLabel})
Verdict: ${promptData.verdict}
Best pharmacy found: ${promptData.bestPharmacy} at $${promptData.bestPrice}
Monthly savings opportunity: $${promptData.monthlySavings}
Annual savings opportunity: $${promptData.annualSavings}
ZIP code: ${promptData.zip}
Data points: ${promptData.sampleSize} price observations`
          }]
        })
      })
      const aiData: any = await aiRes.json()
      insight = aiData?.choices?.[0]?.message?.content?.trim() || ''
    } catch(aiErr: any) {
      console.error('OpenAI error:', aiErr.message)
    }

    if (!insight) {
      insight = `${drug.nonproprietary_name || drug.proprietary_name} shows a distortion score of ${Number(distortionScore.toFixed(0))}/100, indicating ${distLabel}. At $${userPrice} paid versus a fair market price of $${Number(tp.trueMid.toFixed(2))}, this represents ${verdictText}. The NADAC wholesale acquisition cost is $${Number((drug.nadac_price || 0).toFixed(4))} per unit. ${sampleSize} price observations were used in this analysis. Switching to ${bestPharmacy} at $${bestPrice} could save approximately $${Math.abs(savings)} on this fill.`
    }

    return json({
      ndc,
      drugName: drug.nonproprietary_name || drug.proprietary_name,
      strength: drug.strength,
      quantity,
      zip: body.zip || '76102',

      truePrice: {
        low: Number(tp.trueLow.toFixed(2)),
        mid: Number(tp.trueMid.toFixed(2)),
        high: Number(tp.trueHigh.toFixed(2))
      },

      nadacPerUnit: Number((drug.nadac_price || 0).toFixed(4)),
      acquisitionCost: Number(((drug.nadac_price || 0) * quantity).toFixed(2)),

      recommended: {
        pharmacy: bestPharmacy,
        expectedPrice: bestPrice,
        savings: Number(savings.toFixed(2)),
        confidence: retailPrices.length > 5 ? "HIGH" : retailPrices.length > 0 ? "MEDIUM" : "LOW"
      },

      distortionScore: Number(distortionScore.toFixed(2)),
      distortionLabel: distLabel,
      monthlySavings: monthlySavingsFinal,
      annualSavings: Number((monthlySavingsFinal * 12).toFixed(2)),
      userPrice,

      layers,
      insight,
      ranking,
      sampleSize,

      dataSource: retailPrices.length > 0 ? 'live_retail' : 'nadac_model'
    })

  } catch (e: any) {
    console.error("PRICE ERROR:", e)
    return json({ error: 'price_failed', details: e.message }, 500)
  }
})

/* ---------------- PHARMACY SEARCH ---------------- */

router.get('/api/pharmacies', async (request: Request, env: any) => {
  const url = new URL(request.url)
  const q = (url.searchParams.get('q') || '').toLowerCase().trim()
  if (q.length < 2) return json([])
  const { results } = await env.DB.prepare(`
    SELECT pharmacy_name, pharmacy_chain
    FROM retail_prices
    WHERE LOWER(pharmacy_name) LIKE ?
    GROUP BY LOWER(pharmacy_name)
    ORDER BY MIN(cash_price)
    LIMIT 10
  `).bind(`%${q}%`).all()
  return json(results || [])
})

/* ---------------- RETAIL PRICE INGEST ---------------- */

router.post('/api/retail-price', async (request: Request, env: any) => {
  try {
    const body: any = await request.json()
    const {
      ndc, drug_name, strength, pharmacy_name, pharmacy_chain,
      cash_price, coupon_price, quantity, zip_code, source
    } = body

    if (!pharmacy_name || !cash_price) {
      return json({ error: 'missing_fields' }, 400)
    }

    await env.DB.prepare(`
      INSERT INTO retail_prices (
        ndc, drug_name, strength, pharmacy_name, pharmacy_chain,
        cash_price, coupon_price, quantity, zip_code, source, scraped_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `).bind(
      ndc || null, drug_name || null, strength || null,
      pharmacy_name, pharmacy_chain || null,
      cash_price, coupon_price || cash_price,
      quantity || null, zip_code || null, source || null
    ).run()

    return json({ success: true })
  } catch (e: any) {
    return json({ error: e.message }, 500)
  }
})

/* ---------------- INGEST NADAC ---------------- */

router.get('/api/status', async (request: Request, env: any) => {
  try {
    const nadac = await env.DB.prepare('SELECT COUNT(*) as count FROM nadac_prices').first()
    const ndc = await env.DB.prepare('SELECT COUNT(*) as count FROM ndc_master').first()
    const retail = await env.DB.prepare('SELECT COUNT(*) as count, MAX(scraped_at) as last_scraped FROM retail_prices').first()
    const pharmacies = await env.DB.prepare('SELECT COUNT(DISTINCT pharmacy_name) as count FROM retail_prices').first()
    return json({
      status: 'ok',
      data: {
        nadac_prices: nadac?.count || 0,
        ndc_master: ndc?.count || 0,
        retail_prices: retail?.count || 0,
        pharmacy_count: pharmacies?.count || 0,
        last_scraped: retail?.last_scraped || null
      },
      worker: 'transparentrx-worker',
      timestamp: new Date().toISOString()
    })
  } catch (e: any) {
    return json({ error: e.message }, 500)
  }
})

/* ---------------- 404 ---------------- */

router.post("/api/checkout", async (request: Request, env: any) => {
  const { checkoutHandler } = await import("./handlers/checkout")
  return checkoutHandler(request, env)
})

router.all('*', () => json({ error: 'not_found' }, 404))

/* ---------------- EXPORT (CRITICAL FIX) ---------------- */

export default {
  async fetch(request: Request, env: Env, ctx: any) {
    try {
      const response = await router.handle(request, env, ctx)

      // 🚨 GUARANTEE RESPONSE
      if (!response) {
        return new Response(JSON.stringify({
          error: "no_response_returned"
        }), {
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*"
          }
        })
      }

      return response

    } catch (e: any) {
      return new Response(JSON.stringify({
        error: "worker_crash",
        details: e.message
      }), {
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*"
        }
      })
    }
  },

  async scheduled(event: any, env: Env, ctx: any) {
    if (env.REFRESH_TOKEN) {
      ctx.waitUntil(importNDCFromFDA(env))
      ctx.waitUntil(refreshNDC(env))
    }
  }
}