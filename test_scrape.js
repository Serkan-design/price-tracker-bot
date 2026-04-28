const axios = require('axios');
const cheerio = require('cheerio');

async function testTrendyol() {
  try {
    const res = await axios.get('https://www.trendyol.com/colezium/kirkayak-fosforlu-clz-p-766731112', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
      }
    });
    
    // Attempt 1: Window State
    const match = res.data.match(/window\.__PRODUCT_DETAIL_APP_INITIAL_STATE__\s*=\s*(\{.*?\});/);
    if (match) {
        try {
            const state = JSON.parse(match[1]);
            const price = state.product?.price?.sellingPrice?.value || state.product?.price?.discountedPrice?.value;
            console.log("Price from initial state:", price);
        } catch(e) {}
    } else {
        console.log("No initial state found.");
    }

    // Attempt 2: DOM
    const $ = cheerio.load(res.data);
    console.log("DOM prc-dsc:", $('.prc-dsc').text());
    
    // Attempt 3: Any "price" text matching
    const priceMatch = res.data.match(/"price"\s*:\s*([0-9.]+)/i) || res.data.match(/"sellingPrice"\s*:\s*\{\s*"value"\s*:\s*([0-9.]+)/i);
    if (priceMatch) {
       console.log("Regex price:", priceMatch[1]);
    }
  } catch(e) {
    console.error("Trendyol Error:", e.message);
  }
}

testTrendyol();
