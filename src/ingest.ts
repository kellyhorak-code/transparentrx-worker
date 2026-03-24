
export async function ingestFromR2(env: any, fileKey: string) {
  const object = await env.R2_BUCKET.get(fileKey)
  if (!object) throw new Error('File not found in R2: ' + fileKey)

  const text = await object.text()
  const lines = text.split('\n')
  if (lines.length < 2) throw new Error('CSV empty')

  const headers = lines[0].split(',').map((h: string) => h.trim().replace(/^\"|\"$/g, ''))

  const CHUNK_SIZE = 75
  let inserted = 0
  let totalRows = 0
  let batch: any[] = []

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line) continue
    totalRows++

    const values: string[] = []
    let current = ''
    let inQuotes = false
    for (const ch of line) {
      if (ch === '"') { inQuotes = !inQuotes }
      else if (ch === ',' && !inQuotes) { values.push(current.trim()); current = '' }
      else { current += ch }
    }
    values.push(current.trim())

    const r: Record<string, string> = {}
    headers.forEach((h: string, idx: number) => { r[h] = values[idx] || '' })

    const digits = (r['NDC'] || '').replace(/[^0-9]/g, '')
    const ndc = digits.padStart(11, '0')
    const nadac = parseFloat(r['NADAC Per Unit'] || '0')

    if (!ndc || ndc === '00000000000' || !nadac || nadac <= 0) continue

    batch.push(env.DB.prepare(`
      INSERT OR REPLACE INTO nadac_prices (
        ndc, product_ndc, ndc_description, nadac_per_unit,
        effective_date, pricing_unit, pharmacy_type_indicator,
        otc, explanation_code, classification,
        corresponding_generic_nadac, corresponding_generic_effective_date,
        as_of_date, last_updated
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      ndc, ndc.substring(0, 9),
      r['NDC Description'] || null, nadac,
      r['Effective Date'] || null, r['Pricing Unit'] || null,
      r['Pharmacy Type Indicator'] || null, r['OTC'] || null,
      r['Explanation Code'] || null, r['Classification for Rate Setting'] || null,
      r['Corresponding Generic Drug NADAC Per Unit'] || null,
      r['Corresponding Generic Drug Effective Date'] || null,
      r['As of Date'] || null, new Date().toISOString()
    ))

    if (batch.length >= CHUNK_SIZE) {
      await env.DB.batch(batch)
      inserted += batch.length
      batch = []
    }
  }

  if (batch.length > 0) {
    await env.DB.batch(batch)
    inserted += batch.length
  }

  return { success: true, inserted, totalRows }
}
