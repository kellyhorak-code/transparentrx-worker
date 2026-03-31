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

    const ndc = body.ndc || ''
    const userPrice = Number(body.userPrice || 0)
    const insuranceCopay = Number(body.insuranceCopay || 0)
    const effectivePrice = insuranceCopay > 0 ? Math.min(userPrice, insuranceCopay) : userPrice
    const dailyDosage = Number(body.dailyDosage || 1)
    const quantity = Number(body.quantity || 30)
    const bodyDrugName = (body.drug || '').toLowerCase().trim()

    if (!userPrice) return json({ error: 'missing_price' }, 400)
    if (!bodyDrugName && !ndc) return json({ error: 'missing_drug' }, 400)

    // NDC lookup — optional, fall back to drug name
    let drugRow: any = null
    if (ndc) {
      drugRow = await env.DB.prepare(
        'SELECT * FROM ndc_master WHERE ndc_11 = ?'
      ).bind(ndc).first()
    }
    if (!drugRow && bodyDrugName) {
      drugRow = await env.DB.prepare(
        'SELECT * FROM ndc_master WHERE LOWER(ndc_description) LIKE ? ORDER BY ndc_11 ASC LIMIT 1'
      ).bind(bodyDrugName.split(' ')[0] + '%').first()
    }

    // Synthetic fallback so analysis always runs
    const drug: any = drugRow ? { ...drugRow } : {
      nonproprietary_name: body.drug || '',
      proprietary_name: body.drug || '',
      ndc_description: body.drug || '',
      strength: body.strength || '',
      nadac_price: 0,
      last_updated: null
    }

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

    // Use real retail percentiles if enough data exists
    const drugNameForStats = (drug.nonproprietary_name || '').toLowerCase().split(' ')[0]
    const statsRow = await env.DB.prepare(`
      SELECT 
        MIN(cash_price) as p_low,
        AVG(cash_price) as p_mid,
        MAX(cash_price) as p_high,
        COUNT(*) as samples
      FROM retail_prices
      WHERE LOWER(drug_name) LIKE ?
      AND quantity = ?
      AND cash_price > 0
      AND cash_price < 500
    `).bind(`${drugNameForStats}%`, quantity).first()

    const tp = calculateTruePrice(drug, body.zip || '76102')

    // Override with real data if 5+ samples
    if (statsRow && Number(statsRow.samples) >= 5) {
      const realLow = Number(statsRow.p_low)
      const realMid = Number(statsRow.p_mid)
      const realHigh = Number(statsRow.p_high)
      if (realLow > 0 && realHigh > 0 && realHigh < 1000) {
        tp.trueLow = realLow
        tp.trueMid = realMid
        tp.trueHigh = realHigh
      }
    }

    const monthlySavings = (userPrice - tp.trueMid) * dailyDosage

    // distortionScore calculated below after bestPrice/sampleSize are known

    let couponOptions: any[] = []

    // Pull real retail prices from DB
    const drugNameLower = (drug.nonproprietary_name || drug.proprietary_name || '').toLowerCase().split(' ')[0]
    const retailRows = await env.DB.prepare(`
      SELECT pharmacy_name, pharmacy_chain, MIN(cash_price) as cash_price, MIN(coupon_price) as coupon_price, zip_code, source
      FROM retail_prices
      WHERE (ndc = ? OR LOWER(drug_name) LIKE ?)
      AND quantity = ?
      AND cash_price > 0
      GROUP BY pharmacy_name, zip_code, source
      ORDER BY cash_price ASC
      LIMIT 50
    `).bind(ndc, `${drugNameLower}%`, quantity).all()

    const retailPrices = retailRows?.results || []

    // Fetch Cost Plus Drugs price for this drug
    let costPlusRecord: any = null
    try {
      const drugNameForCP = (drug.nonproprietary_name || drug.proprietary_name || '').toLowerCase().replace(/\s+/g, '+')
      const cpRes = await fetch(
        `https://us-central1-costplusdrugs-publicapi.cloudfunctions.net/main?medication_name=${encodeURIComponent(drug.nonproprietary_name || drug.proprietary_name || '')}&quantity_units=${quantity}`,
        { headers: { 'Accept': 'application/json' } }
      )
      if (cpRes.ok) {
        const cpData: any = await cpRes.json()
        const cpResults = cpData?.results || []
        // Match on strength if possible
        const strengthNorm = (body.strength || '').toLowerCase().replace(/\s+/g, '')
        const matched = cpResults.find((r: any) =>
          r.strength && r.strength.toLowerCase().replace(/\s+/g, '') === strengthNorm
        ) || cpResults[0]
        if (matched && matched.requested_quote) {
          const cpPrice = parseFloat(matched.requested_quote.replace('$', ''))
          if (cpPrice > 0 && cpPrice < 500) {
            costPlusRecord = {
              pharmacy_name: 'Cost Plus Drugs',
              pharmacy_chain: 'costplus',
              cash_price: cpPrice,
              coupon_price: cpPrice,
              zip_code: 'nationwide',
              source: 'costplusdrugs'
            }
          }
        }
      }
    } catch (cpErr: any) {
      console.error('Cost Plus API error:', cpErr.message)
    }

    // Merge Cost Plus into retail prices if found
    const allRetailPrices = costPlusRecord
      ? [...retailPrices, costPlusRecord]
      : retailPrices

    // Build pharmacy ranking from real data or fallback to algorithm
    let ranking: any[]
    let bestPharmacy = "Lowest Observed Option"
    let bestPrice = Number(tp.trueLow.toFixed(2))
    let sampleSize = 3

    if (allRetailPrices.length > 0) {
      const sorted = [...allRetailPrices].sort((a: any, b: any) => a.cash_price - b.cash_price)
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

      // Build coupon options grouped by pharmacy+source (deduplicated)
      const couponMap = new Map()
      retailPrices.forEach((r: any) => {
        const src = r.source || 'buzzintegrations'
        if (src === 'buzzintegrations') return
        const chain = (r.pharmacy_chain || r.pharmacy_name || '').toLowerCase()
        if (!couponMap.has(chain)) couponMap.set(chain, new Map())
        const srcMap = couponMap.get(chain)
        // Keep lowest price per provider
        if (!srcMap.has(src) || r.cash_price < srcMap.get(src).price) {
          srcMap.set(src, {
            provider: src,
            pharmacy: r.pharmacy_name,
            price: Number(Number(r.cash_price).toFixed(2)),
            zip: r.zip_code
          })
        }
      })
      couponOptions = Array.from(couponMap.entries()).map(([chain, srcMap]: any) => ({
        pharmacy: Array.from(srcMap.values())[0].pharmacy,
        chain,
        offers: Array.from(srcMap.values()).sort((a: any, b: any) => a.price - b.price)
      }))
    } else {
      ranking = [
        { name: "Lowest Observed", price: Number(tp.trueLow.toFixed(2)) },
        { name: "Market Average",  price: Number(tp.trueMid.toFixed(2)) },
        { name: "Highest Observed",price: Number(tp.trueHigh.toFixed(2)) }
      ]
    }

    const savings = Number((effectivePrice - bestPrice).toFixed(2))
    const monthlySavingsFinal = Math.max(0, Number((effectivePrice - bestPrice).toFixed(2)))

    const distortionScore = calculateDistortionScore({
      userPrice,
      trueMid: tp.trueMid,
      trueLow: tp.trueLow,
      trueHigh: tp.trueHigh,
      dataFreshness: drug.last_updated ? 0.9 : 0.5,
      bestCashPrice: bestPrice,
      sampleSize,
      pharmacyCount: retailPrices.length
    })

    // Price layers from algorithm
    const layers = tp.layers || []

    // Distortion interpretation
    const distLabel = distortionScore <= 10 ? 'efficient pricing' :
                      distortionScore <= 30 ? 'mild markup above market' :
                      distortionScore <= 70 ? 'significantly overpriced' :
                      'extreme price distortion'

    const pctAboveBest = bestPrice > 0 ? ((userPrice - bestPrice) / bestPrice) * 100 : 0
    const verdictText = pctAboveBest > 50 ? 'strong case to switch pharmacy immediately' :
                        pctAboveBest > 15 ? 'worth shopping around for better pricing' :
                        'near the market low — fair price'

    // Build coupon summary string for OpenAI prompt
    const couponSummary = couponOptions.length > 0
      ? couponOptions.map((c: any) =>
          `${c.pharmacy}: ${c.offers.map((o: any) => `${o.provider} $${o.price.toFixed(2)}`).join(', ')}`
        ).join(' | ')
      : 'No coupon options available'

    // Break-even calculation for premium pitch
    const premiumMonthly = 12
    const daysToBreakeven = monthlySavingsFinal >= premiumMonthly
      ? Math.round((premiumMonthly / monthlySavingsFinal) * 30)
      : null

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
        pharmacyCount: allRetailPrices.length,
        couponSummary,
        userPharmacy: body.userPharmacy || 'their current pharmacy',
        isFirstUser: daysToBreakeven !== null,
        daysToBreakeven: daysToBreakeven || null
      }

      const aiRes = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${env.OPENAI_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          max_tokens: 400,
          messages: [{
            role: 'system',
            content: 'You are TransparentRx, a prescription pricing intelligence engine. Write a 220-260 word analysis in flowing paragraphs with no bullet points or headers. Reference every data point provided. Cover: (1) what the user paid vs NADAC wholesale and TruePrice™ fair value, (2) the distortion score meaning and markup chain breakdown, (3) the best pharmacy option with exact dollar savings monthly and annually, (4) if isFirstTimeUser is true: end with a 2-sentence premium pitch explaining that at $12/month premium pays for itself in daysToBreakeven days based on this one drug alone, and that members get unlimited analyses across all medications. Be direct, authoritative, data-driven like a Bloomberg terminal analyst.'
          }, {
            role: 'user',
            content: `Generate a personalized prescription pricing intelligence report. Every report must be unique — vary sentence structure, lead with a different angle (savings opportunity, markup analysis, or coupon opportunity), and tailor the tone to the specific drug class and distortion level.

PATIENT DATA:
- Drug: ${promptData.drugName} ${promptData.strength}, ${promptData.quantity} units
- Location: ZIP ${promptData.zip}
- Price Paid: $${promptData.userPrice} at ${promptData.userPharmacy}

PRICING INTELLIGENCE:
- NADAC Wholesale: $${promptData.nadacCost}/unit ($${(promptData.nadacCost * promptData.quantity).toFixed(2)} total)
- TruePrice™ Range: $${promptData.truePrice.low} – $${promptData.truePrice.high} (mid: $${promptData.truePrice.mid})
- Distortion Score: ${promptData.distortionScore}/100 (${promptData.distortionLabel})
- Overpayment vs fair market: $${(promptData.userPrice - promptData.truePrice.mid).toFixed(2)} (${((promptData.userPrice - promptData.truePrice.mid) / Math.max(promptData.truePrice.mid, 0.01) * 100).toFixed(0)}%)
- Best pharmacy option: ${promptData.bestPharmacy} at $${promptData.bestPrice}
- Monthly savings if switched: $${promptData.monthlySavings}
- Annual savings if switched: $${promptData.annualSavings}

COUPON CARD OPTIONS:
${promptData.couponSummary}

CONTEXT:
- Live price observations: ${promptData.sampleSize}
- Data source: ${promptData.pharmacyCount > 0 ? 'Live retail scrape + NADAC' : 'NADAC model estimate'}
- Verdict: ${promptData.verdict}
${promptData.isFirstUser && promptData.daysToBreakeven ? `- MANDATORY FINAL 2 SENTENCES ONLY: The premium membership at $12/mo pays for itself in exactly ${promptData.daysToBreakeven} days based on this drug alone. Members receive unlimited analyses across all medications. Use ONLY this break-even number — do not calculate your own.` : `- STRICT RULE: Do NOT mention premium membership, $12/month, RxPass, or any subscription pricing anywhere in this analysis. The patient saves less than $12/month so membership does not pay for itself.`}`
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
      couponOptions,
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

    // Reject clearly bad prices
    if (cash_price > 500 || cash_price < 0.01) {
      return json({ error: 'price_out_of_range', price: cash_price }, 400)
    }

    // Normalize pharmacy name to Title Case
    const normalizePharmacy = (name: string) => {
      return name.toLowerCase().replace(/\b\w/g, (c: string) => c.toUpperCase()).trim()
    }
    const normalizedName = normalizePharmacy(pharmacy_name)
    const normalizedChain = pharmacy_chain ? normalizePharmacy(pharmacy_chain) : normalizedName

    await env.DB.prepare(`
      INSERT INTO retail_prices (
        ndc, drug_name, strength, pharmacy_name, pharmacy_chain,
        cash_price, coupon_price, quantity, zip_code, source, scraped_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `).bind(
      ndc || null, drug_name || null, strength || null,
      normalizedName, normalizedChain || null,
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