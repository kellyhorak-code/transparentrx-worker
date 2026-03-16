export async function runScheduler(env:any) {

  /* ===============================
     NADAC refresh
  =============================== */

  const nadacURL = env.NADAC_URL

  const res = await fetch(nadacURL)

  if (res.ok) {

    const csv = await res.text()

    const rows = csv.split("\n")

    const batch:any[] = []

    for (const row of rows.slice(1)) {

      const cols = row.split(",")

      const ndc = cols[0]?.replace(/\D/g,'').padStart(11,'0')
      const price = parseFloat(cols[3])

      if (!ndc || !price) continue

      batch.push(
        env.DB.prepare(`
          INSERT OR REPLACE INTO nadac_prices
          (ndc,nadac_per_unit,effective_date)
          VALUES (?,?,datetime('now'))
        `).bind(ndc,price)
      )

      if (batch.length > 500) {
        await env.DB.batch(batch)
        batch.length = 0
      }

    }

    if (batch.length) await env.DB.batch(batch)

  }


  /* ===============================
     Market price aggregation
     (scraper results → market band)
  =============================== */

  const marketRows = await env.DB.prepare(`
    SELECT
      ndc,
      MIN(price) as market_low,
      MAX(price) as market_high,
      AVG(price) as market_avg,
      COUNT(*) as sample_size
    FROM market_prices
    GROUP BY ndc
  `).all()

  const marketResults = marketRows.results || []


  /* ===============================
     Transdex recalibration
  =============================== */

  const recalibrationBatch:any[] = []

  for (const row of marketResults) {

    const ndc = row.ndc
    const market_low = row.market_low
    const market_high = row.market_high
    const market_avg = row.market_avg
    const sample_size = row.sample_size

    const nadacRow = await env.DB.prepare(`
      SELECT nadac_per_unit
      FROM nadac_prices
      WHERE ndc = ?
    `).bind(ndc).first()

    if (!nadacRow) continue

    const acquisition_cost = parseFloat(nadacRow.nadac_per_unit)

    if (!acquisition_cost) continue

    /* =================================
       True price model
    ================================= */

    const markup = 1.35

    const true_price = acquisition_cost * markup


    /* =================================
       Confidence scoring
    ================================= */

    let confidence = "Low"

    if (sample_size >= 10) confidence = "High"
    else if (sample_size >= 4) confidence = "Moderate"


    /* =================================
       Insert Transdex record
    ================================= */

    recalibrationBatch.push(
      env.DB.prepare(`
        INSERT OR REPLACE INTO transdex_index
        (
          ndc,
          acquisition_cost,
          market_low,
          true_price,
          market_high,
          retail_price,
          sample_size,
          confidence,
          updated_at
        )
        VALUES (?,?,?,?,?,?,?,?,datetime('now'))
      `).bind(
        ndc,
        acquisition_cost,
        market_low,
        true_price,
        market_high,
        market_high,
        sample_size,
        confidence
      )
    )


    if (recalibrationBatch.length > 500) {

      await env.DB.batch(recalibrationBatch)

      recalibrationBatch.length = 0

    }

  }

  if (recalibrationBatch.length) {

    await env.DB.batch(recalibrationBatch)

  }


  /* ===============================
     Scheduler run log
  =============================== */

  await env.DB.prepare(`
    INSERT INTO scheduler_runs
    (run_time,task)
    VALUES (datetime('now'),'weekly_refresh')
  `).run()

}