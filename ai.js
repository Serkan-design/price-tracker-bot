require("dotenv").config();

/**
 * Gemini AI ile fiyat çıkarma (fallback)
 * Scraper başarısız olursa HTML'den AI ile fiyat bul
 */
let cooldownUntil = 0;

async function extractPriceAI(html) {
  const now = Date.now();
  if (now < cooldownUntil) {
    const remaining = Math.ceil((cooldownUntil - now) / (60 * 1000));
    console.warn(`🤖 AI Fallback cooldown aktif. Kalan süre: ${remaining} dk`);
    return null;
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.warn("⚠️ GEMINI_API_KEY yok, AI fallback devre dışı");
    return null;
  }

  try {
    // Güncel Gemini REST API endpoint
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  text: `Bu HTML kod parçasındaki ürün satış fiyatını bul. 
Sadece sayıyı döndür, başka hiçbir şey yazma. 
Para birimi sembolü veya TL yazma. 
Örnek cevap: 1234.99
Eğer fiyat bulunamazsa: null

HTML:
${html.slice(0, 8000)}`,
                },
              ],
            },
          ],
          generationConfig: {
            temperature: 0,
            maxOutputTokens: 50,
          },
        }),
      }
    );

    if (!res.ok) {
      const errText = await res.text();
      console.error("❌ Gemini API Hata:", res.status, errText.slice(0, 200));
      
      // 429 Check
      if (res.status === 429) {
        console.error("⛔ QUOTA EXCEEDED: 15 dakika AI cooldown başlatıldı.");
        cooldownUntil = Date.now() + 15 * 60 * 1000;
      }
      
      return null;
    }

    const data = await res.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    
    if (!text || text === "null") return null;

    const val = parseFloat(text.replace(/[^\d.]/g, ""));
    if (isNaN(val) || val <= 0 || val > 999999) return null;

    return val;
  } catch (err) {
    console.error("❌ AI Extraction Hata:", err.message);
    return null;
  }
}

module.exports = { extractPriceAI };