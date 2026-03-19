require("dotenv").config()

const axios = require("axios")

async function scrapeGoodRx(drug, strength, quantity, zip){

  const url = "https://www.goodrx.com/api/prices"

  try{

    const res = await axios.get(url,{
      params:{
        drug,
        dosage: strength,
        form: "tablet",
        quantity,
        zip_code: zip
      },
      headers:{
        "User-Agent":"Mozilla/5.0"
      },
      timeout:15000
    })

    const pharmacies = res.data?.pharmacies || []

    return pharmacies.map(p => ({
      pharmacy_name: p.name,
      pharmacy_chain: (p.name || "").toLowerCase(),
      cash_price: p.price,
      coupon_price: p.price,
      latitude: p.lat || null,
      longitude: p.lng || null
    }))

  }catch(e){

    console.log("GoodRx API error:", e.message)
    return []

  }

}

module.exports = scrapeGoodRx
