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
  route?: string | string[];  // ← Can be string OR array!
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
  const digits = ndc.replace(/\D/g, '');
  return digits.padStart(11, '0');
}

/**
 * Safely convert any value to string for database insertion
 */
function safeString(value: any): string {
  if (value === null || value === undefined) return '';
  if (Array.isArray(value)) return value.join('; ');  // ← Convert array to semicolon-separated string
  return String(value);
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
    if (!drug.product_ndc) continue;
    
    const productNdc = normalizeNDC(drug.product_ndc);
    const packages = drug.packaging || [{ package_ndc: drug.product_ndc, description: '' }];
    
    for (const pkg of packages) {
      const packageNdc = normalizeNDC(pkg.package_ndc || drug.product_ndc);
      
      // Extract active ingredients
      const ingredients = drug.active_ingredients || [];
      const ingredientNames = ingredients.map(i => i.name).join('; ');
      const strengths = ingredients.map(i => i.strength).join('; ');
      
      // CRITICAL FIX: Convert route to string if it's an array
      const route = safeString(drug.route);
      
      batch.push({
        ndc_11: packageNdc,
        product_ndc: productNdc,
        proprietary_name: safeString(drug.brand_name),
        nonproprietary_name: safeString(drug.generic_name),
        active_ingredient: ingredientNames,
        strength: strengths,
        dosage_form: safeString(drug.dosage_form),
        route: route,  // ← Now guaranteed to be a string
        labeler_name: safeString(drug.labeler_name),
        marketing_category: safeString(drug.marketing_category),
        package_description: safeString(pkg.description),
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
    const firstBatch = await fetchFromFDA(0, 1, apiKey);
    const totalRecords = firstBatch.total;
    
    console.log(`Total FDA records to process: ${totalRecords}`);
    
    while (skip < totalRecords) {
      const { results } = await fetchFromFDA(skip, batchSize, apiKey);
      
      if (results.length === 0) break;
      
      const batch = processBatch(results);
      await insertBatch(env.DB, batch);
      
      totalImported += batch.length;
      skip += batchSize;
      
      console.log(`Imported ${totalImported} package NDCs so far...`);
      
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