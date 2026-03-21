export default {

  async fetch(request, env) {

    const url = new URL(request.url);

    const cors = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS"
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: cors });
    }

    // =========================
    // ACTIVITY FEED
    // =========================
    if (url.pathname === "/api/activity") {

      const rows = await env.DB.prepare(`
        SELECT message FROM activity_log
        ORDER BY created_at DESC
        LIMIT 10
      `).all();

      return new Response(JSON.stringify(rows.results || []), {
        headers: { "Content-Type": "application/json", ...cors }
      });
    }

    // =========================
    // INSERT PRICE (LOG EVENT)
    // =========================
    if (url.pathname === "/api/retail-price" && request.method === "POST") {

      const b = await request.json();

      await env.DB.prepare(`
        INSERT INTO retail_prices (
          ndc, drug_name, strength, quantity, zip_code,
          pharmacy_name, pharmacy_chain,
          cash_price, coupon_price,
          source, ingestion_source,
          scraped_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
      `)
      .bind(
        b.ndc,
        b.drug_name,
        b.strength,
        b.quantity,
        b.zip_code,
        b.pharmacy_name,
        b.pharmacy_chain,
        b.cash_price,
        b.coupon_price,
        b.source,
        b.ingestion_source || b.source
      )
      .run();

      // 🔥 LOG REAL EVENT
      await env.DB.prepare(`
        INSERT INTO activity_log (type, message, created_at)
        VALUES (?, ?, datetime('now'))
      `)
      .bind(
        "scrape",
        `New pricing data: ${b.drug_name} @ ${b.pharmacy_chain}`
      )
      .run();

      return new Response(JSON.stringify({ ok: true }), {
        headers: { "Content-Type": "application/json", ...cors }
      });
    }

    // =========================
    // PRICE ENGINE (LOG USER)
    // =========================
    if (url.pathname === "/api/price" && request.method === "POST") {

      const { drug_name, userPrice = 0 } = await request.json();

      const rows = await env.DB.prepare(`
        SELECT coupon_price
        FROM retail_prices
        WHERE LOWER(drug_name) = LOWER(?)
        LIMIT 1000
      `).bind(drug_name).all();

      const prices = (rows.results || [])
        .map(r => Number(r.coupon_price))
        .filter(p => p > 0)
        .sort((a,b)=>a-b);

      const n = prices.length;

      if (n < 5) {
        return new Response(JSON.stringify({ error: "insufficient_real_data" }));
      }

      const p25 = prices[Math.floor(n*0.25)];
      const p50 = prices[Math.floor(n*0.50)];
      const p75 = prices[Math.floor(n*0.75)];
      const min = prices[0];
      const max = prices[n-1];

      const below = prices.filter(p => p < userPrice).length;
      const percentile = below / n;

      const savings = Math.max(userPrice - p50, 0);

      // 🔥 LOG USER EVENT
      await env.DB.prepare(`
        INSERT INTO activity_log (type, message, created_at)
        VALUES (?, ?, datetime('now'))
      `)
      .bind(
        "user",
        `User checked ${drug_name} → potential savings $${Math.round(savings)}`
      )
      .run();

      return new Response(JSON.stringify({
        min,
        max,
        p25,
        p50,
        p75,
        truePrice: { low: p25, high: p50 },
        userPercentile: Math.round(percentile * 100),
        savings,
        sampleSize: n
      }), {
        headers: { "Content-Type": "application/json" }
      });
    }

    return new Response("OK");
  }
};
