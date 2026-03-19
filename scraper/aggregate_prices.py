import sqlite3

conn = sqlite3.connect("../transparentrx.db")
cur = conn.cursor()

cur.execute("""
INSERT OR REPLACE INTO retail_by_drug (
drug_key,
strength,
quantity,
observed_retail_low,
observed_retail_median,
observed_retail_high,
pharmacy_count,
observations
)
SELECT
drug_key,
strength,
quantity,
MIN(coupon_price),
AVG(coupon_price),
MAX(coupon_price),
COUNT(DISTINCT pharmacy_chain),
COUNT(*)
FROM retail_prices
WHERE drug_key IS NOT NULL
GROUP BY drug_key,strength,quantity
""")

conn.commit()
conn.close()
