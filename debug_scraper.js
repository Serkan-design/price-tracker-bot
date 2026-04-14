const scraper = require("./scraper");
const ai = require("./ai");
const fs = require("fs");

const url = "https://www.trendyol.com/samsung/16gb-ddr4-3200mhz-cl22-notebook-ram-m471a2k43eb1-cwe-p-709595347";

async function debug() {
  console.log("--- DEBUG START ---");
  console.log("URL:", url);
  
  try {
    const info = await scraper.getProductInfo(url);
    console.log("RESULT:", JSON.stringify(info, null, 2));
  } catch (err) {
    console.error("CRITICAL ERROR:", err);
  }
  console.log("--- DEBUG END ---");
}

debug();
