import { Router } from 'itty-router';
import Stripe from 'stripe';
import { calculateTruePrice } from './algorithms/trueprice';
import { calculateDistortionScore } from './algorithms/distortion';
import { refreshNDC } from './handlers/refresh';
import { importNDCFromFDA, initialImport } from './handlers/fdaImport';
import { D1Database } from '@cloudflare/workers-types';

interface Env {
  DB: D1Database;
  STRIPE_SECRET_KEY: string;
  STRIPE_WEBHOOK_SECRET: string;
  REFRESH_TOKEN?: string;
  FDA_API_KEY?: string;
  NADAC_URL: string;
  CMS_URL: string;
  AWP_FACTOR: string;
  GEO_ENABLED: string;
  ENVIRONMENT?: string;
}

const router = Router();

const corsHeaders = {
  'Access-Control-Allow-Origin': 'https://www.transparentrx.io',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

// Health check endpoint
router.get('/', async () => {
  return new Response('TransparentRX API is running', {
    status: 200,
    headers: { 'Content-Type': 'text/plain' }
  });
});

// Drug search endpoint
router.get('/api/search', async (request: Request, env: Env) => {
  try {
    const url = new URL(request.url);
    const query = url.searchParams.get('q');
    
    if (!query || query.length < 2) {
      return new Response(JSON.stringify([]), { 
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
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
      WHERE 
        proprietary_name LIKE ? OR 
        nonproprietary_name LIKE ?
      LIMIT 15
    `).bind(`%${query}%`, `%${query}%`).all();

    const formatted = (results || []).map((row: any) => ({
      ndc: row.ndc_11,
      display: row.proprietary_name || row.nonproprietary_name,
      generic: row.nonproprietary_name,
      form: row.dosage_form,
      strength: row.strength,
      manufacturer: row.labeler_name
    }));

    return new Response(JSON.stringify(formatted), {
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  }
});

// TruePrice endpoint
router.post('/api/price', async (request: Request, env: Env) => {
  try {
    const { ndc, userPrice, zip, dailyDosage } = await request.json() as any;
    
    const drug = await env.DB.prepare(`
      SELECT * FROM ndc_master WHERE ndc_11 = ?
    `).bind(ndc).first();

    if (!drug) {
      return new Response(JSON.stringify({ error: 'NDC not found' }), {
        status: 404,
        headers: corsHeaders
      });
    }

    const truePrice = calculateTruePrice(drug, zip);
    const monthlySavings = (userPrice - truePrice.trueMid) * (dailyDosage || 1);
    
    const distortionScore = calculateDistortionScore({
      userPrice,
      trueMid: truePrice.trueMid,
      trueLow: truePrice.trueLow,
      trueHigh: truePrice.trueHigh,
      dataFreshness: drug.last_updated ? 0.9 : 0.5
    });

    const subscriptionCost = 12;
    const monthsToBreakeven = monthlySavings > 0 
      ? (subscriptionCost / monthlySavings).toFixed(1)
      : null;
    const annualNetGain = monthlySavings > 0 
      ? (monthlySavings * 12) - (subscriptionCost * 12)
      : null;

    const response = {
      ndc: drug.ndc_11,
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
        monthsToBreakeven: monthsToBreakeven ? Number(monthsToBreakeven) : null,
        annualNetGain: annualNetGain ? Number(annualNetGain.toFixed(2)) : null
      },
      sources: ['NADAC', 'CMS Part D', 'AWP'],
      lastUpdated: drug.last_updated
    };

    return new Response(JSON.stringify(response), {
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  }
});

// Checkout endpoint
router.post('/api/checkout', async (request: Request, env: Env) => {
  try {
    const { priceId, customerEmail, metadata } = await request.json() as any;
    
    const stripe = new Stripe(env.STRIPE_SECRET_KEY, {
      apiVersion: '2023-10-16'
    });

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [{
        price: priceId,
        quantity: 1
      }],
      success_url: 'https://www.transparentrx.io/checkout/success?session_id={CHECKOUT_SESSION_ID}',
      cancel_url: 'https://www.transparentrx.io/pricing',
      customer_email: customerEmail,
      metadata
    });

    return new Response(JSON.stringify({ url: session.url }), {
      headers: corsHeaders
    });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: corsHeaders
    });
  }
});

// Stripe webhook endpoint
router.post('/api/webhook', async (request: Request, env: Env) => {
  try {
    const body = await request.text();
    const signature = request.headers.get('stripe-signature') || '';
    
    const stripe = new Stripe(env.STRIPE_SECRET_KEY, {
      apiVersion: '2023-10-16'
    });

    const event = stripe.webhooks.constructEvent(
      body,
      signature,
      env.STRIPE_WEBHOOK_SECRET
    );

    switch (event.type) {
      case 'checkout.session.completed':
        console.log('Checkout completed:', (event.data.object as any).id);
        break;
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted':
        console.log('Subscription updated:', (event.data.object as any).id);
        break;
    }

    return new Response(JSON.stringify({ received: true }), {
      headers: corsHeaders
    });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: corsHeaders
    });
  }
});

// FDA Import endpoint (one-time initial import)
router.post('/api/import-fda', async (request: Request, env: Env) => {
  const auth = request.headers.get('Authorization');
  if (auth !== `Bearer ${env.REFRESH_TOKEN}`) {
    return new Response('Unauthorized', { status: 401 });
  }
  return await initialImport(env);
});

// NADAC Refresh endpoint
router.post('/api/refresh', async (request: Request, env: Env) => {
  if (!env.REFRESH_TOKEN) {
    return new Response('Refresh endpoint not configured - set REFRESH_TOKEN to enable', { 
      status: 501,
      headers: corsHeaders
    });
  }
  
  const auth = request.headers.get('Authorization');
  if (auth !== `Bearer ${env.REFRESH_TOKEN}`) {
    return new Response('Unauthorized', { status: 401 });
  }

  await refreshNDC(env);
  return new Response('Refresh complete', {
    headers: corsHeaders
  });
});

// Handle OPTIONS for CORS
router.options('*', () => new Response(null, { headers: corsHeaders }));

// 404 handler
router.all('*', () => {
  return new Response('Not Found', { 
    status: 404,
    headers: { 'Content-Type': 'text/plain' }
  });
});

export default {
  fetch: router.handle,
  
  async scheduled(event: any, env: Env, ctx: any) {
    console.log('Running scheduled tasks...');
    
    if (env.REFRESH_TOKEN) {
      // Run FDA import monthly (first of month)
      ctx.waitUntil(importNDCFromFDA(env));
      
      // Run NADAC refresh as well
      ctx.waitUntil(refreshNDC(env));
    }
  }
};