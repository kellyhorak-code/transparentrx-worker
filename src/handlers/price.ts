import { calculateTruePrice } from '../algorithms/trueprice'

export async function priceHandler(request: Request, env: any) {

  try {

    const { ndc, userPrice, zip } = await request.json()

    if (!ndc) {
      return new Response(JSON.stringify({ error: "missing ndc" }), {
        status: 400,
        headers: { "Content-Type": "application/json" }
      })
    }

    const drug = await env.DB.prepare(`
      SELECT *
      FROM ndc_master
      WHERE ndc_11 = ?
    `).bind(ndc).first()

    if (!drug) {
      return new Response(JSON.stringify({ error: "NDC not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" }
      })
    }

    const nadac = await env.DB.prepare(`
      SELECT nadac_per_unit
      FROM nadac_prices
      WHERE ndc = ?
      LIMIT 1
    `).bind(ndc).first()

    drug.nadac_price = nadac?.nadac_per_unit ?? null

    const truePrice = calculateTruePrice(drug, zip)

    const response = {
      ndc: drug.ndc_11,
      drugName: drug.proprietary_name || drug.nonproprietary_name,
      userPrice,
      truePrice
    }

    return new Response(JSON.stringify(response), {
      headers: { "Content-Type": "application/json" }
    })

  } catch (err: any) {

    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    })

  }

}
