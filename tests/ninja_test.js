require('dotenv').config();
const scraper = require('../scraper');

async function test() {
  console.log('--- NINJA TEST STARTED ---');
  
  const url1 = 'https://www.trendyol.com/casper/nirvana-x300-15-6-inc-intel-core-i5-1235u-16gb-ram-512gb-ssd-freedos-laptop-p-737527754';
  const url2 = 'https://www.hepsiburada.com/samsung-galaxy-a55-5g-256-gb-awesome-navy-p-HBCV00003G0YOM';

  console.log('\n[1] Testing Cache and Duplicate Prevention...');
  // Trigger two identical requests in parallel
  const p1 = scraper.getPrice(url1);
  const p2 = scraper.getPrice(url1);
  
  const [res1, res2] = await Promise.all([p1, p2]);
  console.log(`Res 1: ${res1}, Res 2: ${res2}`);
  console.log('Duplicate check passed if one was skipped or returned null/cached.');

  console.log('\n[2] Testing Queue / Concurrent Requests...');
  // Trigger 4 requests (MAX_PAGES is 3)
  const urls = [url1, url2, url1, url2];
  console.log(`Triggering ${urls.length} concurrent requests...`);
  const results = await Promise.all(urls.map(u => scraper.getPrice(u)));
  console.log('Results:', results);

  console.log('\n[3] Waiting for Health Check (60s)...');
  await new Promise(r => setTimeout(r, 65000));

  console.log('\n--- NINJA TEST COMPLETED ---');
  process.exit(0);
}

test().catch(e => {
  console.error('TEST FAILED:', e);
  process.exit(1);
});
