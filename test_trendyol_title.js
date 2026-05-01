const puppeteer = require("puppeteer-extra");
const StealthPlugin = require("puppeteer-extra-plugin-stealth");
puppeteer.use(StealthPlugin());

async function test() {
  const browser = await puppeteer.launch({
    headless: "new",
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  const page = await browser.newPage();
  
  await page.setRequestInterception(true);
  page.on('request', (req) => {
    if (['image', 'font', 'media'].includes(req.resourceType())) req.abort();
    else req.continue();
  });

  const response = await page.goto("https://www.trendyol.com/apple/iphone-15-128gb-siyah-p-766731112", { waitUntil: "domcontentloaded", timeout: 25000 });
  await new Promise(r => setTimeout(r, 2000));
  
  console.log("Status:", response.status());
  console.log("Title:", await page.title());
  console.log("H1:", await page.evaluate(() => document.querySelector('h1')?.innerText));
  
  await browser.close();
  process.exit(0);
}

test();
