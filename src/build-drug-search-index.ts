export async function buildDrugSearchIndex(env:any){

  const rows = await env.DB.prepare(`
    SELECT
      ndc,
      canonical_name,
      brand_name,
      strength,
      dosage_form
    FROM canonical_drugs
    WHERE top_250 = 1
  `).all()

  const drugs = rows.results || []

  const inserts = drugs.map((d:any)=>{

    return env.DB.prepare(`
      INSERT OR REPLACE INTO drug_search
      (ndc, display_name, canonical_name, brand_name, strength, dosage_form, top_250)
      VALUES (?,?,?,?,?,?,1)
    `).bind(
      d.ndc,
      `${d.canonical_name} ${d.strength}`,
      d.canonical_name,
      d.brand_name,
      d.strength,
      d.dosage_form
    )

  })

  await env.DB.batch(inserts)

}