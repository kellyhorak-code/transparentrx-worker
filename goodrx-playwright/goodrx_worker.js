require("dotenv").config()

const axios = require("axios")
const { chromium } = require("playwright")

const API = process.env.API_URL

async function scrape(page, job) {

  const { drug_name, strength, quantity, zip_code } = job

  const url =
  `https://www.goodrx.com/${drug_name}?dosage=${strength}&form=tablet&quantity=${quantity}&label_override=${drug_name}&zip_code=${zip_code}`

  console.log("Scraping:", drug_name, strength, quantity, zip_code)

  try {

    await page.goto(url, { waitUntil:"domcontentloaded", timeout:60000 })

    await page.waitForTimeout(6000)

    const raw = await page.evaluate(() => {

      const results = []

      document.querySelectorAll("div").forEach(el => {

        const text = el.innerText || ""

        const priceMatch = text.match(/\$[0-9]+\.[0-9]+/)

        if(!priceMatch) return

        if(
          text.includes("CVS") ||
          text.includes("Walgreens") ||
          text.includes("Walmart") ||
          text.includes("Costco") ||
          text.includes("Kroger") ||
          text.includes("Rite Aid") ||
          text.includes("Target")
        ){

          results.push({
            text,
            price: parseFloat(priceMatch[0].replace("$",""))
          })

        }

      })

      return results

    })

    const map = {}

    raw.forEach(r => {

      const name = r.text.split("\n")[0].trim()

      if(!map[name] || r.price < map[name]) {
        map[name] = r.price
      }

    })

    return Object.entries(map).map(([pharmacy, price]) => ({
      pharmacy,
      price
    }))

  } catch(err) {

    console.log("Scrape error:", err.message)
    return []

  }

}

async function main() {

  const browser = await chromium.launch({ headless:true })
  const page = await browser.newPage()

  console.log("GoodRx worker started")

  while(true){

    try{

      const jobRes = await axios.get(API + "/api/next-job")

      const job = jobRes.data

      if(!job){

        console.log("No jobs — sleeping")
        await new Promise(r => setTimeout(r,5000))
        continue

      }

      const prices = await scrape(page, job)

      console.log("Prices found:", prices.length)

      if(prices.length > 0){

        for(const p of prices){

          await axios.post(
            API + "/api/retail-price",
            {
              ndc: job.ndc || "00000000000",
              drug_name: job.drug_name,
              strength: job.strength,
              quantity: job.quantity,

              pharmacy_name: p.pharmacy,
              pharmacy_chain: p.pharmacy.toLowerCase(),

              cash_price: p.price,
              coupon_price: p.price,

              price_type: "goodrx_coupon",

              zip_code: job.zip_code,

              latitude: null,
              longitude: null,

              source: "goodrx"
            },
            { headers: { "Content-Type": "application/json" } }
          )

        }

      }

      await axios.post(
        API + "/api/job-complete",
        { id: job.id },
        { headers: { "Content-Type": "application/json" } }
      )

      await new Promise(r => setTimeout(r,2000))

    }catch(err){

      console.log("Worker error:", err.response?.data || err.message)

      await new Promise(r => setTimeout(r,5000))

    }

  }

}

main()
