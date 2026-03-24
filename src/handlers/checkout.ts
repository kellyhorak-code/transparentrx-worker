export async function checkoutHandler(request: Request, env: any): Promise<Response> {
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  }

  try {
    const { priceId, customerEmail } = await request.json() as any

    if (!priceId || !customerEmail) {
      return new Response(JSON.stringify({ error: 'missing_fields' }), { status: 400, headers: { 'Content-Type': 'application/json', ...cors } })
    }

    const body = new URLSearchParams({
      'mode': 'subscription',
      'success_url': 'https://transparentrx-site.pages.dev/success.html',
      'cancel_url': 'https://transparentrx-site.pages.dev/pricing.html',
      'customer_email': customerEmail,
      'line_items[0][price]': priceId,
      'line_items[0][quantity]': '1'
    })

    const res = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${env.STRIPE_SECRET_KEY}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: body.toString()
    })

    const data = await res.json() as any

    if (!res.ok) {
      return new Response(JSON.stringify({ error: data.error?.message || 'stripe_error' }), { status: 500, headers: { 'Content-Type': 'application/json', ...cors } })
    }

    return new Response(JSON.stringify({ url: data.url }), { status: 200, headers: { 'Content-Type': 'application/json', ...cors } })

  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: { 'Content-Type': 'application/json', ...cors } })
  }
}
