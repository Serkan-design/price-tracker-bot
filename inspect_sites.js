const puppeteer = require("puppeteer-extra");
const StealthPlugin = require("puppeteer-extra-plugin-stealth");
const fs = require("fs");
puppeteer.use(StealthPlugin());

async function inspectSite(url, siteName) {
  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });
  const page = await browser.newPage();
  await page.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36");
  
  console.log(`Inspecting ${siteName}...`);
  await page.goto(url, { waitUntil: "networkidle2", timeout: 60000 });
  await new Promise(r => setTimeout(r, 5000));

  const data = await page.evaluate(() => {
    // Fiyat gibi görünen her şeyi bulmaya çalış
    const results = [];
    document.querySelectorAll("*").forEach(el => {
      if (el.children.length === 0) {
        const text = (el.innerText || "").trim();
        // Fiyat formatına uyanlar (örn: 4.599,00 veya 4500)
        if (/^[\d.,\s]+(TL|₺)?$/.test(text) && text.length > 1 && text.length < 20 && /\d/.test(text)) {
          results.push({
            tag: el.tagName,
            cls: el.className.substring(0, 50),
            txt: text,
            parentCls: el.parentElement ? el.parentElement.className.substring(0, 50) : ""
          });
        }
      }
    });

    // ld+json içinde fiyat var mı?
    const scripts = [...document.querySelectorAll('script[type="application/ld+json"]')];
    const ldPrices = scripts.map(s => {
      try {
        const json = JSON.parse(s.innerText);
        if (json.offers && json.offers.price) return json.offers.price;
        if (Array.isArray(json)) {
            const item = json.find(j => j["@type"] === "Product");
            if (item && item.offers && item.offers.price) return item.offers.price;
        }
        return null;
      } catch (e) { return null; }
    }).filter(p => p !== null);

    return { title: document.title, samples: results.slice(0, 20), ldPrices };
  });

  fs.writeFileSync(`inspect_${siteName}.json`, JSON.stringify(data, null, 2));
  console.log(`Saved results for ${siteName}`);
  await browser.close();
}

(async () => {
  await inspectSite('https://www.hepsiburada.com/lego-technic-bugatti-bolide-42151-p-HBCV00003I0I46', 'hepsiburada');
  await inspectSite('https://www.n11.com/urun/samsung-galaxy-buds-2-pro-bluetooth-kulaklik-samsung-turkiye-garantili-3116503', 'n11');
})();
