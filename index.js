const { Telegraf, Markup } = require('telegraf');
const { ConvexHttpClient } = require('convex/browser');
const express = require('express');
const path = require('path');

// --- 1. CONFIGURATION ---
const BOT_TOKEN = process.env.BOT_TOKEN;
const CONVEX_URL = process.env.CONVEX_URL;
const BOT_SECRET = process.env.BOT_SECRET;
const PORT = process.env.PORT || 3000;
const ADMIN_ID = 1299129410; // Your Chat ID

// --- 2. WEB SERVER (Privacy Policy + Uptime + HTTP API) ---
const app = express();
app.use(express.static(path.join(__dirname, 'public')));

// CORS: the website (shovith.runs-on.dev) calls the verify API from the
// browser, so preflights and responses must carry these headers.
const SITE_ORIGIN = 'https://shovith.runs-on.dev';
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', SITE_ORIGIN);
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

app.get('/', (req, res) => {
  res.send('Bot is running securely. Go to /privacy.html to view the policy.');
});

app.get('/privacy', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'privacy.html'));
});

// The website verifies the OTP against Convex through this endpoint.
app.use(express.json());
app.post('/api/verify-otp', async (req, res) => {
  try {
    const { sessionId, code, project, file } = req.body || {};
    if (!sessionId || !code || !file) {
      return res.status(400).json({ ok: false, error: 'Missing fields.' });
    }

    const result = await convex.mutation(anyApi.otp.verify, {
      sessionId,
      code: String(code),
      project: String(project || ''),
      file: String(file),
    });

    res.json(result);
  } catch (error) {
    console.error('❌ Verify API Error:', error.message);
    res.status(500).json({ ok: false, error: 'Verification failed. Try again.' });
  }
});

app.listen(PORT, () => {
  console.log(`✅ Web Server running on port ${PORT}`);
});

// --- 3. CONVEX INITIALIZATION ---
if (!BOT_TOKEN || !CONVEX_URL || !BOT_SECRET) {
  console.error('❌ CRITICAL ERROR: Missing Env Vars (BOT_TOKEN, CONVEX_URL, BOT_SECRET).');
  process.exit(1);
}

const convex = new ConvexHttpClient(CONVEX_URL);
const { anyApi } = require('convex/server');
const bot = new Telegraf(BOT_TOKEN);

async function runConvex(fn, args) {
  // The public functions re-check the shared secret themselves.
  return convex.mutation(fn, { ...args, secret: BOT_SECRET });
}

// --- 4. HELPERS ---
const addCodeSessions = new Map();

function generateOTP() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

function generateResourceCode() {
  return `REDM-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
}

function getUptime() {
  const uptime = process.uptime();
  const hours = Math.floor(uptime / 3600);
  const minutes = Math.floor((uptime % 3600) / 60);
  const seconds = Math.floor(uptime % 60);
  return `${hours}h ${minutes}m ${seconds}s`;
}

// Fetch available codes for the admin list
async function fetchAvailableCodes() {
  try {
    const rows = await convex.query(anyApi.accesscodes.listAvailable, {
      secret: BOT_SECRET,
    });

    if (!rows.length) return '📭 No available codes found in the database.';

    let message = '📋 *Available Resource Codes*\n\n';
    let currentResource = '';

    for (const row of rows) {
      if (currentResource !== row.resourceName) {
        currentResource = row.resourceName;
        message += `\n📂 *${currentResource}*\n`;
      }
      message += `• \`${row.code}\`\n`;
    }

    return message;
  } catch (error) {
    console.error('❌ fetchAvailableCodes Error:', error.message);
    throw error;
  }
}

// --- 5. BOT LOGIC ---

// A. HANDLE /start COMMAND
bot.start(async (ctx) => {
  const sessionId = ctx.startPayload;
  const user = ctx.from;

  console.log(`📩 Start Request from: ${user.first_name} (ID: ${user.id})`);

  if (!sessionId) {
    return ctx.reply('👋 Welcome! Please go to the website and click \'Verify via Telegram\' to start.');
  }

  try {
    await runConvex(anyApi.otp.startSession, {
      telegramId: user.id.toString(),
      sessionId,
    });

    await ctx.reply(
      '🔐 *Security Check*\n\nTo verify your identity and receive your code, please tap the button below to share your phone number.',
      {
        parse_mode: 'Markdown',
        ...Markup.keyboard([
          Markup.button.contactRequest('📱 Share Phone Number'),
        ]).resize().oneTime(),
      }
    );
  } catch (error) {
    console.error('❌ Start Error:', error.message);
    ctx.reply('⚠️ System Error. Please try again.');
  }
});

// B. GETCODES COMMAND (Admin Only)
bot.command('getcodes', async (ctx) => {
  console.log(`🔍 Received /getcodes from ID: ${ctx.from.id}`);

  if (ctx.from.id !== ADMIN_ID) {
    console.warn(`⛔ Unauthorized access attempt by ID: ${ctx.from.id}`);
    return ctx.reply('⛔ Unauthorized.');
  }

  try {
    const message = await fetchAvailableCodes();
    await ctx.reply(message, {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([
        [Markup.button.callback('🔄 Refresh List', 'refresh_codes_list')],
      ]),
    });
  } catch (err) {
    console.error('❌ Command Execution Error:', err.message);
    ctx.reply('⚠️ Failed to fetch codes. Check Render logs for details.');
  }
});

bot.action('refresh_codes_list', async (ctx) => {
  if (ctx.from.id !== ADMIN_ID) return ctx.answerCbQuery('Unauthorized.');

  try {
    const message = await fetchAvailableCodes();
    await ctx.editMessageText(message, {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([
        [Markup.button.callback('🔄 Refresh List', 'refresh_codes_list')],
      ]),
    });
    await ctx.answerCbQuery('List Refreshed! ✨');
  } catch (e) {
    await ctx.answerCbQuery('No changes found or Error.');
  }
});

// --- DELETECODES COMMAND (Admin Only) ---
bot.command('deletecodes', async (ctx) => {
  if (ctx.from.id !== ADMIN_ID) return ctx.reply('⛔ Unauthorized.');

  try {
    const count = await runConvex(anyApi.accesscodes.deleteUsed, {});
    ctx.reply(`✅ Successfully deleted ${count} used codes from the database.`);
    console.log(`🗑️ Admin ${ctx.from.id} deleted ${count} used codes.`);
  } catch (error) {
    console.error('❌ Delete Error:', error.message);
    ctx.reply('⚠️ Error occurred while deleting used codes.');
  }
});

// --- ADDCODES COMMAND (Admin Only) ---
bot.command('addcodes', (ctx) => {
  if (ctx.from.id !== ADMIN_ID) return ctx.reply('⛔ Unauthorized.');

  addCodeSessions.set(ctx.from.id, { step: 'ASK_COUNT' });
  ctx.reply('🔢 How many codes would you like to generate? (1-50)');
});

// --- MULTI-STEP TEXT HANDLER ---
bot.on('text', async (ctx, next) => {
  const session = addCodeSessions.get(ctx.from.id);
  if (!session) return next();

  const input = ctx.message.text.trim();

  switch (session.step) {
    case 'ASK_COUNT':
      const count = parseInt(input);
      if (isNaN(count) || count <= 0 || count > 50) return ctx.reply('❌ Invalid number. Enter 1-50.');
      session.count = count;
      session.step = 'ASK_NAME';
      ctx.reply('📂 Enter the **Resource Name** (Exactly as it appears in React):', { parse_mode: 'Markdown' });
      break;

    case 'ASK_NAME':
      session.name = input;
      session.step = 'ASK_LINK';
      ctx.reply('🔗 Paste the **Download Link** for this resource:');
      break;

    case 'ASK_LINK':
      session.link = input;
      session.step = 'PREVIEW';
      session.codes = Array.from({ length: session.count }, () => generateResourceCode());

      const preview = `📜 *Codes for ${session.name}*\n\n` +
                      session.codes.map((c) => `\`${c}\``).join('\n') +
                      `\n\n🔗 *Link:* ${session.link}`;

      ctx.reply(preview, {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
          [Markup.button.callback('✅ Add to DB', 'confirm_add')],
          [Markup.button.callback('🔄 Regenerate', 'regenerate_codes')],
          [Markup.button.callback('❌ Cancel', 'cancel_add')],
        ]),
      });
      break;
  }
});

// --- CALLBACK ACTIONS ---
bot.action('confirm_add', async (ctx) => {
  const session = addCodeSessions.get(ctx.from.id);
  if (!session) return ctx.answerCbQuery('Session Expired.');

  try {
    const count = await runConvex(anyApi.accesscodes.addMany, {
      resourceName: session.name,
      downloadUrl: session.link,
      codes: session.codes,
    });

    await ctx.editMessageText(`✅ Added ${count} codes for *${session.name}* to the database.`, { parse_mode: 'Markdown' });
    addCodeSessions.delete(ctx.from.id);
  } catch (e) {
    ctx.reply('❌ Database Error.');
  }
});

bot.action('regenerate_codes', async (ctx) => {
  const session = addCodeSessions.get(ctx.from.id);
  if (!session) return ctx.answerCbQuery();

  session.codes = Array.from({ length: session.count }, () => generateResourceCode());
  const preview = `🔄 *Regenerated Codes for ${session.name}*\n\n` +
                  session.codes.map((c) => `\`${c}\``).join('\n');

  ctx.editMessageText(preview, {
    parse_mode: 'Markdown',
    ...Markup.inlineKeyboard([
      [Markup.button.callback('✅ Add to DB', 'confirm_add')],
      [Markup.button.callback('🔄 Regenerate', 'regenerate_codes')],
      [Markup.button.callback('❌ Cancel', 'cancel_add')],
    ]),
  });
});

bot.action('cancel_add', (ctx) => {
  addCodeSessions.delete(ctx.from.id);
  ctx.editMessageText('❌ Cancelled.');
});

// --- HANDLE CONTACT SHARING & OTP ---
bot.on('contact', async (ctx) => {
  const user = ctx.from;
  const contact = ctx.message.contact;

  if (contact.user_id !== user.id) {
    return ctx.reply('⚠️ Error: Please share your own contact.');
  }

  try {
    const result = await runConvex(anyApi.otp.issueOtp, {
      telegramId: user.id.toString(),
      name: [user.first_name, user.last_name].filter(Boolean).join(' '),
      username: user.username || 'No Username',
      phoneNumber: contact.phone_number,
    });

    if (!result || !result.ok) {
      return ctx.reply(
        '⚠️ Session expired. Please click \'Verify via Telegram\' on the website again.',
        Markup.removeKeyboard(),
      );
    }

    await ctx.reply(`✅ *Verification Successful*\n\nYour code is:\n\`${result.otp}\`\n\n(Tap to copy)`, {
      parse_mode: 'Markdown',
      ...Markup.removeKeyboard(),
    });
  } catch (error) {
    console.error('❌ Contact Error:', error.message);
    ctx.reply('⚠️ Error processing contact.');
  }
});

// --- ADMIN SOCIALS & INFO ---
bot.command('admin_socials', (ctx) => {
  ctx.reply('📞 *Contact Admin* via these social media platforms.', {
    parse_mode: 'Markdown',
    ...Markup.inlineKeyboard([
      [Markup.button.url('WhatsApp', 'https://wa.me/918777845713')],
      [Markup.button.url('Telegram', 'https://t.me/X_o_x_o_002')],
    ]),
  });
});

bot.command('info', async (ctx) => {
  try {
    const botInfo = await ctx.telegram.getMe();
    const photos = await ctx.telegram.getUserProfilePhotos(botInfo.id, 0, 1);
    let photoSource = (photos.total_count > 0) ? photos.photos[0][photos.photos[0].length - 1].file_id : 'https://raw.githubusercontent.com/Hawkay002/my-portfolio-bot/main/IMG_20260131_132820_711.jpg';

    const infoMessage = `
<b>🤖 Bot Identity</b>
<blockquote><b>Name:</b> ${botInfo.first_name}
<b>Username:</b> @${botInfo.username}
<b>Bot ID:</b> <code>${botInfo.id}</code></blockquote>

<b>⚙️ Bot Infrastructure</b>
<blockquote><b>👤 Creator:</b> Shovith (Sid)
<b>⏱ Uptime:</b> ${getUptime()} । Uptimerobot.com
<b>🛠 Language:</b> Node.js
<b>📚 Library:</b> Telegraf.js
<b>🗄 Database:</b> Convex
<b>☁️ Hosting:</b> Render</blockquote>
<i>© 2026 ${botInfo.first_name}. All rights reserved.</i>`;

    await ctx.replyWithPhoto(photoSource, { caption: infoMessage, parse_mode: 'HTML' });
  } catch (error) {
    console.error('❌ Info Command Error:', error);
    ctx.reply('⚠️ Could not fetch bot info.');
  }
});

// --- LAUNCH ---
bot.launch();
console.log('🚀 Telegram Bot Started...');

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
