import { Router } from 'itty-router'
import Stripe from 'stripe'
import { calculateTruePrice } from './algorithms/trueprice'
import { calculateDistortionScore } from './algorithms/distortion'
import { refreshNDC } from './handlers/refresh'
import { importNDCFromFDA, initialImport } from './handlers/fdaImport'
import { D1Database } from '@cloudflare/workers-types'

interface Env {
  DB: D1Database
  STRIPE_SECRET_KEY: string
  STRIPE_WEBHOOK_SECRET: string
  REFRESH_TOKEN?: string
  FDA_API_KEY?: string
  NADAC_URL: string
  CMS_URL: string
  AWP_FACTOR: string
  GEO_ENABLED: string
  ENVIRONMENT?: string
}

const router = Router()

const corsHeaders = {
  'Access-Control-Allow-Origin': 'https://www.transparentrx.io',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type'
}
    ORDER BY strength
    LIMIT 25
  ``).bind(`%${drug}%`, `%${drug}%`).all()

  const formatted = (results || []).map((row:any)=>({
    ndc: row.ndc_11,
    strength: row.strength + " — " + row.dosage_form
  }))

  return new Response(JSON.stringify(formatted),{
    headers:{ "Content-Type":"application/json" }
  })

})

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
        proprietary_name LIKE ?
        OR nonproprietary_name LIKE ?
      GROUP BY strength, dosage_form LIMIT 15
    ``).bind(`%${query}%`, `%${query}%`).all()
    const formatted = (results || []).map((row: any) => ({
      ndc: row.ndc_11,
      display: row.proprietary_name || row.nonproprietary_name,
      generic: row.nonproprietary_name,
      form: row.dosage_form,
      strength: row.strength,
      manufacturer: row.labeler_name
    }))
    return new Response(JSON.stringify(formatted), {
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    })
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
  }
   TRUE PRICE CALCULATION
router.post('/api/price', async (request: Request, env: Env) => {
    const { ndc, userPrice, zip, dailyDosage } = await request.json() as any
    const drug = await env.DB.prepare(`
      SELECT *
      WHERE ndc_11 = ?
    ``).bind(ndc).first()
    if (!drug) {
      return new Response(JSON.stringify({ error: 'NDC not found' }), {
        status: 404,
        headers: corsHeaders
    const nadacRow = await env.DB.prepare(`
      SELECT nadac_per_unit
      FROM nadac_prices
      WHERE ndc = ?
      LIMIT 1
    drug.nadac_price = nadacRow?.nadac_per_unit ?? null
    const truePrice = calculateTruePrice(drug, zip)
    const monthlySavings =
      (userPrice - truePrice.trueMid) * (dailyDosage || 1)
    const distortionScore = calculateDistortionScore({
      userPrice,
      trueMid: truePrice.trueMid,
      trueLow: truePrice.trueLow,
      trueHigh: truePrice.trueHigh,
      dataFreshness: drug.last_updated ? 0.9 : 0.5
    const subscriptionCost = 12
    const monthsToBreakeven =
      monthlySavings > 0
        ? (subscriptionCost / monthlySavings).toFixed(1)
        : null
    const annualNetGain =
        ? (monthlySavings * 12) - (subscriptionCost * 12)
    const response = {
      ndc: drug.ndc_11,
      drugName: drug.proprietary_name || drug.nonproprietary_name,
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
        monthsToBreakeven:
          monthsToBreakeven ? Number(monthsToBreakeven) : null,
        annualNetGain:
          annualNetGain ? Number(annualNetGain.toFixed(2)) : null
      sources: ['NADAC', 'CMS Part D', 'AWP'],
      lastUpdated: drug.last_updated
    return new Response(JSON.stringify(response), {
   SCRAPER JOB QUEUE
router.get('/api/next-job', async (request: Request, env: Env) => {
  const job = await env.DB.prepare(`
    SELECT *
    FROM scrape_jobs
    WHERE status='pending'
    ORDER BY id
    LIMIT 1
  `).first()
  if (!job) {
    return new Response(JSON.stringify(null), {
      headers: { 'Content-Type': 'application/json' }
  await env.DB.prepare(`
    UPDATE scrape_jobs
    SET status='processing'
    WHERE id=?
  `)
  .bind(job.id)
  .run()
  return new Response(JSON.stringify(job), {
    headers: { 'Content-Type': 'application/json' }
router.post('/api/job-complete', async (request: Request, env: Env) => {
  let body: any = null
    body = await request.json()
  } catch {
    return new Response(JSON.stringify({ error: "invalid json" }), {
      status: 400,
  if (!body || !body.id) {
    return new Response(JSON.stringify({ error: "missing id" }), {
    SET status='complete',
        completed_at=datetime('now')
  .bind(body.id)
  return new Response(JSON.stringify({ success:true }), {
router.post('/api/create-job', async (request: Request, env: Env) => {
  let job: any = null
    job = await request.json()
      status: 400
    INSERT INTO scrape_jobs
    (drug_name,strength,quantity,zip_code,status,created_at)
    VALUES (?,?,?,?, 'pending', datetime('now'))
  .bind(
    job.drug_name,
    job.strength,
    job.quantity,
    job.zip_code
  )
router.post('/api/retail-price', async (request: Request, env: Env) => {
  let p: any = null
    p = await request.json()
  if (!p || !p.drug_name) {
    return new Response(JSON.stringify({ error: "invalid payload" }), {
    INSERT INTO retail_prices (
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
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,datetime('now'))
    p.ndc || null,
    p.drug_name,
    p.strength,
    p.quantity,
    p.pharmacy_name,
    p.pharmacy_chain,
    p.cash_price,
    p.coupon_price,
    p.price_type,
    p.zip_code,
    p.latitude || null,
    p.longitude || null,
    p.source
   STRIPE CHECKOUT
router.get("/api/admin/coverage", async (request: Request, env: Env) => {
  const tracked = await env.DB.prepare(`
    SELECT COUNT(DISTINCT ndc_11) as count
    FROM ndc_master
  const priced = await env.DB.prepare(`
    SELECT COUNT(DISTINCT ndc) as count
    FROM retail_prices
  const observations = await env.DB.prepare(`
    SELECT COUNT(*) as count
  const trackedCount = tracked?.count || 0
  const pricedCount = priced?.count || 0
  const coverage = trackedCount > 0
    ? ((pricedCount / trackedCount) * 100).toFixed(1)
    : 0
  return new Response(JSON.stringify({
    top250Tracked: trackedCount,
    drugsWithRetailPrices: pricedCount,
    totalRetailObservations: observations?.count || 0,
    transdexCoverage: Number(coverage)
  }), {
    headers: { "Content-Type": "application/json" }
router.get("/api/admin/stats", async (request: Request, env: Env) => {
  const users = await env.DB.prepare(`
    SELECT COUNT(*) as count FROM users
  const active = await env.DB.prepare(`
    SELECT COUNT(*) as count FROM users WHERE status="active"
  const pastDue = await env.DB.prepare(`
    SELECT COUNT(*) as count FROM users WHERE status="past_due"
  const magicLinks = await env.DB.prepare(`
    SELECT COUNT(*) as count FROM magic_links
    totalUsers: users?.count || 0,
    activeSubscriptions: active?.count || 0,
    pastDueSubscriptions: pastDue?.count || 0,
    magicLinksIssued: magicLinks?.count || 0
router.get("/api/magic-login", async (request: Request, env: Env) => {
  const url = new URL(request.url)
  const token = url.searchParams.get("token")
  if (!token) {
    return new Response("Invalid token", { status: 400 })
  const link = await env.DB.prepare(`
    SELECT email, expires_at, used
    FROM magic_links
    WHERE token = ?
  ``).bind(token).first()
  if (!link) {
    return new Response("Invalid login link", { status: 400 })
  if (link.used) {
    return new Response("Link already used", { status: 400 })
  const now = Date.now()
  const expires = new Date(link.expires_at).getTime()
  if (now > expires) {
    return new Response("Link expired", { status: 400 })
  const sessionToken = crypto.randomUUID()
    UPDATE users
    SET session_token = ?
    WHERE email = ?
  ``).bind(sessionToken, link.email).run()
    UPDATE magic_links
    SET used = 1
  ``).bind(token).run()
  return new Response(null,{
    status:302,
    headers:{
      "Set-Cookie": `trx_session=${sessionToken}; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=2592000`,
      "Location":"https://www.transparentrx.io"
router.get("/api/user-status", userStatusHandler)
router.post('/api/checkout', async (request: Request, env: Env) => {
  const { priceId, customerEmail, metadata } =
    await request.json() as any
  const stripe = new Stripe(env.STRIPE_SECRET_KEY, {
    apiVersion: '2023-10-16'
  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    payment_method_types: ['card'],
    line_items: [{
      price: priceId,
      quantity: 1
    }],
    success_url:
      'https://www.transparentrx.io/checkout/success?session_id={CHECKOUT_SESSION_ID}',
    cancel_url:
      'https://www.transparentrx.io/pricing',
    customer_email: customerEmail,
    metadata
  return new Response(JSON.stringify({ url: session.url }), {
    headers: corsHeaders
   OPTIONS
router.options('*', () => new Response(null, { headers: corsHeaders }))
   404
router.all('*', () => {
  return new Response('Not Found', {
    status: 404,
export default {
  fetch: router.handle,
  async scheduled(event: any, env: Env, ctx: any) {
    console.log('Running scheduled tasks...')
    if (env.REFRESH_TOKEN) {
      ctx.waitUntil(importNDCFromFDA(env))
      ctx.waitUntil(refreshNDC(env))
// ─────────────────────────────────────────────
// Premium Session Status Endpoint
// GET /api/user-status
export async function userStatusHandler(request: Request, env: any): Promise<Response> {
  const cookie = request.headers.get("Cookie") || ""
  const match = cookie.match(/trx_session=([^;]+)/)
  if (!match) {
    return new Response(JSON.stringify({ premium:false }), {
      headers:{ "Content-Type":"application/json" }
  const sessionToken = match[1]
  const user = await env.DB.prepare(`
    SELECT email, status, plan
    FROM users
    WHERE session_token = ?
  ``).bind(sessionToken).first()
  if (!user) {
    premium: user.status === "active",
    email: user.email,
    plan: user.plan
    headers:{ "Content-Type":"application/json" }
