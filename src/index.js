console.log("🚨 LIVE VERSION: CLEAN BUILD ACTIVE 🚨");
import { Router } from 'itty-router'
import { calculateTruePrice } from './algorithms/trueprice'
import { calculateDistortionScore } from './algorithms/distortion'
import { refreshNDC } from './handlers/refresh'
import { importNDCFromFDA } from './handlers/fdaImport'

const router = Router()

// ✅ GLOBAL HEADERS
const headers = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type'
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers })
}

// ✅ CORS PREFLIGHT
router.options('*', () => new Response(null, { headers }))

/* ---------------- HEALTH ---------------- */

router.get('/', (request) => json({ status: 'ok' }))

/* ---------------- TEST ---------------- */

router.get('/api/test', () => json({ ok: true }))

/* ---------------- SEARCH ---------------- */

router.get('/api/search', (request) => {
  console.log("✅ SEARCH ROUTE HIT");

  return json([
    { display: "TEST DRUG", ndc: "123" }
  ]);
});

/* ---------------- PRICE ENGINE ---------------- */

router.post('/api/price', async (request, env) => {
  try {
    const body = await request.json()

    const ndc = body.ndc
    const userPrice = Number(body.userPrice || 0)
    const dailyDosage = Number(body.dailyDosage || 1)

    if (!ndc) return json({ error: 'missing_ndc' }, 400)

    const drugRow = await env.DB.prepare(`
      SELECT * FROM ndc_master WHERE ndc_11 = ?
    `).bind(ndc).first()

    if (!drugRow) return json({ error: 'ndc_not_found' }, 404)

    const drug = { ...drugRow }

    const nadacRow = await env.DB.prepare(`
      SELECT nadac_per_unit FROM nadac_prices WHERE ndc = ?
      LIMIT 1
    `).bind(ndc).first()

    drug.nadac_price = nadacRow?.nadac_per_unit ?? 0

    const tp = calculateTruePrice(drug, body.zip || '76102')

    const monthlySavings = (userPrice - tp.trueMid) * dailyDosage

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

      truePrice: {
        low: Number(tp.trueLow.toFixed(2)),
        mid: Number(tp.trueMid.toFixed(2)),
        high: Number(tp.trueHigh.toFixed(2))
      },

      recommended: {
        pharmacy: "Lowest Observed Option",
        expectedPrice: Number(tp.trueLow.toFixed(2)),
        savings: Number(monthlySavings.toFixed(2)),
        confidence: "HIGH"
      },

      distortionScore: Number(distortionScore.toFixed(2)),
      monthlySavings: Number(monthlySavings.toFixed(2)),
      userPrice,

      insight: `This medication shows meaningful price variation across pharmacies, and selecting a lower-cost option could significantly reduce your out-of-pocket expense based on observed market pricing data.`,

      ranking: [
        { name: "Lowest Observed", price: Number(tp.trueLow.toFixed(2)) },
        { name: "Market Average", price: Number(tp.trueMid.toFixed(2)) },
        { name: "Highest Observed", price: Number(tp.trueHigh.toFixed(2)) }
      ],

      sampleSize: 3
    })

  } catch (e) {
    console.error("PRICE ERROR:", e)
    return json({ error: 'price_failed', details: e.message }, 500)
  }
})

/* ---------------- 404 ---------------- */

router.all('*', () => json({ error: 'not_found' }, 404))

/* ---------------- EXPORT ---------------- */

export default {
  fetch: async (request, env, ctx) => {
    console.log("🚨 FETCH HANDLER HIT:", new URL(request.url).pathname);

    try {
      const response = await router.handle(request, env, ctx);

      if (!response) {
        console.log("❌ NO ROUTE MATCHED");

        return new Response(JSON.stringify({
          error: "route_not_matched",
          path: new URL(request.url).pathname
        }), {
          status: 404,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*"
          }
        });
      }

      console.log("✅ ROUTE MATCHED");

      return response;

    } catch (e) {
      console.error("🔥 WORKER CRASH:", e);

      return new Response(JSON.stringify({
        error: "worker_crash",
        details: e.message
      }), {
        status: 500,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*"
        }
      });
    }
  },

  async scheduled(event, env, ctx) {
    console.log("⏰ CRON TRIGGERED");

    if (env.REFRESH_TOKEN) {
      ctx.waitUntil(importNDCFromFDA(env));
      ctx.waitUntil(refreshNDC(env));
    }
  }
};