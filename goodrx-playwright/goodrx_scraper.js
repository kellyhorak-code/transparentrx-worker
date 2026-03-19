require("dotenv").config()
const { chromium } = require("playwright")

async function scrapeGoodrx(drug, strength, quantity, zip) {

  const browser = await chromium.launch({ headless: false })
  const page = await browser.newPage()

  const url =
    `https://www.goodrx.com/${drug}?dosage=${strength}&form=tablet&quantity=${quantity}&label_override=${drug}&zip_code=${zip}`

  console.log("Opening:", url)

  // safer navigation mode
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 })

  // allow React components to render
  await page.waitForTimeout(5000)

  const prices = await page.evaluate(() => {

    const results = []

    const pharmacies = [
      "CVS",
      "Walgreens",
      "Walmart",
      "Costco",
      "Kroger",
      "Rite Aid"
    ]

    const elements = document.querySelectorAll("div")

    elements.forEach(el => {

      const text = el.innerText || ""

      const pharmacyMatch = pharmacies.find(p =>
        text.toLowerCase().includes(p.toLowerCase())
      )

      const priceMatch = text.match(/\$[0-9]+\.[0-9]+/)

      if (pharmacyMatch && priceMatch) {

        results.push({
          pharmacy: pharmacyMatch,
          price: priceMatch[0]
        })

      }

    })

    return results

  })

  await browser.close()

  return prices

}

async function run() {

  const results = await scrapeGoodrx(
    "lisinopril",
    "10mg",
    30,
    process.env.LOCATION
  )

  console.log(results)

}

run()
