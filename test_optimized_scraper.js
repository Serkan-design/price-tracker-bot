const scraper = require("./scraper");

async function runTest() {
  console.log("🚀 Starting Optimized Scraper Test...");
  console.log("---------------------------------------");

  const testUrls = [
    { name: "Trendyol (iPhone)", url: "https://www.trendyol.com/apple/iphone-15-128-gb-siyah-p-766723284" },
    { name: "Amazon (iPhone)", url: "https://www.amazon.com.tr/dp/B0CHXFX7DR" }
  ];

  for (const item of testUrls) {
    console.log(`🔍 Testing ${item.name}...`);
    try {
      const startTime = Date.now();
      const info = await scraper.getProductInfo(item.url);
      const duration = (Date.now() - startTime) / 1000;
      
      console.log(`✅ Result: ${info.name}`);
      console.log(`💰 Price: ${info.price} TL`);
      console.log(`⏱️  Duration: ${duration}s`);
      console.log("---------------------------------------");
    } catch (err) {
      console.error(`❌ Error testing ${item.name}:`, err.message);
    }
  }

  console.log("🏁 Test completed. Check active processes to ensure cleanup.");
  process.exit(0);
}

runTest();
