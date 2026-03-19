

// LAST SCRAPE TIMESTAMPS
if (url.pathname === "/admin/last-scrapes") {
  const rows = await env.DB.prepare(`
    SELECT
      pharmacy_chain,
      MAX(scraped_at) AS last_scrape,
      COUNT(*) AS observations
    FROM retail_prices
    GROUP BY pharmacy_chain
    ORDER BY last_scrape DESC
  `).all();

  return new Response(JSON.stringify(rows.results,null,2),{
    headers:{\"content-type\":\"application/json\"}
  });
}


// TOP 250 RETAIL COVERAGE
if (url.pathname === "/admin/top250-coverage") {

  const stats = await env.DB.prepare(`
    SELECT
      COUNT(*) AS total_drugs,
      COUNT(r.observed_retail_low) AS drugs_with_retail_data,
      ROUND(100.0 * COUNT(r.observed_retail_low) / COUNT(*),2) AS retail_coverage_pct

    FROM drug_top250 t

    LEFT JOIN retail_by_drug r
    ON t.canonical_name = r.canonical_name
  `).first();

  return new Response(JSON.stringify(stats,null,2),{
    headers:{\"content-type\":\"application/json\"}
  });
}
