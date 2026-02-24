import { D1Database } from '@cloudflare/workers-types';

interface Env {
  DB: D1Database;
  FDA_API_KEY?: string;
}

interface FDAResult {
  product_ndc: string;
  generic_name?: string;
  brand_name?: string;
  active_ingredients?: Array<{ name: string; strength: string }>;
  dosage_form?: string;
  route?: string;
  labeler_name?: string;
  marketing_category?: string;
  packaging?: Array<{
    package_ndc: string;
    description: string;
  }>;
}

/**
 * Normalize NDC to 11 digits
 */
function normalizeNDC(ndc: string): string {
  // Remove any non-digit characters
  const digits = ndc.replace(/\D/g, '');
  // Pad to 11 digits
  return digits.padStart(11, '0');
}

/**
 * Fetch NDC data from openFDA with pagination
 */
async function fetchFromFDA(skip = 0, limit = 100, apiKey = ''): Promise<{ results: FDAResult[], total: number }> {
  const baseUrl = 'https://api.fda.gov/drug/ndc.json';
  const apiKeyParam = apiKey ? `&api_key=${apiKey}` : '';
  
  const url = `${baseUrl}?limit=${limit}&skip=${skip}${apiKeyParam}`;
  
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`FDA API error: ${response.status}`);
  }
  
  const data = await response.json() as any;
  return {
    results: data.results || [],
    total: data.meta?.results?.total || 0
  };
}

/**
 * Process a batch of FDA results and prepare for insertion
 */
function processBatch(results: FDAResult[]): any[] {
  const batch = [];
  
  for (const drug of results) {
    // Skip if no product_ndc
    if (!drug.product_ndc) continue;
    
    const productNdc = normalizeNDC(drug.product_ndc);
    
    // Process each package variation
    const packages = drug.packaging || [{ package_ndc: drug.product_ndc, description: '' }];
    
    for (const pkg of packages) {
      const packageNdc = normalizeNDC(pkg.package_ndc || drug.product_ndc);
      
      // Extract active ingredients
      const ingredients = drug.active_ingredients || [];
      const ingredientNames = ingredients.map(i => i.name).join('; ');
      const strengths = ingredients.map(i => i.strength).join('; ');
      
      batch.push({
        ndc_11: packageNdc,
        product_ndc: productNdc,
        proprietary_name: drug.brand_name || '',
        nonproprietary_name: drug.generic_name || '',
        active_ingredient: ingredientNames,
        strength: strengths,
        dosage_form: drug.dosage_form || '',
        route: drug.route || '',
        labeler_name: drug.labeler_name || '',
        marketing_category: drug.marketing_category || '',
        package_description: pkg.description || '',
        last_updated: new Date().toISOString()
      });
    }
  }
  
  return batch;
}

/**
 * Insert batch into D1 with conflict handling
 */
async function insertBatch(db: D1Database, batch: any[]) {
  if (batch.length === 0) return;
  
  const placeholders = batch.map(() => '(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').join(',');
  const values = batch.flatMap(item => [
    item.ndc_11,
    item.proprietary_name,
    item.nonproprietary_name,
    item.active_ingredient,
    item.strength,
    item.dosage_form,
    item.route,
    item.labeler_name,
    item.marketing_category,
    item.package_description,
    item.last_updated,
    item.product_ndc
  ]);
  
  const query = `
    INSERT OR REPLACE INTO ndc_master (
      ndc_11, proprietary_name, nonproprietary_name, 
      active_ingredient, strength, dosage_form, route,
      labeler_name, marketing_category, package_description,
      last_updated, product_ndc
    ) VALUES ${placeholders}
  `;
  
  await db.prepare(query).bind(...values).run();
}

/**
 * Main import function - called by scheduled handler
 */
export async function importNDCFromFDA(env: Env): Promise<{ imported: number; total: number }> {
  console.log('Starting FDA NDC import...');
  
  let totalImported = 0;
  let skip = 0;
  const batchSize = 100;
  const apiKey = env.FDA_API_KEY || '';
  
  try {
    // Get total count first
    const firstBatch = await fetchFromFDA(0, 1, apiKey);
    const totalRecords = firstBatch.total;
    
    console.log(`Total FDA records to process: ${totalRecords}`);
    
    // Process in batches
    while (skip < totalRecords) {
      const { results } = await fetchFromFDA(skip, batchSize, apiKey);
      
      if (results.length === 0) break;
      
      const batch = processBatch(results);
      await insertBatch(env.DB, batch);
      
      totalImported += batch.length;
      skip += batchSize;
      
      console.log(`Imported ${totalImported} package NDCs so far...`);
      
      // Small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    console.log(`FDA import complete. Imported ${totalImported} NDC packages.`);
    
    return {
      imported: totalImported,
      total: totalRecords
    };
  } catch (error) {
    console.error('FDA import failed:', error);
    throw error;
  }
}

/**
 * One-time initial import (run via curl)
 */
export async function initialImport(env: Env): Promise<Response> {
  try {
    const result = await importNDCFromFDA(env);
    
    return new Response(JSON.stringify({
      success: true,
      message: `Initial import complete`,
      imported: result.imported,
      total: result.total
    }), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error: any) {
    return new Response(JSON.stringify({
      success: false,
      error: error.message
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}