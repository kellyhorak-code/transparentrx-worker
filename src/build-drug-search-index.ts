export async function buildDrugSearchIndex(env:any){

  const rows = await env.DB.prepare(`
    SELECT
      ndc,
      drug_key,
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
      (ndc, display_name, drug_key, brand_name, strength, dosage_form, top_250)
      VALUES (?,?,?,?,?,?,1)
    `).bind(
      d.ndc,
      `${d.drug_key} ${d.strength}`,
      d.drug_key,
      d.brand_name,
      d.strength,
      d.dosage_form
    )

  })

  await env.DB.batch(inserts)

}