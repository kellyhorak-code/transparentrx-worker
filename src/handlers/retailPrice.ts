import { D1Database } from '@cloudflare/workers-types'

interface Env {
  DB: D1Database
}

export async function retailPriceHandler(request: Request, env: Env): Promise<Response> {
  try {
    const body = await request.json() as any

    const {
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
    } = body

    if (!drug_name || cash_price == null) {
      return json({ error: 'Missing drug_name or cash_price' }, 400)
    }

    if (typeof cash_price !== 'number' || cash_price <= 0) {
      return json({ error: 'Invalid cash_price' }, 400)
    }

    await env.DB.prepare(`
      INSERT OR IGNORE INTO retail_prices (
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
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `)
      .bind(
        ndc           || '00000000000',
        drug_name,
        strength      || null,
        quantity      || null,
        pharmacy_name || null,
        pharmacy_chain || null,
        cash_price,
        coupon_price  ?? cash_price,
        price_type    || 'coupon',
        zip_code      || null,
        latitude      ?? null,
        longitude     ?? null,
        source        || 'unknown'
      )
      .run()

    return json({ success: true })

  } catch (err: any) {
    console.error('retailPriceHandler error:', err)
    return json({ error: err.message }, 500)
  }
}

function json(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}