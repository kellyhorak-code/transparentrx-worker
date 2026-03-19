import { D1Database } from '@cloudflare/workers-types'

interface Env {
  DB: D1Database
}

export async function buildDrugSearchIndex(env: Env) {

  console.log("Building drug search index...")

  const { results } = await env.DB.prepare(`
    SELECT
      ndc_11,
      COALESCE(nonproprietary_name, proprietary_name) AS display_name,
      strength,
      dosage_form
    FROM ndc_master
  `).all()

  if (!results) return

  const batchSize = 100

  for (let i = 0; i < results.length; i += batchSize) {

    const chunk = results.slice(i, i + batchSize)

    await env.DB.batch(
      chunk.map((r: any) =>
        env.DB.prepare(`
          INSERT OR REPLACE INTO drug_search
          (ndc, display_name, strength, dosage_form)
          VALUES (?, ?, ?, ?)
        `).bind(
          r.ndc_11,
          r.display_name,
          r.strength,
          r.dosage_form
        )
      )
    )

  }

  console.log("Drug search index built:", results.length)

}