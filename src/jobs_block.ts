
/* ---------------------------------------------------
   SCRAPER JOB QUEUE
--------------------------------------------------- */

router.get('/api/next-job', async (request: Request, env: Env) => {

  const job = await env.DB.prepare(
    "SELECT * FROM scrape_jobs WHERE status = 'pending' ORDER BY created_at LIMIT 1"
  ).first()

  if (!job) {
    return new Response(JSON.stringify(null), {
      headers: { "Content-Type": "application/json" }
    })
  }

  await env.DB.prepare(
    "UPDATE scrape_jobs SET status = 'running' WHERE id = ?"
  ).bind(job.id).run()

  return new Response(JSON.stringify(job), {
    headers: { "Content-Type": "application/json" }
  })

})


router.post('/api/job-complete', async (request: Request, env: Env) => {

  const body = await request.json()

  await env.DB.prepare(
    "UPDATE scrape_jobs SET status = 'done' WHERE id = ?"
  ).bind(body.id).run()

  return new Response(JSON.stringify({ success: true }), {
    headers: { "Content-Type": "application/json" }
  })

})

