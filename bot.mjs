// bot.mjs
import 'dotenv/config';
import { Bot, InlineKeyboard } from 'grammy';
import cron from 'node-cron';
import fs from 'fs/promises';

const {
  BOT_TOKEN,
  CHANNEL_ID,
  BOT_USERNAME,
  WEBAPP_URL,   // можно оставить, не обязательно использовать
  BASE = 'USD',
  SYMBOLS = 'RUB,EUR,TRY,KZT',
} = process.env;

if (!BOT_TOKEN || !CHANNEL_ID || !BOT_USERNAME) {
  console.error('Заполни BOT_TOKEN, CHANNEL_ID и BOT_USERNAME в .env');
  process.exit(1);
}

const bot = new Bot(BOT_TOKEN);

// ===== ХЕЛПЕРЫ ДЛЯ ХРАНЕНИЯ ID ПОСЛЕДНЕГО ПОСТА =====
const LAST_MSG_FILE = './last_message.json';

async function readLastMessageId() {
  try {
    const txt = await fs.readFile(LAST_MSG_FILE, 'utf8');
    const data = JSON.parse(txt);
    return data?.message_id ?? null;
  } catch {
    return null;
  }
}

async function saveLastMessageId(id) {
  try {
    await fs.writeFile(
      LAST_MSG_FILE,
      JSON.stringify({ message_id: id }, null, 2),
      'utf8',
    );
  } catch (e) {
    console.error('Не удалось сохранить last_message_id:', e);
  }
}

// ===== ДОСТУП ТОЛЬКО ДЛЯ АДМИНОВ КАНАЛА (в личке с ботом) =====
bot.use(async (ctx, next) => {
  if (ctx.chat?.type !== 'private') return next();

  const uid = ctx.from?.id;
  if (!uid) return;

  try {
    const admins = await ctx.api.getChatAdministrators(CHANNEL_ID);
    const isAdmin = admins.some((a) => a.user.id === uid);

    if (isAdmin) {
      return next();
    } else {
      await ctx.reply('Этот бот доступен только администраторам канала.');
      return;
    }
  } catch (e) {
    console.error('Ошибка при проверке админов:', e);
    await ctx.reply('Не удалось проверить права. Попробуйте позже.');
    return;
  }
});

// ===== КНОПКА MINI APP =====
const startappUrl = `https://t.me/${BOT_USERNAME}?startapp`;
const kb = new InlineKeyboard().url('Открыть курсы', startappUrl);

// ===== ТЕКСТ ПОСТА (без "База/Пары") =====
function buildPostText() {
  return '🏦 Актуальные курсы основных валют доступны в приложении канала «Инсайды с Wall Street».';
}

// Унифицированная отправка поста с сохранением message_id
async function sendWallStreetPost(api) {
  const text = buildPostText();
  const msg = await api.sendMessage(CHANNEL_ID, text, { reply_markup: kb });
  await saveLastMessageId(msg.message_id);
  return msg;
}

// ===== КОМАНДЫ ДЛЯ РУЧНОГО УПРАВЛЕНИЯ =====
bot.command('start', (ctx) =>
  ctx.reply('Я готов. Используй /post или /pin.'),
);

bot.command('post', async (ctx) => {
  await sendWallStreetPost(ctx.api);
  await ctx.reply('Отправил пост с кнопкой.');
});

bot.command('pin', async (ctx) => {
  const msg = await sendWallStreetPost(ctx.api);
  try {
    await ctx.api.pinChatMessage(CHANNEL_ID, msg.message_id, {
      disable_notification: true,
    });
    await ctx.reply('Сообщение отправлено и закреплено.');
  } catch (e) {
    await ctx.reply(
      'Отправил сообщение, но не смог закрепить (нет прав на закрепление).',
    );
  }
});

// ===== ЕЖЕДНЕВНЫЙ ПОСТ В 08:36 (Europe/Berlin) С УДАЛЕНИЕМ ПРОШЛОГО =====
cron.schedule(
  '36 8 * * *',
  async () => {
    console.log('[CRON] Запуск ежедневного поста 08:36');

    try {
      // 1) Удаляем прошлый пост, если он есть
      const lastId = await readLastMessageId();
      if (lastId) {
        try {
          await bot.api.deleteMessage(CHANNEL_ID, lastId);
          console.log('[CRON] Удалил прошлый пост с message_id =', lastId);
        } catch (e) {
          console.error(
            '[CRON] Не удалось удалить прошлый пост (возможно, уже удалён или нет прав):',
            e.description || e,
          );
        }
      }

      // 2) Отправляем новый пост
      const msg = await sendWallStreetPost(bot.api);
      console.log('[CRON] Отправил новый пост с message_id =', msg.message_id);
    } catch (e) {
      console.error('[CRON] Ошибка в расписании:', e);
    }
  },
  {
    timezone: 'Europe/Berlin',
  },
);

bot.catch((err) => {
  console.error('Bot error:', err);
});

bot.start();
console.log('Bot started. Use /post or /pin');
