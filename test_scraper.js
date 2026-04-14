const scraper = require("./scraper");
const url = "https://www.trendyol.com/samsung/16gb-ddr4-3200mhz-cl22-notebook-ram-m471a2k43eb1-cwe-p-709595347";

async function test() {
  console.log("Testing scraper for:", url);
  try {
    const info = await scraper.getProductInfo(url);
    console.log("Product Info:", JSON.stringify(info, null, 2));
  } catch (err) {
    console.error("Scraper Error:", err.message);
  }
}

test();
