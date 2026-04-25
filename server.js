require("dotenv").config();
const express = require("express");
const cors = require("cors");
const path = require("path");
const fs = require("fs");
const cron = require("node-cron");
const jwt = require("jsonwebtoken");
const TelegramBot = require("node-telegram-bot-api");

const db = require("./db");
const scraper = require("./scraper");
const ai = require("./ai");
const xauusd = require("./xauusd");
const mailer = require("./mailer");

const app = express();
const PORT = process.env.PORT || 3001;
const JWT_SECRET = process.env.JWT_SECRET;
const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

const distPath = path.resolve(__dirname, "panel", "dist_v4");
const indexPath = path.resolve(distPath, "index.html");

// In-memory active alert tracking (simplified for now)
let _activeAlerts = {}; 

let bot;
if (TELEGRAM_TOKEN && !TELEGRAM_TOKEN.includes("BURAYA")) {
  bot = new TelegramBot(TELEGRAM_TOKEN, { polling: true });

  // 401 hatasında polling'i durdur (lokal geliştirme ortamında token geçersizse log spam'ini önle)
  bot.on("polling_error", (err) => {
    if (err.code === "ETELEGRAM" && err.message.includes("401")) {
      console.warn("[TELEGRAM] Token geçersiz veya yetkisiz. Polling durduruluyor (lokal ortam).");
      bot.stopPolling().catch(() => {});
    }
  });

  bot.onText(/\/start/, (msg) => {
    bot.sendMessage(msg.chat.id, "👋 Merhaba! Bir ürün linki göndererek takibe başlayabilirsin.");
  });

  bot.on("message", async (msg) => {
    const text = msg.text;
    if (!text || text.startsWith("/")) return;
    if (text.includes("http")) {
      const urlMatch = text.match(/(https?:\/\/[^\s]+)/);
      if (urlMatch) {
        const url = urlMatch[0];
        bot.sendMessage(msg.chat.id, "🔍 İnceleniyor...");
        try {
          const info = await scraper.getProductInfo(url);
          if (info.price) {
            const newProduct = {
              name: info.name || "Ürün",
              url, path: url,
              site: info.platform || "Bilinmiyor",
              currentPrice: info.price, targetPrice: null, active: true,
              userId: `tg_${msg.chat.id}`, chatId: msg.chat.id,
              lastCheck: new Date().toISOString(), checkCount: 1,
              history: [{ price: info.price, date: new Date().toISOString() }],
            };
            await db.addProduct(newProduct);
            bot.sendMessage(msg.chat.id, `✅ Takip başladı!\n\n📦 ${newProduct.name}\n💰 ${newProduct.currentPrice} TL`);
          } else {
            bot.sendMessage(msg.chat.id, "❌ Fiyat bulunamadı.");
          }
        } catch (_) { bot.sendMessage(msg.chat.id, "❌ Hata oluştu."); }
      }
    }
  });
}

async function notifyUser({ email, chatId, subject, htmlBody, telegramMsg }) {
  if (chatId && bot) {
    bot.sendMessage(chatId, telegramMsg, { parse_mode: "HTML" }).catch(() => {});
  }
  if (email) {
    await mailer.sendAlert(email, subject, htmlBody);
  }
}

xauusd.setAlertCallback(async (type, data) => {
  try {
    const telegramChatIds = (process.env.XAUUSD_ALERT_CHAT_IDS || "").split(",").filter(Boolean);

    const htmlBody = mailer.buildXauAlertHtml({
      type,
      price: data.price,
      change: data.change,
      rsi: data.rsi,
      signal: data.signal,
      confidence: data.confidence,
      message: data.message,
    });

    for (const chatId of telegramChatIds) {
      if (bot) {
        bot.sendMessage(chatId.trim(), `📊 <b>XAUUSD</b>\n\n${data.message}`, { parse_mode: "HTML" }).catch(() => {});
      }
    }

    const xauAlertEmails = (process.env.XAUUSD_ALERT_EMAILS || "").split(",").filter(Boolean);
    for (const email of xauAlertEmails) {
      try {
        await mailer.sendAlert(email.trim(), `XAUUSD Sinyal: ${data.signal ?? type}`, htmlBody);
      } catch (mailErr) {
        console.error("Mail gönderme hatası:", mailErr.message);
      }
    }
  } catch (err) {
    console.error("XAUUSD Alert Callback Hatası:", err.message);
  }
});

xauusd.startPolling(5_000);

app.use(cors());
app.use(express.json());
app.use((req, res, next) => {
  res.set("Cache-Control", "no-store, no-cache, must-revalidate, private");
  next();
});

const authenticate = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    console.log(`[AUTH] No header for ${req.method} ${req.url}`);
    return res.status(401).json({ message: "Yetkisiz" });
  }
  try {
    req.user = jwt.verify(authHeader.split(" ")[1], JWT_SECRET);
    next();
  } catch (err) {
    console.log(`[AUTH] Error for ${req.method} ${req.url}: ${err.message}`);
    res.status(401).json({ message: "Token hatası" });
  }
};

// XAUUSD Routes (Moved high to avoid catch-all / static conflicts)
app.get("/api/xauusd/analysis", authenticate, (req, res) => {
  const a = xauusd.getAnalysis();
  if (!a) return res.status(503).json({ message: "Veri bekleniyor..." });
  res.json(a);
});

app.get("/api/xauusd/history", authenticate, (req, res) => {
  const n = Math.min(parseInt(req.query.n) || 200, 2000);
  res.json(xauusd.getHistory(n));
});

app.get("/api/xauusd/live", authenticate, async (req, res) => {
  try { res.json(await xauusd.fetchAndAnalyze()); }
  catch (_) { res.status(500).json({ message: "Hata" }); }
});

app.get("/api/xauusd/backtest", authenticate, (req, res) => {
  const n = Math.min(parseInt(req.query.n) || 500, 2000);
  const result = xauusd.runBacktest(n);
  res.json(result);
});

app.post("/api/xauusd/alerts", authenticate, async (req, res) => {
  const { support, resistance, spikeThreshold, dropThreshold, riseThreshold } = req.body;
  xauusd.setAlertLevels({ support, resistance, spikeThreshold, dropThreshold, riseThreshold });
  
  // Track active alerts for UI
  const email = req.user.email;
  if (!_activeAlerts[email]) _activeAlerts[email] = [];
  
  const newAlerts = [];
  if (dropThreshold) newAlerts.push({ id: `drop_${Date.now()}`, type: 'drop', value: dropThreshold, label: `-${dropThreshold}$ Düşüş`, active: true });
  if (riseThreshold) newAlerts.push({ id: `rise_${Date.now()}`, type: 'rise', value: riseThreshold, label: `+${riseThreshold}$ Yükseliş`, active: true });
  if (support?.length) support.forEach(s => newAlerts.push({ id: `sup_${s}`, type: 'support', value: s, label: `$${s} Destek`, active: true }));
  if (resistance?.length) resistance.forEach(r => newAlerts.push({ id: `res_${r}`, type: 'resistance', value: r, label: `$${r} Direnç`, active: true }));
  
  _activeAlerts[email] = newAlerts;

  try {
    const userDoc = await db.db.collection("users").doc(req.user.email).get();
    if (userDoc.exists) {
      const data = userDoc.data();
      const chatId = data?.telegramChatId;
      const notificationEmail = data?.notificationEmail;
      
      if (chatId) {
        const existing = (process.env.XAUUSD_ALERT_CHAT_IDS || "").split(",").filter(Boolean);
        if (!existing.includes(String(chatId))) {
          process.env.XAUUSD_ALERT_CHAT_IDS = [...existing, chatId].join(",");
        }
      }
      if (notificationEmail) {
        const existing = (process.env.XAUUSD_ALERT_EMAILS || "").split(",").filter(Boolean);
        if (!existing.includes(notificationEmail)) {
          process.env.XAUUSD_ALERT_EMAILS = [...existing, notificationEmail].join(",");
        }
      }
    }
  } catch (_) {}
  res.json({ message: "Sistem aktif edildi. Analiz başladı.", alerts: _activeAlerts[email] });
});

app.get("/api/xauusd/active-alerts", authenticate, (req, res) => {
  res.json(_activeAlerts[req.user.email] || []);
});

app.delete("/api/xauusd/active-alerts/:id", authenticate, (req, res) => {
  const email = req.user.email;
  if (_activeAlerts[email]) {
    _activeAlerts[email] = _activeAlerts[email].filter(a => a.id !== req.params.id);
  }
  res.json({ message: "Alarm devredışı bırakıldı." });
});

app.get("/api/xauusd/trade-stats", authenticate, (req, res) => {
  res.json(xauusd.getTradingStats());
});

app.post("/api/xauusd/reset-demo", authenticate, (req, res) => {
  xauusd.resetTradingStats();
  res.json({ message: "Demo hesap sıfırlandı." });
});

app.post("/api/xauusd/manual-trade", authenticate, async (req, res) => {
  const { type } = req.body;
  const analysis = xauusd.getAnalysis();
  if (!analysis) return res.status(503).json({ message: "Veri bekleniyor" });
  
  const result = xauusd.openPosition(type || 'BUY', analysis.price);
  if (result.success) res.json({ message: result.message });
  else res.status(400).json({ message: result.message });
});

app.post("/api/xauusd/close-position", authenticate, async (req, res) => {
  const analysis = xauusd.getAnalysis();
  if (!analysis) return res.status(503).json({ message: "Veri bekleniyor" });
  
  const result = xauusd.closePositionManual(analysis.price);
  if (result.success) res.json({ message: result.message });
  else res.status(400).json({ message: result.message });
});

if (fs.existsSync(distPath)) app.use(express.static(distPath));

app.post("/api/register", async (req, res) => {
  const { email, password, name } = req.body;
  if (!email || !password || !name) return res.status(400).json({ message: "Eksik bilgi" });
  try {
    const user = await db.registerUser(email, password, name);
    res.json({ message: "Kayıt başarılı", user });
  } catch (err) { res.status(400).json({ message: err.message }); }
});

app.post("/api/login", async (req, res) => {
  const { email, password } = req.body;
  const ADMIN_PASS = process.env.ADMIN_PASSWORD;
  try {
    if (ADMIN_PASS && password === ADMIN_PASS) {
      const adminEmail = process.env.ADMIN_EMAIL || "admin@fiyatbot.com";
      const adminUser = (email === adminEmail || !email) ? { email: email || adminEmail, name: "Yönetici" } : null;
      if (adminUser) {
        const token = jwt.sign(adminUser, JWT_SECRET, { expiresIn: "7d" });
        return res.json({ token, user: adminUser });
      }
    }
    if (!email) return res.status(400).json({ message: "E-posta gerekli" });
    const user = await db.loginUser(email, password);
    if (!user) return res.status(401).json({ message: "Hatalı giriş" });
    const token = jwt.sign({ email: user.email, name: user.name }, JWT_SECRET, { expiresIn: "7d" });
    res.json({ token, user: { email: user.email, name: user.name } });
  } catch (err) {
    console.error("[LOGIN ERROR]", err);
    res.status(500).json({ message: "Sistem hatası: " + err.message });
  }
});

app.get("/api/products", authenticate, async (req, res) => {
  try { res.json(await db.getProducts(req.user.email)); }
  catch (_) { res.status(500).json({ message: "Hata" }); }
});

app.post("/api/products", authenticate, async (req, res) => {
  const { url, targetPrice } = req.body;
  if (!url) return res.status(400).json({ message: "URL gerekli" });
  try {
    const info = await scraper.getProductInfo(url);
    const saved = await db.addProduct({
      name: info.name || "Ürün", url, path: url,
      site: info.platform || "Bilinmiyor",
      currentPrice: info.price || null, targetPrice: targetPrice || null,
      active: true, userId: req.user.email,
      lastCheck: new Date().toISOString(), checkCount: 1,
      history: info.price ? [{ price: info.price, date: new Date().toISOString() }] : [],
    });
    res.json(saved);
  } catch (_) { res.status(500).json({ message: "Eklenemedi" }); }
});

app.delete("/api/products/:id", authenticate, async (req, res) => {
  await db.deleteProduct(req.params.id);
  res.json({ message: "Silindi" });
});

app.get("/api/user/settings", authenticate, async (req, res) => {
  try {
    const doc = await db.db.collection("users").doc(req.user.email).get();
    if (!doc.exists) return res.status(404).json({ message: "Bulunamadı" });
    const data = doc.data() || {};
    res.json({
      notificationPref: data.notificationPref || { type: "telegram" },
      telegramChatId: data.telegramChatId || "",
      notificationEmail: data.notificationEmail || "",
    });
  } catch (_) { res.status(500).json({ message: "Hata" }); }
});

app.post("/api/settings", authenticate, async (req, res) => {
  const n = req.body.notification;
  if (!n) return res.status(400).json({ message: "Veri eksik" });
  try {
    const updates = {
      notificationPref: { type: n.type },
      telegramChatId: n.chat_id || "",
      notificationEmail: n.email || "",
    };
    await db.updateUserInfo(req.user.email, updates);

    if (n.type === "telegram" && n.chat_id && bot) {
      bot.sendMessage(n.chat_id, "🔔 <b>Bağlantı Başarılı!</b>", { parse_mode: "HTML" }).catch(() => {});
    }
    if (n.type === "email" && n.email) {
      await mailer.sendAlert(n.email, "Fiyat Bot - E-posta Aktif",
        `<div style="font-family:Arial;padding:32px;background:#0f172a;color:#f8fafc;border-radius:12px;text-align:center;">
          <div style="font-size:48px;margin-bottom:16px;">✅</div>
          <h2 style="color:#22c55e;">E-posta bildirimleri aktif!</h2>
          <p style="color:#94a3b8;margin-top:12px;">Artık fiyat alertleri bu adrese gelecek.</p>
        </div>`
      );
    }
    res.json({ message: "Güncellendi" });
  } catch (_) { res.status(500).json({ message: "Hata" }); }
});


app.get("/", (req, res) => {
  if (fs.existsSync(indexPath)) return res.sendFile(indexPath);
  res.status(404).send("Not built");
});

app.use((req, res) => {
  if (req.url.startsWith("/api")) return res.status(404).json({ message: "Not found" });
  if (fs.existsSync(indexPath)) res.sendFile(indexPath); else res.status(404).send("Not found");
});

let scrapingProducts = new Set(); // Global lock yerine per-product takibi
cron.schedule("*/1 * * * *", async () => {
  try {
    const products = await db.getAllActiveProducts();
    
    // En eski güncellenen ürünler önce (stale-first): hiç güncellenmemiş > en eski tarih
    products.sort((a, b) => {
      const ta = a.lastCheck ? new Date(a.lastCheck).getTime() : 0;
      const tb = b.lastCheck ? new Date(b.lastCheck).getTime() : 0;
      return ta - tb;
    });

    // 3'er 3'er paralel işle (scraper MAX_PAGES = 5 ile uyumlu)
    for (let i = 0; i < products.length; i += 3) {
      const batch = products.slice(i, i + 3).filter(p => !scrapingProducts.has(p.id));
      if (batch.length === 0) continue;

      await Promise.all(batch.map(async (product) => {
        scrapingProducts.add(product.id);
        try {
          const info = await scraper.getProductInfo(product.url);
          const currentPrice = info.price;
          if (!currentPrice) {
            console.warn(`[CRON] Fiyat alınamadı: ${product.name} (${product.url.substring(0, 60)}...)`);
            return;
          }

          await db.addPriceHistory(product.id, currentPrice);

          if (product.currentPrice && currentPrice < product.currentPrice) {
            const dropPct = ((product.currentPrice - currentPrice) / product.currentPrice) * 100;
            const htmlBody = mailer.buildProductAlertHtml({
              name: product.name, url: product.url,
              oldPrice: product.currentPrice, newPrice: currentPrice, dropPct,
            });
            const telegramMsg = `🎉 <b>Fiyat Düştü!</b> (%${Math.round(dropPct)})\n\n📦 ${product.name}\n💰 Yeni: ${currentPrice} TL\n\n🔗 <a href="${product.url}">Ürüne Git</a>`;

            let chatId = product.chatId;
            let email = null;
            if (product.userId && !product.userId.startsWith("tg_")) {
              const userDoc = await db.db.collection("users").doc(product.userId).get();
              if (userDoc.exists) {
                const data = userDoc.data();
                chatId = data.telegramChatId;
                email = data.notificationEmail;
                const notifType = data.notificationPref?.type || "telegram";
                await notifyUser({
                  email: notifType === "email" ? email : null,
                  chatId: notifType === "telegram" ? chatId : null,
                  subject: `Fiyat Düştü: ${product.name}`,
                  htmlBody, telegramMsg,
                });
              }
            } else if (product.userId?.startsWith("tg_") && bot) {
              chatId = product.userId.replace("tg_", "");
              bot.sendMessage(chatId, telegramMsg, { parse_mode: "HTML" }).catch(() => {});
            }
          }

          await db.updateProduct(product.id, {
            currentPrice, lastCheck: new Date().toISOString(),
            checkCount: (product.checkCount || 0) + 1,
          });

          console.log(`[CRON] ✅ ${product.name?.substring(0, 30)} → ${currentPrice} TL`);
        } catch (err) {
          console.error(`[CRON] ❌ Hata (${product.name?.substring(0, 30)}): ${err.message}`);
        } finally {
          scrapingProducts.delete(product.id);
        }
      }));
    }
  } catch (err) {
    console.error("[CRON] Kritik hata:", err.message);
  }
});

const server = app.listen(PORT, "0.0.0.0", () => console.log(`🚀 ${PORT}`));
server.timeout = 120000;
server.headersTimeout = 120000;
server.keepAliveTimeout = 120000;
