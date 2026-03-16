import { D1Database } from '@cloudflare/workers-types'

interface Env {
  DB: D1Database
  STRIPE_WEBHOOK_SECRET: string
}

export async function webhookHandler(request: Request, env: Env): Promise<Response> {
  try {
    const signature = request.headers.get('stripe-signature')
    if (!signature) {
      return new Response('No signature', { status: 400 })
    }

    const body = await request.text()
    
    // For now, just log the event type
    // We'll add Stripe verification next
    console.log('Webhook received:', body.substring(0, 200))

    return new Response('ok', { status: 200 })
  } catch (error: any) {
    console.error('Webhook error:', error.message)
    return new Response(error.message, { status: 500 })
  }
}
