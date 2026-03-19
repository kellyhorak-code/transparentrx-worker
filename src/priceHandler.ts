export async function priceHandler(request: Request, env: any): Promise<Response> {
  try {
    const { drug, userPrice, dailyDosage = 1 } = await request.json()

    const key = drug.toLowerCase().trim()

    // ─────────────────────────────
    // 1️⃣ MULTI-NDC DISTRIBUTION
    // ─────────────────────────────
    const result = await env.DB.prepare(
      "SELECT price_per_unit FROM nadac_prices WHERE drug_key = ?"
    ).bind(key).all()

    if (!result.results.length) {
      return new Response(JSON.stringify({ error: "No pricing data" }), { status: 404 })
    }

    const prices = result.results.map((r: any) => r.price_per_unit)

    const lowUnit = Math.min(...prices)
    const highUnit = Math.max(...prices)
    const avgUnit = prices.reduce((a,b)=>a+b,0) / prices.length

    // Monthly calc
    const low = lowUnit * dailyDosage * 30
    const mid = avgUnit * dailyDosage * 30
    const high = highUnit * dailyDosage * 30

    // ─────────────────────────────
    // 2️⃣ TRANDEX MODEL
    // ─────────────────────────────
    const transdexPrice = mid * 1.6
    const retailCeiling = high * 1.8

    // ─────────────────────────────
    // 3️⃣ PBM SPREAD ESTIMATE
    // ─────────────────────────────
    const pbmSpread = transdexPrice * 0.18
    const pharmacyMargin = transdexPrice * 0.12

    // ─────────────────────────────
    // 4️⃣ DISTORTION
    // ─────────────────────────────
    const distortionScore = userPrice
      ? Math.min(100, Math.round(((userPrice - transdexPrice) / transdexPrice) * 100))
      : 0

    const monthlySavings = userPrice
      ? (transdexPrice - userPrice)
      : 0

    // ─────────────────────────────
    // 5️⃣ MOCK RETAIL (NEXT: REAL DATA)
    // ─────────────────────────────
    const pharmacyPrices = [
      { name: "CVS", price: +(high * 1.1).toFixed(2) },
      { name: "Walgreens", price: +(high * 1.0).toFixed(2) },
      { name: "Walmart", price: +(mid * 0.9).toFixed(2) },
      { name: "Costco", price: +(mid * 0.8).toFixed(2) }
    ]

    return new Response(JSON.stringify({
      acquisitionCost: +mid.toFixed(2),
      transdexPrice: +transdexPrice.toFixed(2),
      retailCeiling: +retailCeiling.toFixed(2),

      truePrice: {
        low: +low.toFixed(2),
        mid: +mid.toFixed(2),
        high: +high.toFixed(2)
      },

      pbmSpread: +pbmSpread.toFixed(2),
      pharmacyMargin: +pharmacyMargin.toFixed(2),

      pharmacyPrices,

      distortionScore,
      monthlySavings,

      userPrice
    }), {
      headers: { "Content-Type": "application/json" }
    })

  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 })
  }
}
