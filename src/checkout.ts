import Stripe from 'stripe'

function json(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

// Checkout session creator
export async function checkoutHandler(request: Request, env: any): Promise<Response> {
  try {
    const body = await request.json() as any
    const { plan = 'annual', email } = body

    const stripe  = new Stripe(env.STRIPE_SECRET_KEY, { apiVersion: '2023-10-16' })
    const priceId = plan === 'monthly' ? env.STRIPE_PRICE_MONTHLY : env.STRIPE_PRICE_ANNUAL

    const appUrl = 'https://www.transparentrx.io'

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      payment_method_types: ['card'],
      ...(email ? { customer_email: email } : {}),
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${appUrl}/?payment=success`,
      cancel_url:  `${appUrl}/?payment=cancel`,
      allow_promotion_codes: true,
      metadata: { plan }
    })

    return json({ url: session.url })
  } catch (err: any) {
    return json({ error: err.message }, 500)
  }
}

// Webhook handler
export async function webhookHandler(request: Request, env: any): Promise<Response> {
  const sig     = request.headers.get('stripe-signature') || ''
  const rawBody = await request.text()

  let event: Stripe.Event
  try {
    const stripe = new Stripe(env.STRIPE_SECRET_KEY, { apiVersion: '2023-10-16' })
    event = stripe.webhooks.constructEvent(rawBody, sig, env.STRIPE_WEBHOOK_SECRET)
  } catch (e: any) {
    return new Response(`Signature failed`, { status: 400 })
  }

  return new Response('OK', { status: 200 })
}
