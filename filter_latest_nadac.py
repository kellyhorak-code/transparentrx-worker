import csv
from datetime import datetime

input_file = "nadac-national-average-drug-acquisition-cost-03-04-2026.csv"
output_file = "nadac_latest.sql"

latest = {}

with open(input_file, newline='', encoding='utf-8') as infile:

    reader = csv.DictReader(infile)

    for r in reader:

        ndc = r["NDC"]
        date = datetime.strptime(r["Effective Date"], "%m/%d/%Y")

        if ndc not in latest or date > latest[ndc]["date"]:
            latest[ndc] = {
                "date": date,
                "desc": r["NDC Description"].replace("'",""),
                "price": r["NADAC Per Unit"],
                "unit": r["Pricing Unit"]
            }

with open(output_file,"w") as out:

    for ndc,v in latest.items():

        out.write(f"""INSERT OR REPLACE INTO nadac_prices
(ndc, ndc_description, nadac_per_unit, effective_date, pricing_unit)
VALUES
('{ndc}','{v['desc']}',{v['price']},'{v['date'].strftime('%Y-%m-%d')}','{v['unit']}');
""")

print("Unique NDCs:", len(latest))
