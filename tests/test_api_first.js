require('dotenv').config();
const scraper = require('./scraper');

async function test() {
  console.log('=== TRENDYOL API TEST ===');
  const tyUrl = 'https://www.trendyol.com/casper/nirvana-x300-15-6-inc-intel-core-i5-1235u-16gb-ram-512gb-ssd-freedos-laptop-p-737527754';
  const ty = await scraper.getProductInfo(tyUrl);
  console.log('TY:', JSON.stringify(ty));

  console.log('\n=== HEPSİBURADA API TEST ===');
  const hbUrl = 'https://www.hepsiburada.com/samsung-galaxy-a55-5g-256-gb-awesome-navy-p-HBCV00003G0YOM';
  const hb = await scraper.getProductInfo(hbUrl);
  console.log('HB:', JSON.stringify(hb));
  
  process.exit(0);
}

test().catch(e => { console.error('HATA:', e.message); process.exit(1); });
