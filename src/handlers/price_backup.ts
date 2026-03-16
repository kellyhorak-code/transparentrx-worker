export async function priceHandler(request: Request, env: any) {

  try {

    const body = await request.json() as any

    const ndc = (body.ndc || '').replace(/\D/g,'').padStart(11,'0')
    const quantity = parseFloat(body.quantity || 30)

    if (!ndc) {
      return new Response(JSON.stringify({ error:"NDC required" }), { status:400 })
    }

    /* ===============================
       Acquisition Cost (NADAC)
    =============================== */

    const nadacRow = await env.DB.prepare(`
      SELECT nadac_per_unit
      FROM nadac_prices
      WHERE ndc = ?
      ORDER BY effective_date DESC
      LIMIT 1
    `).bind(ndc).first()

    const nadac = nadacRow?.nadac_per_unit
      ? parseFloat(nadacRow.nadac_per_unit)
      : 0

    const acquisition_cost = nadac * quantity

    /* ===============================
       Transdex Market Distribution
    =============================== */

    const transdex = await env.DB.prepare(`
      SELECT
        market_low,
        true_price,
        market_high,
        retail_price,
        sample_size,
        confidence
      FROM transdex_index
      WHERE ndc = ?
      LIMIT 1
    `).bind(ndc).first()

    const sample_size = transdex?.sample_size || 0

    const hasMarketData = sample_size > 0

    const market_low = transdex?.market_low ?? null
    const market_high = transdex?.market_high ?? null
    const retail_price = transdex?.retail_price ?? null

    let true_price = transdex?.true_price ?? null

    /* ===============================
       Fallback TruePrice
       (if index missing)
    =============================== */

    if (!true_price && acquisition_cost > 0) {
      true_price = acquisition_cost * 2.5
    }

    /* ===============================
       Confidence
    =============================== */

    let confidence = "low"

    if (transdex?.confidence) {
      confidence = transdex.confidence
    } else {

      if (sample_size >= 10) confidence = "high"
      else if (sample_size >= 4) confidence = "moderate"

    }

    /* ===============================
       Build Response
    =============================== */

    const response:any = {

      ndc,
      quantity,

      acquisition_cost,
      true_price,

      market_samples: sample_size,
      confidence

    }

    if (hasMarketData) {

      if (market_low !== null)
        response.market_low = market_low

      if (market_high !== null)
        response.market_high = market_high

      if (retail_price !== null)
        response.retail_price = retail_price

    }

    return new Response(JSON.stringify(response),{
      status:200,
      headers:{ "Content-Type":"application/json" }
    })

  } catch(err:any){

    return new Response(JSON.stringify({
      error:err.message
    }),{
      status:500,
      headers:{ "Content-Type":"application/json" }
    })

  }

}