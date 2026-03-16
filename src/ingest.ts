import { parse } from 'csv-parse/sync';

function normalizeNDC(ndc: string) {
  if (!ndc) return null;
  const digits = ndc.replace(/\D/g, '');
  return digits.padStart(11, '0');
}

function productNDC(ndc: string) {
  const normalized = normalizeNDC(ndc);
  if (!normalized) return null;
  return normalized.substring(0, 9);
}

export async function ingestFromR2(env: any, fileKey: string) {

  const object = await env.R2_BUCKET.get(fileKey);

  if (!object) {
    throw new Error('File not found in R2');
  }

  const text = await object.text();

  const records = parse(text, {
    columns: true,
    skip_empty_lines: true
  });

  const CHUNK_SIZE = 75;
  let inserted = 0;

  for (let i = 0; i < records.length; i += CHUNK_SIZE) {

    const chunk = records.slice(i, i + CHUNK_SIZE);

    const queries = chunk
      .map(r => {

        const ndc = normalizeNDC(r["NDC"]);
        const nadac = parseFloat(r["NADAC Per Unit"]);

        if (!ndc || !nadac || nadac <= 0) {
          return null;
        }

        return env.DB.prepare(`
          INSERT OR REPLACE INTO nadac_prices (
            ndc,
            product_ndc,
            ndc_description,
            nadac_per_unit,
            effective_date,
            pricing_unit,
            pharmacy_type_indicator,
            otc,
            explanation_code,
            classification,
            corresponding_generic_nadac,
            corresponding_generic_effective_date,
            as_of_date,
            last_updated
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).bind(

          ndc,
          productNDC(ndc),

          r["NDC Description"] || null,
          nadac,

          r["Effective Date"] || null,
          r["Pricing Unit"] || null,
          r["Pharmacy Type Indicator"] || null,
          r["OTC"] || null,
          r["Explanation Code"] || null,

          r["Classification for Rate Setting"] || null,

          r["Corresponding Generic Drug NADAC Per Unit"] || null,
          r["Corresponding Generic Drug Effective Date"] || null,

          r["As of Date"] || null,

          new Date().toISOString()
        );

      })
      .filter(Boolean);

    if (queries.length > 0) {
      await env.DB.batch(queries);
      inserted += queries.length;
    }

  }

  return {
    success: true,
    inserted,
    totalRows: records.length
  };

}