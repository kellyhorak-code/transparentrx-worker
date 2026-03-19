import csv

def normalize_ndc(ndc):
    parts = ndc.split('-')

    if len(parts) != 3:
        return None

    a,b,c = parts

    a = a.zfill(5)
    b = b.zfill(4)
    c = c.zfill(2)

    return a+b+c


input_file = "nadac-national-average-drug-acquisition-cost-03-04-2026.csv"
output_file = "nadac_clean.csv"

with open(input_file) as infile, open(output_file,"w",newline="") as out:

    reader = csv.DictReader(infile)
    fieldnames = reader.fieldnames

    writer = csv.DictWriter(out,fieldnames=fieldnames)
    writer.writeheader()

    for r in reader:

        ndc = r["ndc"]

        normalized = normalize_ndc(ndc)

        if not normalized:
            continue

        r["ndc"] = normalized

        writer.writerow(r)

print("Created nadac_clean.csv")
