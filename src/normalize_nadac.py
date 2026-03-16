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

with open("nadac.csv") as infile, open("nadac_clean.csv","w",newline='') as out:

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