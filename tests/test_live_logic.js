require("dotenv").config();
const scraper = require("../scraper");

async function test() {
  const tests = [
    // Live Trendyol link (we'll see if it works)
    "https://www.trendyol.com/apple/iphone-15-128-gb-siyah-p-756185854", 
    // Live Amazon link
    "https://www.amazon.com.tr/dp/B0CKMCKR4Q"
  ];

  for (const url of tests) {
    console.log(`\n--- Testing: ${url} ---`);
    try {
      const info = await scraper.getProductInfo(url);
      console.log("Result:", JSON.stringify(info, null, 2));
    } catch (err) {
      console.error("Error:", err.message);
    }
  }
}

test();
