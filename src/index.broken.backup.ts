export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    const cors = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type"
    };

    // CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: cors });
    }

    // Health
    if (url.pathname === "/") {
      return new Response("OK", { headers: cors });
    }

    // ---------------------------
    // SEARCH (STABLE)
    // ---------------------------
    if (url.pathname === "/api/search") {
      const q = (url.searchParams.get("q") || "").trim();

      if (!q) {
        return new Response(JSON.stringify([]), {
          headers: { "Content-Type": "application/json", ...cors }
        });
      }

      try {
        const { results } = await env.DB.prepare(`
          SELECT ndc_11, proprietary_name, nonproprietary_name
          FROM ndc_master
          WHERE proprietary_name LIKE ?
             OR nonproprietary_name LIKE ?
          LIMIT 25
        `).bind(`%${q}%`, `%${q}%`).all();

        const data = (results || []).map(r => ({
          ndc: r.ndc_11,
          name: r.proprietary_name || r.nonproprietary_name
        }));

        return new Response(JSON.stringify(data), {
          headers: { "Content-Type": "application/json", ...cors }
        });
      } catch (e) {
        return new Response(JSON.stringify({ error: e.message }), {
          status: 500,
          headers: { "Content-Type": "application/json", ...cors }
        });
      }
    }

    // ---------------------------
    // PRICE (FULL ENGINE - STABLE)
    // ---------------------------
    if (url.pathname === "/api/price" && request.method === "POST") {
      try {
        const { ndc, userPrice = 0 } = await request.json();

        // Drug name
        const drug = await env.DB.prepare(`
          SELECT proprietary_name, nonproprietary_name
          FROM ndc_master
          WHERE ndc_11 = ?
          LIMIT 1
        `).bind(ndc).first();

        // NADAC
        const nadacRow = await env.DB.prepare(`
          SELECT nadac_per_unit
          FROM nadac_prices
          WHERE ndc = ?
          LIMIT 1
        `).bind(ndc).first();

        const acq = Number(nadacRow?.nadac_per_unit || 8);

        const dispensing = 1;
        const pbm = acq * 0.15;
        const retail = acq * 0.2;

        const low = acq + dispensing;
        const mid = acq + dispensing + pbm;
        const high = acq + dispensing + pbm + retail;

        const min = Number(low.toFixed(2));
        const median = Number(mid.toFixed(2));
        const max = Number(high.toFixed(2));

        const savings = Number((userPrice - min).toFixed(2));

        const pricePosition =
          userPrice > max ? "overpaying" :
          userPrice > median ? "high" :
          "fair";

        const response = {
          drug: drug?.nonproprietary_name || drug?.proprietary_name || "Unknown",
          userPrice: Number(userPrice),

          truePrice: {
            low: min,
            mid: median,
            high: max
          },

          min,
          median,
          max,

          pricePosition,

          layers: [
            { name: "Acquisition Cost", value: Number(acq.toFixed(2)) },
            { name: "Dispensing Fee", value: dispensing },
            { name: "PBM Spread", value: Number(pbm.toFixed(2)) },
            { name: "Retail Markup", value: Number(retail.toFixed(2)) }
          ],

          arbitrage: savings > 0 ? {
            recommendedPharmacy: "Walmart",
            recommendedPrice: min,
            savings,
            savingsPercent: Number(((savings / userPrice) * 100).toFixed(1))
          } : null
        };

        return new Response(JSON.stringify(response), {
          headers: { "Content-Type": "application/json", ...cors }
        });

      } catch (e) {
        return new Response(JSON.stringify({ error: e.message }), {
          status: 500,
          headers: { "Content-Type": "application/json", ...cors }
        });
      }
    }

    return new Response("Not Found", { status: 404, headers: cors });
  }
};
