import { startBot } from './bot.js';

const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) {
  console.error('TELEGRAM_BOT_TOKEN muhit o\'zgaruvchisi o\'rnatilmagan!');
  process.exit(1);
}

console.log('Tarix Quiz Bot ishga tushmoqda...');
startBot();
