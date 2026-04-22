const fs = require('fs');
const html = fs.readFileSync('tests/trendyol_debug.html', 'utf8');

// Trendyol botla farklı bir sayfa mı döndürüyor?
console.log('HTML boyutu:', html.length);
console.log('Title:', html.match(/<title>([^<]+)/)?.[1]);

// Robot / bot tespiti
const robotIdx = html.indexOf('robot');
const botIdx = html.indexOf('bot-detection');
console.log('"robot" indexi:', robotIdx);
console.log('"bot-detection" indexi:', botIdx);

// Trendyol fiyat data-testid=price-label
const priceLabel = html.match(/data-testid="price-label"[^>]*>([^<]+)/);
const prcDsc = html.match(/class="[^"]*prc-dsc[^"]*"[^>]*>([^<]+)/);
console.log('price-label degeri:', priceLabel ? priceLabel[1] : 'YOK');
console.log('prc-dsc degeri:', prcDsc ? prcDsc[1] : 'YOK');

// JSON fiyat arama
const m1 = html.match(/"discountedPrice":(\d+)/);
const m2 = html.match(/"sellingPrice":(\d+)/);
const m3 = html.match(/"price":(\d+)/);
console.log('discountedPrice:', m1 ? m1[1] : 'YOK');
console.log('sellingPrice:', m2 ? m2[1] : 'YOK'); 
console.log('price (JSON):', m3 ? m3[1] : 'YOK');
