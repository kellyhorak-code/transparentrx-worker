require("dotenv").config()

const axios = require("axios")
const scrapeGoodRx = require("./goodrx_api_scraper")

const API = process.env.API_URL

async function sleep(ms){
  return new Promise(r => setTimeout(r,ms))
}

async function main(){

  console.log("GoodRx API worker started")

  while(true){

    try{

      const jobRes = await axios.get(API + "/api/next-job")

      const job = jobRes.data

      if(!job){

        console.log("No jobs — sleeping")
        await sleep(5000)
        continue

      }

      console.log(
        "Scraping:",
        job.drug_name,
        job.strength,
        job.quantity,
        job.zip_code
      )

      const prices = await scrapeGoodRx(
        job.drug_name,
        job.strength,
        job.quantity,
        job.zip_code
      )

      console.log("Prices found:", prices.length)

      for(const p of prices){

        await axios.post(
          API + "/api/retail-price",
          {
            ndc: job.ndc || null,
            drug_name: job.drug_name,
            strength: job.strength,
            quantity: job.quantity,
            pharmacy_name: p.pharmacy_name,
            pharmacy_chain: p.pharmacy_chain,
            cash_price: p.cash_price,
            coupon_price: p.coupon_price,
            price_type: "goodrx_coupon",
            zip_code: job.zip_code,
            latitude: p.latitude,
            longitude: p.longitude,
            source: "goodrx"
          },
          { headers:{ "Content-Type":"application/json" } }
        )

      }

      await axios.post(
        API + "/api/job-complete",
        { id: job.id },
        { headers:{ "Content-Type":"application/json" } }
      )

      await sleep(process.env.REQUEST_DELAY)

    }catch(e){

      console.log("Worker error:", e.message)
      await sleep(3000)

    }

  }

}

main()
