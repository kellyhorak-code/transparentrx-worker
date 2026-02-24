import Stripe from 'stripe';

interface Env {
  STRIPE_SECRET_KEY: string;
  STRIPE_WEBHOOK_SECRET: string;
}

export async function webhookHandler(request: Request, env: Env): Promise<Response> {
  try {
    const body = await request.text();
    const signature = request.headers.get('stripe-signature');
    
    const stripe = new Stripe(env.STRIPE_SECRET_KEY, {
      apiVersion: '2023-10-16'
    });

    let event;
    try {
      event = stripe.webhooks.constructEvent(
        body,
        signature || '',
        env.STRIPE_WEBHOOK_SECRET
      );
    } catch (err: any) {
      return new Response(`Webhook Error: ${err.message}`, { status: 400 });
    }

    // Handle different event types
    switch (event.type) {
      case 'checkout.session.completed':
        console.log('Checkout completed:', event.data.object.id);
        break;
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted':
        console.log('Subscription updated:', event.data.object.id);
        break;
      default:
        console.log(`Unhandled event type: ${event.type}`);
    }

    return new Response(JSON.stringify({ received: true }), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}