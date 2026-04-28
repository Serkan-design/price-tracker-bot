const scraper = require('./scraper.js');

async function test() {
  console.log("Testing Itopya...");
  const itopya = await scraper.getProductInfo("https://www.itopya.com/gskill-16gb-ripjaws-ddr4-3200mhz-cl22-notebook-ram_u14555");
  console.log("Itopya Result:", itopya);

  console.log("Testing Trendyol...");
  const trendyol = await scraper.getProductInfo("https://www.trendyol.com/apple/iphone-15-128gb-siyah-p-766731112");
  console.log("Trendyol Result:", trendyol);
  
  process.exit(0);
}

test();
