import { D1Database } from '@cloudflare/workers-types';

interface Env {
  DB: D1Database;
  NADAC_URL: string;
  CMS_URL: string;
}

// Helper function to normalize NDC to 11 digits
function normalizeNDC(ndc: string): string {
  const digits = ndc.replace(/\D/g, '');
  return digits.padStart(11, '0');
}

export async function refreshNDC(env: Env): Promise<void> {
  console.log('Starting NDC database refresh...');

  try {
    // 1. Fetch latest NADAC data
    const nadacResponse = await fetch(env.NADAC_URL);
    const nadacCsv = await nadacResponse.text();
    
    // Parse CSV and update database
    const rows = nadacCsv.split('\n').slice(1);
    const batchSize = 100;
    let batch: any[] = [];

    for (const row of rows) {
      if (!row.trim()) continue;
      
      const cols = row.split(',');
      if (cols.length < 2) continue;
      
      const ndc = normalizeNDC(cols[0]);
      
      batch.push({
        ndc_11: ndc,
        nadac_price: parseFloat(cols[1]),
        last_updated: new Date().toISOString()
      });

      if (batch.length >= batchSize) {
        await updateBatch(env.DB, batch);
        batch = [];
      }
    }

    if (batch.length > 0) {
      await updateBatch(env.DB, batch);
    }

    console.log('NADAC refresh complete');

  } catch (error) {
    console.error('Refresh failed:', error);
    throw error;
  }
}

async function updateBatch(db: D1Database, batch: any[]) {
  const stmt = db.prepare(`
    UPDATE ndc_master 
    SET nadac_price = ?, last_updated = ?
    WHERE ndc_11 = ?
  `);

  for (const item of batch) {
    await stmt.bind(item.nadac_price, item.last_updated, item.ndc_11).run();
  }
}