const scraper = require("./scraper");
const fs = require("fs");

async function test() {
  const url = "https://www.trendyol.com/apple/iphone-15-128gb-siyah-p-766731112";
  const puppeteer = require("puppeteer-extra");
  const StealthPlugin = require("puppeteer-extra-plugin-stealth");
  puppeteer.use(StealthPlugin());
  
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto(url, { waitUntil: "networkidle2" });
  const content = await page.content();
  fs.writeFileSync("trendyol_test.html", content);
  console.log("📄 Saved HTML to trendyol_test.html");
  
  const name = await page.$eval("h1", el => el.innerText).catch(() => "Not found");
  console.log("H1 text:", name);
  
  await browser.close();
}

test();
