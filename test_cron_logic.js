const db = require("./db");
const scraper = require("./scraper");

async function debugCron() {
  console.log("🛠️  Starting Manual Cron Debug...");
  try {
    const products = await db.getAllActiveProducts();
    console.log(`📋 Found ${products.length} active products.`);

    if (products.length === 0) {
      console.log("⚠️  No active products found in DB.");
      return;
    }

    // Sort by lastCheck
    products.sort((a, b) => {
      const ta = a.lastCheck ? new Date(a.lastCheck).getTime() : 0;
      const tb = b.lastCheck ? new Date(b.lastCheck).getTime() : 0;
      return ta - tb;
    });

    for (let product of products) {
      console.log(`🔍 Checking: ${product.name} (${product.url.substring(0, 50)}...)`);
      try {
        const info = await scraper.getProductInfo(product.url);
        console.log(`   -> Scraped Price: ${info.price} TL`);
        
        if (info.price) {
          await db.updateProduct(product.id, {
            currentPrice: info.price,
            lastCheck: new Date().toISOString(),
            checkCount: (product.checkCount || 0) + 1,
          });
          console.log(`   ✅ DB Updated for ${product.id}`);
        } else {
          console.log(`   ❌ Price not found for ${product.name}`);
        }
      } catch (err) {
        console.error(`   ❌ Error for ${product.name}: ${err.message}`);
      }
      console.log("---");
    }
  } catch (err) {
    console.error("🔥 CRITICAL ERROR:", err.message);
  }
  process.exit(0);
}

debugCron();
