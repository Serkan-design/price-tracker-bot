const scraper = require("../scraper");

async function test() {
  const url = "https://www.trendyol.com/apple/iphone-15-128gb-siyah-p-766731112";
  console.log("🔍 Testing iPhone 15 link...");
  const info = await scraper.getProductInfo(url);
  console.log("✅ Result:", JSON.stringify(info, null, 2));
  if (info.name.includes("Kırkayak")) {
     console.error("❌ Still picking up wrong product!");
  } else {
     console.log("🚀 Success! Correct name found.");
  }
}

test();
