const puppeteer = require("puppeteer-extra");
const StealthPlugin = require("puppeteer-extra-plugin-stealth");
puppeteer.use(StealthPlugin());

async function test() {
  console.log("Starting browser...");
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

  console.log("Navigating...");
  await page.goto("https://www.trendyol.com/apple/iphone-15-128gb-siyah-p-766731112", { waitUntil: "domcontentloaded", timeout: 25000 });
  
  await new Promise(r => setTimeout(r, 4000));
  
  await page.screenshot({ path: "trendyol_test.png" });
  console.log("Screenshot saved.");
  
  await browser.close();
  process.exit(0);
}

test();
