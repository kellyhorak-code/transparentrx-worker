import fs from "fs";
import csv from "csv-parser";
import fetch from "node-fetch";

const WORKER_ENDPOINT =
  "https://transparentrx-pricing.kellybhorak.workers.dev/api/import-nadac-batch";

const AUTH_TOKEN = process.env.REFRESH_TOKEN;

const NADAC_FILE = "./nadac.csv";

const BATCH_SIZE = 500;

async function importNADAC() {

  console.log("Starting NADAC import...");

  const records = [];

  return new Promise((resolve, reject) => {

    fs.createReadStream(NADAC_FILE)
      .pipe(csv())
      .on("data", (row) => {

        const ndc = (row["NDC"] || "").replace(/\D/g, "").padStart(11, "0");

        const price = parseFloat(row["NADAC Per Unit"] || 0);

        if (!ndc || !price) return;

        records.push({
          ndc,
          ndc_description: row["NDC Description"] || "",
          nadac_per_unit: price,
          effective_date: row["Effective Date"] || "",
          pricing_unit: row["Pricing Unit"] || "EA",
          pharmacy_type: row["Pharmacy Type Indicator"] || "",
          otc: row["OTC"] || "N",
          explanation_code: row["Explanation Code"] || "",
          classification: row["Classification for Rate Setting"] || "",
          corresponding_nadac: row["Corresponding NADAC"] || null,
          corresponding_date: row["Corresponding Effective Date"] || null,
          as_of_date: row["As of Date"] || null
        });

      })
      .on("end", async () => {

        console.log(`Parsed ${records.length} records`);

        for (let i = 0; i < records.length; i += BATCH_SIZE) {

          const batch = records.slice(i, i + BATCH_SIZE);

          await fetch(WORKER_ENDPOINT, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${AUTH_TOKEN}`
            },
            body: JSON.stringify({ records: batch })
          });

          console.log(`Uploaded ${i + batch.length}`);
        }

        console.log("NADAC import complete");

        resolve();

      })
      .on("error", reject);
  });
}

importNADAC();
