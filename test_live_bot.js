require("dotenv").config();
const TelegramBot = require("node-telegram-bot-api");

async function testBot() {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID || "1775328685";
    
    console.log(`Using Token: ${token}`);
    console.log(`Using Chat ID: ${chatId}`);
    
    const bot = new TelegramBot(token, { polling: false });
    
    try {
        await bot.sendMessage(chatId, "🚀 Fiyat Takip Botu Test Mesajı!\n\nEğer bu mesajı görüyorsan bot bağlantımız başarılı demektir knk.");
        console.log("✅ Message sent successfully!");
    } catch (err) {
        console.error("❌ Send failed:", err.message);
        if (err.message.includes("401")) console.error("   -> Token is invalid.");
        if (err.message.includes("400")) console.error("   -> Chat ID is invalid or bot not started by user.");
    }
}

testBot();
