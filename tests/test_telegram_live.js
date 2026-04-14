
const TelegramBot = require('node-telegram-bot-api');
require('dotenv').config();

const TOKEN = '7809701198:AAH786YvP7t21xL277GZ6UuH_v8_3X6G94A'; // Token from .env
const CHAT_ID = '8738897792'; // User's test ID

async function test() {
  console.log(`📡 Testing Telegram Token: ${TOKEN}`);
  const bot = new TelegramBot(TOKEN);
  try {
    const me = await bot.getMe();
    console.log(`✅ Token is VALID. Bot Name: ${me.first_name}`);
    
    await bot.sendMessage(CHAT_ID, "🚀 <b>Test Mesajı:</b> Sistem güncellendi knk, her şey yolunda!", { parse_mode: "HTML" });
    console.log(`✅ Message sent to ${CHAT_ID}`);
  } catch (err) {
    console.error(`❌ Token is INVALID or Error: ${err.message}`);
    if (err.message.includes('401')) {
      console.log("⚠️ 401 Unauthorized: Bu token artik gecersiz.");
    }
  }
}

test();
