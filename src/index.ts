
import { Router } from 'itty-router'
import { monteCarloPrice } from './quant/simulation'
import Stripe from 'stripe'
import { calculateTruePrice } from './algorithms/trueprice'
import { calculateDistortionScore } from './algorithms/distortion'
import { refreshNDC } from './handlers/refresh'
import { importNDCFromFDA, initialImport } from './handlers/fdaImport'
import { D1Database } from '@cloudflare/workers-types'

interface Env {
  DB: D1Database
  STRIPE_SECRET_KEY: string
  STRIPE_WEBHOOK_SECRET: string
  REFRESH_TOKEN?: string
  FDA_API_KEY?: string
  NADAC_URL: string
  CMS_URL: string
  AWP_FACTOR: string
  GEO_ENABLED: string
  ENVIRONMENT?: string
  GOOGLE_MAPS_API_KEY?: string
}

const router = Router()

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "*"
}

/* ---------------------------------------------------
   HEALTH CHECK
--------------------------------------------------- */

router.get('/', async () => {

  return new Response('TransparentRX API is running', {
    status: 200,
    headers: { 'Content-Type': 'text/plain' }
  })

})

/* ---------------------------------------------------
   DRUG SEARCH
--------------------------------------------------- */

// 🔥 REPLACED normalizeName function
const normalizeName = (raw: string) => {
  if (!raw) return ''

  let name = raw.toLowerCase()

  name = name
    .replace(' and hydrochlorothiazide', '/hctz')
    .replace('hydrochlorothiazide', 'hctz')
    .replace('/ hctz', '/hctz')
    .replace(' /hctz', '/hctz')

  name = name
    .replace(' tablets', '')
    .replace(' tablet', '')
    .replace(' oral', '')

  return name.replace(/\s+/g, ' ').trim()
}

// 🔥 REPLACED ENTIRE /api/search route
router.get('/api/search', async (request: Request, env: Env) => {
  try {
    const url = new URL(request.url)
    const q = (url.searchParams.get('q') || '').toLowerCase().trim()

    if (q.length < 2) {
      return new Response(JSON.stringify([]), {
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      })
    }

    const { results } = await env.DB.prepare(`
      SELECT
        ndc_11,
        proprietary_name,
        nonproprietary_name,
        dosage_form,
        strength,
        route,
        labeler_name
      FROM ndc_master
      WHERE proprietary_name LIKE ?
         OR nonproprietary_name LIKE ?
      LIMIT 100
    `).bind(`%${q}%`, `%${q}%`).all()

    const parseStrength = (raw: string) => {
      if (!raw) return ''
      const cleaned = raw.replace(/\/1/g, '').trim()

      if (cleaned.includes(';')) {
        const parts = cleaned.split(';').map(s => s.trim())
        if (parts.length === 2) {
          return `${parseFloat(parts[1])}mg/${parseFloat(parts[0])}mg`
        }
      }

      return `${parseFloat(cleaned)}mg`
    }

    const grouped: Record<string, any> = {}

    for (const row of results || []) {
      const drug = normalizeName(
        row.nonproprietary_name || row.proprietary_name
      )

      const strength = parseStrength(row.strength)
      const form = (row.dosage_form || '').toLowerCase()

      if (!grouped[drug]) {
        grouped[drug] = {
          drug,
          display: drug,
          manufacturer: row.labeler_name,
          strengths: []
        }
      }

   // 🔥 DEDUPE: one NDC per strength (canonical mapping)
const exists = grouped[drug].strengths.find(
  (s: any) => s.strength === strength
)

if (!exists) {
  grouped[drug].strengths.push({
    strength,
    ndc: row.ndc_11,
    form
  })
}
    }

    return new Response(JSON.stringify(Object.values(grouped)), {
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    })

  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    })
  }
})

/* ---------------------------------------------------
   TRUE PRICE CALCULATION
--------------------------------------------------- */

router.post('/api/price', async (request: Request, env: Env) => {

  try {

    const { ndc, userPrice, zip, dailyDosage } = await request.json() as any

    const drug = await env.DB.prepare(`
      SELECT *
      FROM ndc_master
      WHERE ndc_11 = ?
    `).bind(ndc).first()

    if (!drug) {
      return new Response(JSON.stringify({ error: 'NDC not found' }), {
        status: 404,
        headers: corsHeaders
      })
    }

    const nadacRow = await env.DB.prepare(`
      SELECT nadac_per_unit
      FROM nadac_prices
      WHERE ndc = ?
      LIMIT 1
    `).bind(ndc).first()

    drug.nadac_price = nadacRow?.nadac_per_unit ?? null

    const truePrice = calculateTruePrice(drug, zip)

    const monthlySavings =
      (userPrice - truePrice.trueMid) * (dailyDosage || 1)

    const distortionScore = calculateDistortionScore({
      userPrice,
      trueMid: truePrice.trueMid,
      trueLow: truePrice.trueLow,
      trueHigh: truePrice.trueHigh,
      dataFreshness: drug.last_updated ? 0.9 : 0.5
    })

    /* ---------------- PHARMACY INTELLIGENCE ---------------- */

    let pharmacies: any[] = []

    try {
      const { results } = await env.DB.prepare(`
        SELECT pharmacy_name, cash_price
        FROM retail_prices
        WHERE ndc = ?
          AND cash_price > 0
          AND cash_price < 1000
        LIMIT 200
      `).bind(ndc).all()

      // ---------------- BRAND NORMALIZATION ----------------

      const normalizePharmacy = (name: string) => {
        if (!name) return 'Unknown'

        const raw = name.toLowerCase()

        if (raw.includes('cvs')) return 'CVS'
        if (raw.includes('walgreens')) return 'Walgreens'
        if (raw.includes('walmart')) return 'Walmart'
        if (raw.includes('costco')) return 'Costco'
        if (raw.includes('rite aid')) return 'Rite Aid'
        if (raw.includes('kroger')) return 'Kroger'
        if (raw.includes('safeway')) return 'Safeway'

        // fallback cleanup
        return raw
          .replace(' pharmacy', '')
          .replace(' drugs', '')
          .replace(' store', '')
          .replace(/\s+/g, ' ')
          .trim()
          .replace(/\b\w/g, c => c.toUpperCase())
      }

      const map: Record<string, any> = {}

      for (const r of (results || [])) {
        const price = Number(r.cash_price)
        if (!price || price <= 0 || price > 500) continue

        const normalized = normalizePharmacy(r.pharmacy_name)

        // keep lowest price per chain
        if (!map[normalized] || price < map[normalized].price) {
          map[normalized] = {
            name: normalized,
            price
          }
        }
      }

      pharmacies = Object.values(map)

    } catch (e) {
      console.log("retail_prices query failed")
    }

    /* ---------------- FALLBACK ---------------- */

    if (!pharmacies.length) {
      pharmacies = [
        { name: "Walmart", price: Number(truePrice.trueLow.toFixed(2)) },
        { name: "Costco", price: Number(truePrice.trueMid.toFixed(2)) },
        { name: "Walgreens", price: Number(truePrice.trueHigh.toFixed(2)) }
      ]
    }

    /* ---------------- GEO WEIGHTED SORT ---------------- */

    let nearby: string[] = []

    try {
      const coords = {
        lat: 32.7555,
        lng: -97.3308
      }

      const res = await fetch("https://places.googleapis.com/v1/places:searchNearby", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": env.GOOGLE_MAPS_API_KEY || "",
          "X-Goog-FieldMask": "places.displayName"
        },
        body: JSON.stringify({
          includedTypes: ["pharmacy"],
          locationRestriction: {
            circle: {
              center: {
                latitude: coords.lat,
                longitude: coords.lng
              },
              radius: 5000
            }
          }
        })
      })

      const data = await res.json()

      nearby = (data.places || []).map((p: any) =>
        (p.displayName?.text || '').toLowerCase()
      )

    } catch (e) {
      console.log("geo lookup failed")
    }

    // price + proximity scoring
    pharmacies = pharmacies
      .map((p: any) => {
        const isNearby = nearby.some(n =>
          n.includes(p.name.toLowerCase())
        )

        return {
          ...p,
          score: p.price + (isNearby ? -2 : 0)
        }
      })
      .sort((a: any, b: any) => a.score - b.score)

    /* ---------------- METRICS ---------------- */

    const priceArr = pharmacies.map(p => p.price).sort((a, b) => a - b)

    const min = priceArr[0] || 0
    const max = priceArr[priceArr.length - 1] || 0
    const median = priceArr[Math.floor(priceArr.length / 2)] || 0

    const bestPharmacy = pharmacies[0] || null

    /* ---------------- ARBITRAGE ENGINE ---------------- */

    let arbitrage = null

    if (bestPharmacy && userPrice) {
      const savings = userPrice - bestPharmacy.price

      if (savings > 0) {
        arbitrage = {
          recommendedPharmacy: bestPharmacy.name,
          recommendedPrice: Number(bestPharmacy.price.toFixed(2)),
          savings: Number(savings.toFixed(2)),
          savingsPercent: Number(((savings / userPrice) * 100).toFixed(1))
        }
      }
    }

/* ---------------- BEHAVIORAL PRICING ---------------- */

let timing = null

try {
  const { results: history } = await env.DB.prepare(`
    SELECT cash_price
    FROM retail_prices
    WHERE ndc = ?
      AND cash_price > 0
    ORDER BY scraped_at DESC
    LIMIT 20
  `).bind(ndc).all()

  const prices = (history || [])
    .map((r: any) => Number(r.cash_price))
    .filter((p: number) => !isNaN(p) && p > 0)

  if (prices.length >= 5) {
    const avg =
      prices.reduce((a: number, b: number) => a + b, 0) / prices.length

    const variance =
      prices.reduce((a: number, b: number) => a + Math.pow(b - avg, 2), 0) /
      prices.length

    const rawVolatility = Math.sqrt(variance)
    const volatility = avg > 0 ? rawVolatility / avg : 0

    const current = prices[0]

    let action = 'buy_now'

    if (volatility > 0.25 && current > avg) {
      action = 'wait'
    } else if (current < avg * 0.9) {
      action = 'buy_now'
    } else {
      action = 'stable'
    }

    const confidence = Math.min(1, prices.length / 20)

    timing = {
      avgPrice: Number(avg.toFixed(2)),
      currentPrice: Number(current.toFixed(2)),
      volatility: Number(volatility.toFixed(2)),
      recommendation: action,
      confidence: Number(confidence.toFixed(2))
    }
  }

} catch (e) {
  console.log("behavioral model failed")
}

/* ---------------- REFILL + LIFETIME ENGINE ---------------- */

let refill = null

try {
  const daily = Number(dailyDosage || 1)
  const quantity = 30 // fallback if not passed

  if (daily > 0) {
    const daysRemaining = quantity / daily

    // 🔥 next refill estimate
    const nextRefillDays = Math.max(1, Math.round(daysRemaining))

    // 🔥 monthly + yearly economics
    const monthlyCost = userPrice
    const optimizedMonthly = bestPharmacy?.price || truePrice.trueMid

    const monthlySavingsOptimized = monthlyCost - optimizedMonthly
    const yearlySavings = monthlySavingsOptimized * 12

    // 🔥 lifetime model (3 year horizon)
    const lifetimeSavings = yearlySavings * 3

    refill = {
      daysRemaining: Number(nextRefillDays),
      recommendedRefillDay: Number(nextRefillDays - 3), // refill buffer
      optimizedMonthlyPrice: Number(optimizedMonthly.toFixed(2)),
      monthlySavingsOptimized: Number(monthlySavingsOptimized.toFixed(2)),
      yearlySavings: Number(yearlySavings.toFixed(2)),
      lifetimeSavings: Number(lifetimeSavings.toFixed(2))
    }
  }

} catch (e) {
  console.log("refill model failed")
}

    /* ---------------- PRICE POSITION ---------------- */

    const classifyPrice = (price: number, low: number, mid: number, high: number) => {
      if (price <= low) return 'below_market'
      if (price <= mid) return 'fair'
      if (price <= high) return 'high'
      return 'overpriced'
    }

    const userPosition = classifyPrice(
      userPrice,
      truePrice.trueLow,
      truePrice.trueMid,
      truePrice.trueHigh
    )

    /* ---------------- BUY DECISION ---------------- */

    let recommendation = null

    if (userPosition === 'overpriced') {
      recommendation = 'switch_pharmacy'
    } else if (userPosition === 'high') {
      recommendation = 'shop_around'
    } else {
      recommendation = 'fair_price'
    }

    const subscriptionCost = 12

    const monthsToBreakeven =
      monthlySavings > 0
        ? (subscriptionCost / monthlySavings).toFixed(1)
        : null

    const annualNetGain =
      monthlySavings > 0
        ? (monthlySavings * 12) - (subscriptionCost * 12)
        : null

    const sim = monteCarloPrice(truePrice.trueMid, (timing && timing.volatility) ? timing.volatility : 0.2);

const response = {
      simulation: {
        expected: Number(sim.expected.toFixed(2)),
        low: Number(sim.low.toFixed(2)),
        high: Number(sim.high.toFixed(2))
      },

      ndc: drug.ndc_11,

      timing,

      refill,

      drugName: drug.proprietary_name || drug.nonproprietary_name,

      userPrice,

      truePrice: {
        low: Number(truePrice.trueLow.toFixed(2)),
        mid: Number(truePrice.trueMid.toFixed(2)),
        high: Number(truePrice.trueHigh.toFixed(2)),
        confidence: truePrice.confidence
      },

      layers: truePrice.layers.map((l: any) => ({
        name: l.name,
        value: Number(l.value.toFixed(2)),
        description: l.description
      })),

      monthlySavings: Number(monthlySavings.toFixed(2)),

      annualSavings: Number((monthlySavings * 12).toFixed(2)),

      distortionScore,

      breakEven: {
        monthsToBreakeven:
          monthsToBreakeven ? Number(monthsToBreakeven) : null,
        annualNetGain:
          annualNetGain ? Number(annualNetGain.toFixed(2)) : null
      },

      sources: ['NADAC', 'CMS Part D', 'AWP'],

      lastUpdated: drug.last_updated,

      // 🔥 ADDED PHARMACY FIELDS
      bestPharmacy,
      pharmacies: pharmacies.slice(0, 10),
      min,
      median,
      max,
      count: pharmacies.length,

      // 🔥 ADDED ARBITRAGE AND RECOMMENDATION FIELDS
      arbitrage,
      pricePosition: userPosition,
      recommendation
    }

    return new Response(JSON.stringify(response), {
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    })

  } catch (error: any) {

    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    })

  }

})

/* ---------------------------------------------------
   SCRAPER JOB QUEUE
--------------------------------------------------- */

router.get('/api/next-job', async (request: Request, env: Env) => {

  const job = await env.DB.prepare(`
    SELECT *
    FROM scrape_jobs
    WHERE status='pending'
    ORDER BY id
    LIMIT 1
  `).first()

  if (!job) {

    return new Response(JSON.stringify(null), {
      headers: { 'Content-Type': 'application/json' }
    })

  }

  await env.DB.prepare(`
    UPDATE scrape_jobs
    SET status='processing'
    WHERE id=?
  `)
  .bind(job.id)
  .run()

  return new Response(JSON.stringify(job), {
    headers: { 'Content-Type': 'application/json' }
  })

})

router.post('/api/job-complete', async (request: Request, env: Env) => {

  let body: any = null

  try {
    body = await request.json()
  } catch {
    return new Response(JSON.stringify({ error: "invalid json" }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    })
  }

  if (!body || !body.id) {

    return new Response(JSON.stringify({ error: "missing id" }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    })

  }

  await env.DB.prepare(`
    UPDATE scrape_jobs
    SET status='complete',
        completed_at=datetime('now')
    WHERE id=?
  `)
  .bind(body.id)
  .run()

  return new Response(JSON.stringify({ success:true }), {
    headers: { 'Content-Type': 'application/json' }
  })

})

router.post('/api/create-job', async (request: Request, env: Env) => {

  let job: any = null

  try {
    job = await request.json()
  } catch {
    return new Response(JSON.stringify({ error: "invalid json" }), {
      status: 400
    })
  }

  await env.DB.prepare(`
    INSERT INTO scrape_jobs
    (drug_name,strength,quantity,zip_code,status,created_at)
    VALUES (?,?,?,?, 'pending', datetime('now'))
  `)
  .bind(
    job.drug_name,
    job.strength,
    job.quantity,
    job.zip_code
  )
  .run()

  return new Response(JSON.stringify({ success:true }), {
    headers: { 'Content-Type': 'application/json' }
  })

})

router.post('/api/retail-price', async (request: Request, env: Env) => {

  let p: any = null

  try {
    p = await request.json()
  } catch {
    return new Response(JSON.stringify({ error: "invalid json" }), {
      status: 400
    })
  }

  if (!p || !p.drug_name) {
    return new Response(JSON.stringify({ error: "invalid payload" }), {
      status: 400
    })
  }

  await env.DB.prepare(`
    INSERT INTO retail_prices (
      ndc,
      drug_name,
      strength,
      quantity,
      pharmacy_name,
      pharmacy_chain,
      cash_price,
      coupon_price,
      price_type,
      zip_code,
      latitude,
      longitude,
      source,
      scraped_at
    )
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,datetime('now'))
  `)
  .bind(
    p.ndc || null,
    p.drug_name,
    p.strength,
    p.quantity,
    p.pharmacy_name,
    p.pharmacy_chain,
    p.cash_price,
    p.coupon_price,
    p.price_type,
    p.zip_code,
    p.latitude || null,
    p.longitude || null,
    p.source
  )
  .run()

  return new Response(JSON.stringify({ success:true }), {
    headers: { 'Content-Type': 'application/json' }
  })

})

/* ---------------------------------------------------
   STRIPE CHECKOUT
--------------------------------------------------- */

router.post('/api/checkout', async (request: Request, env: Env) => {

  const { priceId, customerEmail, metadata } =
    await request.json() as any

  const stripe = new Stripe(env.STRIPE_SECRET_KEY, {
    apiVersion: '2023-10-16'
  })

  const session = await stripe.checkout.sessions.create({

    mode: 'subscription',

    payment_method_types: ['card'],

    line_items: [{
      price: priceId,
      quantity: 1
    }],

    success_url:
      'https://www.transparentrx.io/checkout/success?session_id={CHECKOUT_SESSION_ID}',

    cancel_url:
      'https://www.transparentrx.io/pricing',

    customer_email: customerEmail,

    metadata

  })

  return new Response(JSON.stringify({ url: session.url }), {
    headers: corsHeaders
  })

})

/* ---------------------------------------------------
   OPTIONS
--------------------------------------------------- */

router.options('*', () => new Response(null, { headers: corsHeaders }))

/* ---------------------------------------------------
   404
--------------------------------------------------- */

router.all('*', () => {

  return new Response('Not Found', {
    status: 404,
    headers: { 'Content-Type': 'text/plain' }
  })

})

export default {

  fetch: router.handle,

  async scheduled(event: any, env: Env, ctx: any) {

    console.log('Running scheduled tasks...')

    if (env.REFRESH_TOKEN) {

      ctx.waitUntil(importNDCFromFDA(env))

      ctx.waitUntil(refreshNDC(env))

    }

  }

}
// ─────────────────────────────────────────────
// Premium Session Status Endpoint
// GET /api/user-status
// ─────────────────────────────────────────────
export async function userStatusHandler(request: Request, env: any): Promise<Response> {

  const cookie = request.headers.get("Cookie") || ""
  const match = cookie.match(/trx_session=([^;]+)/)

  if (!match) {
    return new Response(JSON.stringify({ premium:false }), {
      headers:{ "Content-Type":"application/json" }
    })
  }

  const sessionToken = match[1]

  const user = await env.DB.prepare(`
    SELECT email, status, plan
    FROM users
    WHERE session_token = ?
  `).bind(sessionToken).first()

  if (!user) {
    return new Response(JSON.stringify({ premium:false }), {
      headers:{ "Content-Type":"application/json" }
    })
  }

  return new Response(JSON.stringify({
    premium: user.status === "active",
    email: user.email,
    plan: user.plan
  }), {
    headers:{ "Content-Type":"application/json" }
  })
}