require("dotenv").config();
const express = require("express");
const cors = require("cors");
const path = require("path");
const https = require("https");
const fs = require("fs");
const cron = require("node-cron");
const jwt = require("jsonwebtoken");
const TelegramBot = require("node-telegram-bot-api");

const db = require("./db"); // Firestore refactor version
const scraper = require("./scraper");
const ai = require("./ai");

const app = express();
const PORT = process.env.PORT || 3001;
const JWT_SECRET = process.env.JWT_SECRET;
const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

// Paths
const distPath = path.resolve(__dirname, "panel", "dist_v4");
const indexPath = path.resolve(distPath, "index.html");

// Initialize Bot
let bot;
if (TELEGRAM_TOKEN && !TELEGRAM_TOKEN.includes("BURAYA")) {
  bot = new TelegramBot(TELEGRAM_TOKEN, { polling: true });

  // Bot Handlers
  bot.onText(/\/start/, (msg) => {
    bot.sendMessage(msg.chat.id, "👋 Merhaba! Ben Fiyat Takip Botu.\n\nBir ürün linki göndererek takibe başlayabilirsin. Ücret düştüğünde seni hemen bilgilendireceğim.");
  });

  bot.on("message", async (msg) => {
    const text = msg.text;
    if (!text || text.startsWith("/")) return;

    // Link tespiti
    if (text.includes("http")) {
      const urlMatch = text.match(/(https?:\/\/[^\s]+)/);
      if (urlMatch) {
         const url = urlMatch[0];
         bot.sendMessage(msg.chat.id, "🔍 Ürün inceleniyor, lütfen bekleyin...");
         try {
            const info = await scraper.getProductInfo(url);
            if (info.price) {
               // Bot üzerinden eklenen ürünler için varsayılan bir kullanıcı veya anonim ID/chatId eşleşmesi
               // Şimdilik chatId'yi userId olarak da kullanabiliriz (Telegram-only users için)
               const newProduct = {
                 name: info.name || "Bilinmeyen Ürün",
                 url,
                 path: url,
                 site: info.platform || "Bilinmiyor",
                 currentPrice: info.price,
                 targetPrice: null,
                 active: true,
                 userId: `tg_${msg.chat.id}`, // Telegram prefixed ID
                 chatId: msg.chat.id,
                 lastCheck: new Date().toISOString(),
                 checkCount: 1,
                 history: [{ price: info.price, date: new Date().toISOString() }],
               };
               await db.addProduct(newProduct);
               bot.sendMessage(msg.chat.id, `✅ Ürün takibe alındı!\n\n📦 ${newProduct.name}\n💰 Mevcut Fiyat: ${newProduct.currentPrice} TL`);
            } else {
               bot.sendMessage(msg.chat.id, "❌ Ürün fiyatı bulunamadı. Lütfen linkin doğru olduğundan emin olun.");
            }
         } catch (err) {
            bot.sendMessage(msg.chat.id, "❌ Ürün eklenirken bir hata oluştu.");
         }
      }
    }
  });
}

// Middlewares
app.use(cors());
app.use(express.json());

// Disable Caching for Live Testing
app.use((req, res, next) => {
  res.set("Cache-Control", "no-store, no-cache, must-revalidate, private");
  next();
});

// Request logger
app.use((req, res, next) => {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${req.method} ${req.url}`);
  next();
});

// Authentication Middleware
const authenticate = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ message: "Yetkisiz eriÅŸim" });
  
  const token = authHeader.split(" ")[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded; // { email, name }
    next();
  } catch (err) {
    res.status(401).json({ message: "GeÃ§ersiz token" });
  }
};

// STATIC FILES
if (fs.existsSync(distPath)) {
  app.use(express.static(distPath));
}

// --- AUTH ROUTES ---

app.post("/api/register", async (req, res) => {
  const { email, password, name } = req.body;
  if (!email || !password || !name) return res.status(400).json({ message: "TÃ¼m alanlar gerekli" });
  try {
    const user = await db.registerUser(email, password, name);
    res.json({ message: "KayÄ±t baÅŸarÄ±lÄ±", user });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

app.post("/api/login", async (req, res) => {
  const { email, password } = req.body;
  const ADMIN_PASS = process.env.ADMIN_PASSWORD;

  try {
    // 1. Check for Master Admin Password (fallback/emergency override)
    if (ADMIN_PASS && password === ADMIN_PASS) {
      const adminEmail = process.env.ADMIN_EMAIL || "admin@fiyatbot.com";
      const adminUser = (email === adminEmail || !email) 
        ? { email: email || adminEmail, name: "Sistem Yöneticisi" }
        : null;
      
      if (adminUser) {
        const token = jwt.sign(adminUser, JWT_SECRET, { expiresIn: "7d" });
        return res.json({ token, user: adminUser });
      }
    }

    // 2. Regular Login (New UI)
    if (!email) return res.status(400).json({ message: "E-posta girilmedi" });
    
    const user = await db.loginUser(email, password);
    if (!user) return res.status(401).json({ message: "Hatalı e-posta veya şifre" });
    
    const token = jwt.sign({ email: user.email, name: user.name }, JWT_SECRET, { expiresIn: "7d" });
    res.json({ token, user: { email: user.email, name: user.name } });
  } catch (err) {
    console.error("Login error:", err.message);
    res.status(500).json({ message: "Sistem hatası: " + err.message });
  }
});

// --- API ROUTES (USER SCOPED) ---

app.get("/api/products", authenticate, async (req, res) => {
  try {
    const products = await db.getProducts(req.user.email);
    res.json(products);
  } catch (err) {
    res.status(500).json({ message: "ÃœrÃ¼nler listelenemedi" });
  }
});

app.get("/api/stats", authenticate, async (req, res) => {
  const products = await db.getProducts(req.user.email);
  res.json({
    totalProducts: products.length,
    activeProducts: products.filter(p => p.active !== false).length,
    totalChecks: products.reduce((acc, p) => acc + (p.checkCount || 0), 0)
  });
});

app.post("/api/products", authenticate, async (req, res) => {
  const { url, targetPrice } = req.body;
  if (!url) return res.status(400).json({ message: "URL gerekli" });
  try {
    console.log(`🔍 Ürün ekleniyor: ${url}`);
    const info = await scraper.getProductInfo(url);
    console.log(`✅ Scraper sonucu: Name: ${info.name}, Price: ${info.price}, Platform: ${info.platform}`);
    
    const newProduct = {
      name: info.name || "Bilinmeyen Ürün",
      url,
      path: url,
      site: info.platform || "Bilinmiyor",
      currentPrice: info.price || null,
      targetPrice: targetPrice || null,
      active: true,
      userId: req.user.email,
      lastCheck: new Date().toISOString(),
      checkCount: 1,
      history: info.price ? [{ price: info.price, date: new Date().toISOString() }] : [],
    };
    const saved = await db.addProduct(newProduct);
    res.json(saved);
  } catch (err) {
    console.error("❌ Ürün ekleme hatası:", err.message);
    res.status(500).json({ message: "Ürün eklenemedi: " + err.message });
  }
});

app.delete("/api/products/:id", authenticate, async (req, res) => {
  await db.deleteProduct(req.params.id);
  res.json({ message: "Silindi" });
});

app.get("/api/health", (req, res) => res.json({ status: "ok" }));

app.get("/api/user/settings", authenticate, async (req, res) => {
  try {
    console.log(`📡 Ayarlar istendi: ${req.user.email}`);
    const doc = await db.db.collection("users").doc(req.user.email).get();
    if (doc.exists) {
      const data = doc.data() || {};
      res.json({
        notificationPref: data.notificationPref || { type: 'telegram' },
        telegramChatId: data.telegramChatId || ''
      });
    } else {
      res.status(404).json({ message: "Kullanıcı bulunamadı" });
    }
  } catch (err) {
    res.status(500).json({ message: "Ayarlar alınamadı" });
  }
});

app.post("/api/user/settings", authenticate, async (req, res) => {
  const { notificationPref, telegramChatId } = req.body;
  try {
    const updates = {};
    if (notificationPref) updates.notificationPref = notificationPref;
    if (telegramChatId) updates.telegramChatId = telegramChatId;
    
    await db.updateUserInfo(req.user.email, updates);
    res.json({ message: "Ayarlar güncellendi" });
  } catch (err) {
    res.status(500).json({ message: "Güncellenemedi" });
  }
});

// Alias for frontend compatibility
app.post("/api/settings", authenticate, async (req, res) => {
  if (req.body.notification) {
     const updates = {
       notificationPref: { type: req.body.notification.type },
       telegramChatId: req.body.notification.chat_id
     };
     try {
       await db.updateUserInfo(req.user.email, updates);
       
       // SİSTEME BAĞLANDI MESAJI GÖNDER
       if (bot && updates.telegramChatId && updates.notificationPref.type === 'telegram') {
          bot.sendMessage(updates.telegramChatId, "🔔 <b>Fiyat Takip Botu Bağlantısı Başarılı!</b>\n\nArtık ürünleriniz düştüğünde buradan anlık bildirim alacaksınız knk. Bol şans! 🚀", { parse_mode: "HTML" })
             .catch(e => console.error("Onay mesaji gonderilemedi (Muhtemelen Token hatasi veya Kullanici botu baslatmadi)", e.message));
       }

       res.json({ message: "Ayarlar güncellendi" });
     } catch (err) {
       res.status(500).json({ message: "Güncellenemedi" });
     }
  } else {
    res.status(400).json({ message: "Veri eksik" });
  }
});

// --- ROOT & CATCH-ALL ---
app.get("/", (req, res) => {
  if (fs.existsSync(indexPath)) return res.sendFile(indexPath);
  res.status(404).send("Admin Panel NOT BUILT.");
});

// Catch-all route using literal regex to avoid Express 5 string parsing issues
app.get(/.*/, (req, res) => {
  if (req.url.startsWith("/api")) return res.status(404).json({ message: "Not found" });
  if (fs.existsSync(indexPath)) res.sendFile(indexPath);
  else res.status(404).send("Not found");
});

// --- CRON JOB ---
let isScraping = false;
cron.schedule("*/5 * * * *", async () => {
  if (isScraping) {
    console.log("⚠️ Scraping already in progress, skipping this cycle.");
    return;
  }
  isScraping = true;
  console.log("🚜 Scraping started (Every 5 mins)...");
  try {
    const products = await db.getAllActiveProducts();
    console.log(`📡 Processing ${products.length} products...`);
    
    const chunkSize = 3;
    for (let i = 0; i < products.length; i += chunkSize) {
      const chunk = products.slice(i, i + chunkSize);
      await Promise.all(chunk.map(async (product) => {
        try {
          console.log(`🔍 Checking: ${product.name} (${product.site})`);
          const info = await scraper.getProductInfo(product.url);
          const currentPrice = info.price;
          
          if (currentPrice === null) {
            console.log(`⚠️ Price not found for: ${product.name}`);
            return;
          }
          
          await db.addPriceHistory(product.id, currentPrice);
          
          if (product.currentPrice && currentPrice < product.currentPrice) {
            const dropPct = ((product.currentPrice - currentPrice) / product.currentPrice) * 100;
            const msg = `🎉 <b>Fiyat Düştü!</b> (%${Math.round(dropPct)})\n\n📦 ${product.name}\n💰 Eski: ${product.currentPrice} TL\n💎 Yeni: ${currentPrice} TL\n\n🔗 <a href="${product.url}">Ürüne Git</a>`;
            
            let chatId = product.chatId;
            if (!chatId && product.userId && !product.userId.startsWith("tg_")) {
               const userDoc = await db.db.collection("users").doc(product.userId).get();
               if (userDoc.exists) chatId = userDoc.data().telegramChatId;
            } else if (product.userId && product.userId.startsWith("tg_")) {
               chatId = product.userId.replace("tg_", "");
            }

            if (bot && chatId) {
               console.log(`🔔 Sending notification to: ${chatId}`);
               bot.sendMessage(chatId, msg, { parse_mode: "HTML" }).catch(e => console.error("❌ Notification failed:", e.message));
            }
          }
          
          await db.updateProduct(product.id, { 
            currentPrice, 
            lastCheck: new Date().toISOString(), 
            checkCount: (product.checkCount || 0) + 1 
          });
        } catch (err) {
          console.error(`❌ Scrape error for ${product.id}:`, err.message);
        }
      }));
    }
    console.log("✅ Scraping cycle completed.");
  } catch (err) {
    console.error("❌ Cron error:", err.message);
  } finally {
    isScraping = false;
  }
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 SERVER LIVE: http://localhost:${PORT}`);
});
