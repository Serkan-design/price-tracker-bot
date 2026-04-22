const fs = require('fs');
const html = fs.readFileSync('tests/trendyol_debug.html', 'utf8');

// JSON içinde fiyat ara
const patterns = [
  [/"price":\s*(\d+\.?\d*)/,           'price'],
  [/"priceOriginal":\s*(\d+\.?\d*)/,   'priceOriginal'],
  [/"discountedPrice":\s*(\d+\.?\d*)/, 'discountedPrice'],
  [/"salePrice":\s*(\d+\.?\d*)/,       'salePrice'],
  [/"currentPrice":\s*(\d+\.?\d*)/,    'currentPrice'],
];

for (const [rx, name] of patterns) {
  const m = html.match(rx);
  console.log(name + ':', m ? m[1] : 'YOK');
}

// Trendyol state
const stateIdx = html.indexOf('window.__INITIAL_STATE__');
console.log('\nwindow.__INITIAL_STATE__ var mi:', stateIdx !== -1);
if (stateIdx !== -1) {
  console.log('State snippet:', html.substring(stateIdx, stateIdx + 300).replace(/\s+/g, ' '));
}

// Robot kontrol
const robotIdx = html.indexOf('robot');
console.log('\n"robot" var mi:', robotIdx !== -1);

// 404 kontrol
const idx404 = html.indexOf('404');
console.log('"404" index:', idx404);
if (idx404 !== -1) {
  console.log('404 çevresi:', html.substring(idx404 - 50, idx404 + 100).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' '));
}
