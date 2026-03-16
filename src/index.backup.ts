// =========================================================
// JSON helper
// =========================================================

function json(data: any, status = 200, request?: Request) {
  const cors = request ? buildCorsHeaders(request) : {
    "Access-Control-Allow-Origin": "https://www.transparentrx.io"
  };

  return new Response(JSON.stringify(data), {
    status: status,
    headers: {
      "Content-Type": "application/json",
      ...cors
    }
  });
}
  return normalizeNDC(ndc).substring(0, 9)
// =========================================================
// SEARCH — drug name autocomplete
router.get('/api/search', async (request, env: any) => {
  try {
    const url = new URL(request.url)
    const query = (url.searchParams.get('q') || '').toLowerCase().trim()
    if (query.length < 2) return json([], 200, request)
    const result = await env.DB.prepare(`
      SELECT canonical_name, brand_name, is_brand
      FROM canonical_drugs
      WHERE LOWER(search_name) LIKE ?
      ORDER BY is_brand ASC, canonical_name ASC
      LIMIT 20
    `)
      .bind(`%${query}%`)
      .all()
    const rows = result.results || []
    const seen = new Map()
    for (const r of rows) {
      const key = r.canonical_name
      if (!seen.has(key)) {
        const display = r.is_brand
          ? `${r.brand_name} (${r.canonical_name})`
          : `${r.canonical_name} (${r.brand_name})`
        seen.set(key, {
          ndc: '',
          display,
          canonical: r.canonical_name,
          brand: r.brand_name,
          is_brand: r.is_brand
        })
      }
    }
    return json(Array.from(seen.values()), 200, request)
  } catch (err: any) {
    return json({ error: err.message }, 500, request)
})
// STRENGTHS — returns available strengths for a drug name
router.get('/api/strengths', async (request, env: any) => {
    const drug = (url.searchParams.get('drug') || '').toLowerCase().trim()
    if (!drug) return json([], 200, request)
      SELECT MIN(ndc) as ndc, MIN(display_name) as display_name, MIN(strength) as strength, MIN(dosage_form) as dosage_form
      FROM drug_search
      WHERE LOWER(display_name) LIKE ?
      GROUP BY LOWER(display_name), LOWER(strength), LOWER(dosage_form)
      ORDER BY LOWER(display_name), LOWER(strength)
      LIMIT 50
      .bind(`%${drug}%`)
    function normalizeStrength(s: string): string {
      return (s || '').toLowerCase().replace(/\/1/g,'').replace(/\s+/g,' ').trim()
    function normalizeForm(f: string): string {
      return (f || '').toLowerCase()
        .replace(/film.?coated/g,'').replace(/scored/g,'')
        .replace(/oral/g,'').replace(/tablets?/g,'tablet')
        .replace(/capsules?/g,'capsule').replace(/\s+/g,' ').trim()
    const clusterMap = new Map()
      const strength = normalizeStrength(r.strength)
      const form = normalizeForm(r.dosage_form)
      if (strength.includes(';')) continue
      const key = `${strength}|${form}`
      if (!clusterMap.has(key)) {
        clusterMap.set(key, { ndc: r.ndc, strength, form })
    const clustered = Array.from(clusterMap.values())
      .sort((a: any, b: any) => parseFloat(a.strength) - parseFloat(b.strength))
    return json(clustered.map((r: any) => ({
      ndc:      r.ndc,
      strength: r.strength,
    })), 200, request)
// TRUEPRICE ENGINE — main pricing endpoint
router.post('/api/price', async (request, env: any) => {
    const res = await priceHandler(request, env)
    const headers = new Headers(res.headers)
    Object.entries(buildCorsHeaders(request)).forEach(([k,v]) => headers.set(k,v))
    return new Response(res.body, { status: res.status, headers })
// RETAIL PRICE INGESTION — from scrapers
router.post('/api/retail-price', async (request, env: any) => {
    const res = await retailPriceHandler(request, env)
// SCRAPE JOB QUEUE
router.post('/api/create-job', async (request, env: any) => {
    const { ndc, drug_name, strength, quantity, zip_code } = await request.json()
    await env.DB.prepare(`
      INSERT INTO scrape_jobs (ndc, drug_name, strength, quantity, zip_code, status, created_at)
      VALUES (?, ?, ?, ?, ?, 'pending', datetime('now'))
      .bind(ndc || null, drug_name || null, strength || null, quantity || null, zip_code || null)
      .run()
    return json({ success: true }, 200, request)
router.get('/api/next-job', async (request, env: any) => {
  const job = await env.DB.prepare(`
    SELECT * FROM scrape_jobs
    WHERE status = 'pending'
    ORDER BY created_at
    LIMIT 1
  `).first()
  if (!job) return json(null, 200, request)
  await env.DB.prepare(`
    UPDATE scrape_jobs SET status = 'processing' WHERE id = ?
  `)
    .bind(job.id)
    .run()
  return json(job, 200, request)
router.post('/api/job-complete', async (request, env: any) => {
  const { id } = await request.json()
  if (!id) return json({ error: 'missing id' }, 400, request)
    UPDATE scrape_jobs SET status = 'complete', completed_at = datetime('now') WHERE id = ?
    .bind(id)
  return json({ success: true }, 200, request)
// NADAC IMPORT
router.post('/api/import-nadac-batch', async (request, env: any) => {
  const auth = request.headers.get('Authorization')
  if (auth !== `Bearer ${env.REFRESH_TOKEN}`) {
    return new Response('Unauthorized', { status: 401, headers: buildCorsHeaders(request) })
    const { records } = await request.json()
    const CHUNK_SIZE = 50
    for (let i = 0; i < records.length; i += CHUNK_SIZE) {
      const chunk = records.slice(i, i + CHUNK_SIZE)
      await env.DB.batch(
        chunk.map((r: any) =>
          env.DB.prepare(`
            INSERT OR REPLACE INTO nadac_prices (
              ndc, product_ndc, ndc_description, nadac_per_unit,
              effective_date, pricing_unit, pharmacy_type, otc,
              explanation_code, classification,
              corresponding_nadac, corresponding_date, as_of_date, last_updated
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).bind(
            normalizeNDC(r.ndc),
            productNDC(r.ndc),
            r.ndc_description || '',
            r.nadac_per_unit || 0,
            r.effective_date || '',
            r.pricing_unit || 'EA',
            r.pharmacy_type || '',
            r.otc || 'N',
            r.explanation_code || '',
            r.classification || '',
            r.corresponding_nadac || null,
            r.corresponding_date || null,
            r.as_of_date || null,
            new Date().toISOString()
          )
        )
      )
    return json({ success: false, error: err.message }, 500, request)
// BUILD SEARCH INDEX
router.post('/api/build-search-index', async (request, env: any) => {
    await buildDrugSearchIndex(env)
    return json({ success: true, message: 'Drug search index rebuilt' }, 200, request)
// CAPTURE OBSERVED PRICE (user-submitted)
router.post('/api/capture-price', async (request, env: any) => {
    const { ndc, pharmacy, price, quantity, zip } = await request.json()
    if (!ndc || !price) return json({ error: 'Missing price or NDC' }, 400, request)
    const normalized = normalizeNDC(ndc)
    const product = productNDC(ndc)
      INSERT INTO observed_prices (ndc, product_ndc, pharmacy, price, quantity, zip_code, source, created_at)
      VALUES (?, ?, ?, ?, ?, ?, 'manual', datetime('now'))
      .bind(normalized, product, pharmacy || null, price, quantity || null, zip || null)
// STRIPE CHECKOUT
router.post('/api/checkout', async (request, env: any) => {
    // Dynamic import to keep Stripe out of the critical path
    const { checkoutHandler } = await import('./handlers/checkout')
    const res = await checkoutHandler(request, env)
// STRIPE WEBHOOK
router.post('/api/webhook', async (request, env: any) => {
    const { webhookHandler } = await import('./handlers/webhook')
    const res = await webhookHandler(request, env)
// PHARMACY — ingest a pharmacy record into the directory
// POST /api/pharmacy
router.post('/api/pharmacy', async (request, env: any) => {
    const body = await request.json()
    const { npi, ncpdp_id, name, chain, address, city, state, zip, lat, lon, verified_at } = body
    if (!npi || !name || !chain || !zip) {
      return json({ error: 'Missing required fields: npi, name, chain, zip' }, 400, request)
      INSERT INTO pharmacies (npi, ncpdp_id, name, chain, address, city, state, zip, lat, lon, active, verified_at, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, datetime('now'))
      ON CONFLICT(npi) DO UPDATE SET
        ncpdp_id    = excluded.ncpdp_id,
        name        = excluded.name,
        chain       = excluded.chain,
        address     = excluded.address,
        city        = excluded.city,
        state       = excluded.state,
        zip         = excluded.zip,
        lat         = excluded.lat,
        lon         = excluded.lon,
        verified_at = excluded.verified_at
      .bind(
        npi, ncpdp_id || null, name, chain,
        address || null, city || null, state || null, zip,
        lat || null, lon || null,
        verified_at || new Date().toISOString()
    return json({ success: true, npi }, 200, request)
// PHARMACY — query pharmacies by ZIP list
// GET /api/pharmacies/by-zips?zips=76102,76103,76104&chains=walmart,kroger
// Used internally by the radius search flow
router.get('/api/pharmacies/by-zips', async (request, env: any) => {
    const url    = new URL(request.url)
    const zips   = (url.searchParams.get('zips') || '').split(',').filter(Boolean)
    const chains = (url.searchParams.get('chains') || '').split(',').filter(Boolean)
    if (!zips.length) return json({ pharmacies: [] }, 200, request)
    // D1 doesn't support array params — build IN clause manually
    const zipPlaceholders   = zips.map(() => '?').join(',')
    const chainFilter       = chains.length
      ? `AND chain IN (${chains.map(() => '?').join(',')})`
      : ''
      SELECT pharmacy_id, npi, ncpdp_id, name, chain, address, city, state, zip, lat, lon
      FROM pharmacies
      WHERE zip IN (${zipPlaceholders})
        AND active = 1
        ${chainFilter}
      ORDER BY chain, zip
      .bind(...zips, ...(chains.length ? chains : []))
    return json({ pharmacies: result.results || [], count: result.results?.length || 0 }, 200, request)
// PHARMACY — radius search
// GET /api/pharmacies/nearby?zip=76102&radius=25&chains=walmart,kroger
// Full flow: ZipcodeStack → nearby ZIPs → DB lookup → return pharmacies
const ZIPCODESTACK_KEY = 'zip_live_Clxcsw1etCXnSrouleRNJmcMGfkvSDEwWI81zlL7'
router.get('/api/pharmacies/nearby', async (request, env: any) => {
    const zip    = url.searchParams.get('zip')
    const radius = parseInt(url.searchParams.get('radius') || '25')
    const chains = url.searchParams.get('chains') || ''
    if (!zip) return json({ error: 'zip is required' }, 400, request)
    if (radius > 100) return json({ error: 'radius max is 100 miles' }, 400, request)
    // Step 1: Get nearby ZIPs from ZipcodeStack
    const zcResponse = await fetch(
      `https://api.zipcodestack.com/v1/radius?code=${zip}&radius=${radius}&country=us&unit=miles`,
      { headers: { apikey: ZIPCODESTACK_KEY } }
    )
    if (!zcResponse.ok) {
      return json({ error: 'ZipcodeStack lookup failed' }, 502, request)
    const zcData    = await zcResponse.json() as any
    const nearbyZips: string[] = (zcData.results || []).map((r: any) => r.code)
    const distances: Record<string, number> = {}
    for (const r of (zcData.results || [])) {
      distances[r.code] = r.distance
    // Include the user's own ZIP
    nearbyZips.push(zip)
    if (!nearbyZips.length) return json({ pharmacies: [], zip_count: 0 }, 200, request)
    // Step 2: Query pharmacy DB for those ZIPs
    const chainList   = chains.split(',').filter(Boolean)
    const zipPH       = nearbyZips.map(() => '?').join(',')
    const chainFilter = chainList.length
      ? `AND chain IN (${chainList.map(() => '?').join(',')})`
      WHERE zip IN (${zipPH})
      .bind(...nearbyZips, ...(chainList.length ? chainList : []))
    const pharmacies = (result.results || []).map((p: any) => ({
      ...p,
      distance_miles: distances[p.zip] ?? 0,
    }))
    // Sort by distance
    pharmacies.sort((a: any, b: any) => a.distance_miles - b.distance_miles)
    return json({
      zip,
      radius_miles:  radius,
      zip_count:     nearbyZips.length,
      pharmacy_count: pharmacies.length,
      pharmacies,
    }, 200, request)
// TPI INDEX — current value + delta
// GET /api/tpi-index
router.get('/api/tpi-index', async (request, env: any) => {
    // Get two most recent snapshots
      SELECT id, calculated_at, index_value, fair_value, spread, spread_pct,
             drug_count, observation_count, nadac_version
      FROM tpi_index_history
      ORDER BY calculated_at DESC
      LIMIT 2
    `).all()
    if (!rows.length) return json({ error: 'No index data yet' }, 404, request)
    const current = rows[0] as any
    const prior   = rows[1] as any
    const pointChange = prior
      ? parseFloat((current.index_value - prior.index_value).toFixed(4))
      : null
    const pctChange   = prior
      ? parseFloat(((current.index_value - prior.index_value) / prior.index_value * 100).toFixed(2))
    const direction   = pointChange === null ? null : pointChange >= 0 ? 'up' : 'down'
      current: {
        value:            current.index_value,
        fair_value:       current.fair_value,
        spread:           current.spread,
        spread_pct:       current.spread_pct,
        drug_count:       current.drug_count,
        observation_count: current.observation_count,
        calculated_at:    current.calculated_at,
        nadac_version:    current.nadac_version,
      },
      delta: {
        point_change: pointChange,
        pct_change:   pctChange,
        direction,
        since:        prior?.calculated_at ?? null,
// TPI INDEX — historical snapshots for chart
// GET /api/tpi-index/history?limit=52
router.get('/api/tpi-index/history', async (request, env: any) => {
    const url   = new URL(request.url)
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '52'), 260)
      SELECT calculated_at, index_value, fair_value, spread, spread_pct,
             drug_count, observation_count
      LIMIT ?
    `).bind(limit).all()
    const rows = (result.results || []).reverse() // chronological order for charts
    return json({ snapshots: rows, count: rows.length }, 200, request)
// TPI INDEX — record a new snapshot (called by weekly cron)
// POST /api/tpi-index/snapshot
router.post('/api/tpi-index/snapshot', async (request, env: any) => {
    const { index_value, fair_value, drug_count, observation_count, nadac_version, notes } = body
    if (!index_value || !fair_value) {
      return json({ error: 'index_value and fair_value are required' }, 400, request)
    const spread     = parseFloat((index_value - fair_value).toFixed(4))
    const spread_pct = parseFloat((spread / fair_value * 100).toFixed(2))
      INSERT INTO tpi_index_history
        (calculated_at, index_value, fair_value, spread, spread_pct,
         drug_count, observation_count, nadac_version, notes)
      VALUES (datetime('now'), ?, ?, ?, ?, ?, ?, ?, ?)
        index_value, fair_value, spread, spread_pct,
        drug_count || 0, observation_count || 0,
        nadac_version || null, notes || null
    return json({ success: true, spread, spread_pct }, 200, request)
// USAGE CHECK — check if user has reached usage limits
// GET /api/check-usage
router.get('/api/check-usage', async (request, env: any) => {
    const userId = url.searchParams.get('userId') || 'anonymous'
    
    // Get usage count for this user in the current month
      SELECT COUNT(*) as count 
      FROM usage_logs 
      WHERE user_id = ? 
      AND strftime('%Y-%m', created_at) = strftime('%Y-%m', 'now')
    `).bind(userId).first()
    const usageCount = result?.count || 0
    const limit = 10 // Free tier limit
      canUse: usageCount < limit,
      current: usageCount,
      limit: limit,
      remaining: Math.max(0, limit - usageCount)
// USAGE CONFIRM — increment usage count after successful price check
// POST /api/confirm-usage
router.post('/api/confirm-usage', async (request, env: any) => {
    const { userId = 'anonymous', ndc } = await request.json()
      INSERT INTO usage_logs (user_id, ndc, created_at)
      VALUES (?, ?, datetime('now'))
    `).bind(userId, ndc || null).run()
// EMAIL GATE — handle email collection before first use
// POST /api/auth/email-gate
router.post('/api/auth/email-gate', async (request, env: any) => {
    const { email, userId = 'anonymous' } = await request.json()
    if (!email) {
      return json({ error: 'Email is required' }, 400, request)
    // Store the email
      INSERT INTO email_logs (user_id, email, created_at)
    `).bind(userId, email).run()
    return json({ 
      success: true,
      message: 'Email captured successfully'
// CORS preflight and route handling
router.options('*', (request: Request) =>
  new Response(null, { status: 204, headers: buildCorsHeaders(request) })
)
router.get("/api/price", async (request, env:any) => {
  const url = new URL(request.url);
  const drug = url.searchParams.get("drug");
  const strength = url.searchParams.get("strength");
  const quantity = url.searchParams.get("quantity");
  const row = await env.DB.prepare(`
    SELECT observed_retail_low, observed_retail_median, observed_retail_high
    FROM retail_by_drug
    WHERE canonical_name=? AND strength=? AND quantity=?
  `).bind(drug, strength, quantity).first();
  return new Response(JSON.stringify(row || {}), {
    headers: { "Content-Type": "application/json" }
  });
});
router.all('*', (request: Request) =>
  new Response('Not Found', {
    status: 404,
    headers: buildCorsHeaders(request)
export default {
  async fetch(request: Request, env: any, ctx: any) {
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: buildCorsHeaders(request)
      })
    const response = await router.handle(request, env, ctx)
    const cors = buildCorsHeaders(request)
    const headers = new Headers(response.headers)
    Object.entries(cors).forEach(([k,v]) => headers.set(k,v))
    return new Response(response.body, {
      status: response.status,
      headers
    })
