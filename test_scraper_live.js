
const scraper = require('./scraper');

async function test() {
  const urls = [
    'https://www.trendyol.com/apple/iphone-15-128-gb-siyah-p-766723284',
    'https://www.amazon.com.tr/Apple-iPhone-15-128-GB-Pembe/dp/B0CHXFX7DR'
  ];

  for (const url of urls) {
    console.log(`\n--- Testing: ${url} ---`);
    try {
      const info = await scraper.getProductInfo(url);
      console.log('Result:', JSON.stringify(info, null, 2));
    } catch (err) {
      console.error('Error:', err.message);
    }
  }
}

test();
