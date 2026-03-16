import { Router } from 'itty-router'

export interface Env {
  DB: D1Database
  NADAC_URL: string
  CMS_URL: string
  AWP_FACTOR: string
  GEO_ENABLED: string
  ENVIRONMENT: string
  REFRESH_TOKEN?: string
}

const router = Router()

function buildCorsHeaders(request?: Request) {
  const origin =
    request?.headers.get('Origin') || 'https://www.transparentrx.io'

  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Credentials': 'true',
  }
}

function json(data: any, status = 200, request?: Request) {
  const cors = buildCorsHeaders(request)

  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...cors,
    },
  })
}

router.get('/api/health', () => {
  return new Response(
    JSON.stringify({
      status: 'ok',
      service: 'transparentrx-pricing',
    }),
    { headers: { 'Content-Type': 'application/json' } }
  )
})

router.get('/api/price', async (request: Request, env: Env) => {
  const url = new URL(request.url)

  const drug = url.searchParams.get('drug')
  const strength = url.searchParams.get('strength')
  const quantity = url.searchParams.get('quantity')

  if (!drug || !strength || !quantity) {
    return json({ error: 'missing parameters' }, 400, request)
  }

  const row = await env.DB.prepare(`
    SELECT observed_retail_low,
           observed_retail_median,
           observed_retail_high
    FROM retail_by_drug
    WHERE canonical_name = ?
AND strength = ?
ORDER BY ABS(quantity - ?)
LIMIT 1
  `)
  .bind(drug, strength, Number(quantity))
  .first()

  return json(row || {}, 200, request)
})

router.post('/api/create-job', async (request: Request, env: Env) => {
  try {
    const { ndc, drug_name, strength, quantity, zip_code } =
      await request.json()

    await env.DB.prepare(`
      INSERT INTO scrape_jobs
      (ndc, drug_name, strength, quantity, zip_code, status, created_at)
      VALUES (?, ?, ?, ?, ?, 'pending', datetime('now'))
    `)
    .bind(ndc || null, drug_name, strength, quantity, zip_code)
    .run()

    return json({ success: true }, 200, request)
  } catch (err: any) {
    return json({ error: err.message }, 500, request)
  }
})

router.get('/api/next-job', async (request: Request, env: Env) => {
  const job = await env.DB.prepare(`
    SELECT *
    FROM scrape_jobs
    WHERE status = 'pending'
    ORDER BY created_at
    LIMIT 1
  `).first()

  if (!job) return json(null, 200, request)

  await env.DB.prepare(`
    UPDATE scrape_jobs
    SET status = 'processing'
    WHERE id = ?
  `)
  .bind(job.id)
  .run()

  return json(job, 200, request)
})

router.post('/api/job-complete', async (request: Request, env: Env) => {
  const { id } = await request.json()

  if (!id) return json({ error: 'missing id' }, 400, request)

  await env.DB.prepare(`
    UPDATE scrape_jobs
    SET status = 'complete',
        completed_at = datetime('now')
    WHERE id = ?
  `)
  .bind(id)
  .run()

  return json({ success: true }, 200, request)
})

router.options('*', (request: Request) =>
  new Response(null, { status: 204, headers: buildCorsHeaders(request) })
)

router.all('*', () =>
  new Response('Not Found', { status: 404 })
)

export default {
  fetch: (request: Request, env: Env, ctx: ExecutionContext) =>
    router.handle(request, env, ctx),
}
