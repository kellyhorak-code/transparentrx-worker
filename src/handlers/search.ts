import { D1Database } from '@cloudflare/workers-types';

interface Env {
  DB: D1Database;
}

export async function searchHandler(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const query = url.searchParams.get('q');
  
  if (!query || query.length < 2) {
    return new Response(JSON.stringify([]), {
      headers: { 'Content-Type': 'application/json' }
    });
  }

  try {
    const { results } = await env.DB.prepare(`
      SELECT 
        ndc_11,
        proprietary_name,
        nonproprietary_name,
        dosage_form,
        strength
      FROM ndc_master 
      WHERE 
        proprietary_name LIKE ? OR 
        nonproprietary_name LIKE ?
      LIMIT 15
    `).bind(`%${query}%`, `%${query}%`).all();

    return new Response(JSON.stringify(results), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error: any) {  // ← Added :any here
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}