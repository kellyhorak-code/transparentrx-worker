require("dotenv").config()
const { chromium } = require("playwright")

async function run() {

  const browser = await chromium.launch({ headless: false })
  const page = await browser.newPage()

  const url =
  "https://www.goodrx.com/lisinopril?dosage=10mg&form=tablet&quantity=30&label_override=lisinopril&zip_code=90210"

  await page.goto(url)

  console.log("TITLE:", await page.title())

  await page.waitForTimeout(10000)

}

run()
