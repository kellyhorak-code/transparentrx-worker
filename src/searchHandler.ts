export async function searchHandler(request: Request, env: any): Promise<Response> {
  try {
    const url = new URL(request.url);
    const q = (url.searchParams.get("q") || "").toLowerCase().trim();

    if (!q || q.length < 2) {
      return new Response(JSON.stringify([]), {
        headers: { "Content-Type": "application/json" }
      });
    }

    const result = await env.DB.prepare(
      "SELECT DISTINCT drug_key FROM nadac_prices WHERE drug_key LIKE ? LIMIT 10"
    ).bind(`${q}%`).all();

    const formatted = (result.results || []).map((r: any) => ({
      display: r.drug_key,
      drug: r.drug_key,
      brand: null
    }));

    return new Response(JSON.stringify(formatted), {
      headers: { "Content-Type": "application/json" }
    });

  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
}
