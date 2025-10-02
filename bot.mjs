import 'dotenv/config';
import { Bot, InlineKeyboard } from 'grammy';

const {
  BOT_TOKEN,
  CHANNEL_ID,
  WEBAPP_URL,
  BASE = 'USD',
  SYMBOLS = 'RUB,EUR,TRY,KZT',
} = process.env;

if (!BOT_TOKEN || !CHANNEL_ID || !WEBAPP_URL) {
  console.error('Заполни BOT_TOKEN, CHANNEL_ID и WEBAPP_URL в .env');
  process.exit(1);
}

const bot = new Bot(BOT_TOKEN);

// /pin — отправит сообщение в канал с кнопкой и закрепит его
bot.command('pin', async (ctx) => {
  const kb = new InlineKeyboard().webApp('Открыть курсы', WEBAPP_URL);

  const text =
    `Тут вы можете узнать актуальные курсы валют.\n\n` +
    `База: ${BASE}\n` +
    `Пары: ${SYMBOLS.split(',').map(s => s.trim()).join(', ')}`;

  const msg = await ctx.api.sendMessage(CHANNEL_ID, text, { reply_markup: kb });
  await ctx.api.pinChatMessage(CHANNEL_ID, msg.message_id, { disable_notification: true });
  await ctx.reply('Готово: сообщение отправлено и закреплено.');
});

// Ответ на /start в личке (для теста)
bot.command('start', (ctx) =>
  ctx.reply('Привет! Отправь /pin, чтобы закрепить кнопку в канале (бот должен быть админом).')
);

bot.start();
console.log('Bot started. Use /pin to post and pin message in the channel.');
