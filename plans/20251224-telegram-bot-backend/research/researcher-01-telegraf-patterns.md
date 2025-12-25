# Research Report: Telegraf.js Bot Framework Patterns

**Date:** 2024-12-24  
**Topic:** Telegraf middleware, sessions, inline keyboards, scenes/wizards  
**Telegraf Version:** 4.16.x

---

## Executive Summary

Telegraf.js is mature Node.js framework for Telegram bots using Koa-style middleware. Key features: composable middleware chain, built-in session management, Scenes/WizardScene for multi-step flows, Markup helpers for inline keyboards.

---

## 1. Middleware Pattern

Koa-style middleware with `ctx` and `next()`. Order matters - register session before handlers.

```javascript
const { Telegraf } = require('telegraf');
const bot = new Telegraf(process.env.BOT_TOKEN);

// Logging middleware
bot.use(async (ctx, next) => {
  const start = Date.now();
  await next();
  console.log(`Response time: ${Date.now() - start}ms`);
});
```

---

## 2. Session Management

Memory session (dev) vs persistent storage (prod).

```javascript
const { session } = require('telegraf');

bot.use(session({
  defaultSession: () => ({ step: 'idle' })
}));
```

---

## 3. Inline Keyboard Best Practices

Keep `callback_data` short (<64 bytes). Use prefixes for routing.

```javascript
const { Markup } = require('telegraf');

const mainMenuKeyboard = Markup.inlineKeyboard([
  [Markup.button.callback('🔗 Tạo Link Affiliate', 'menu:affiliate')],
  [Markup.button.callback('👥 Link Giới Thiệu', 'menu:referral')],
  [
    Markup.button.callback('💰 Hoa Hồng', 'menu:commission'),
    Markup.button.callback('📊 Thống Kê', 'menu:stats')
  ],
  [
    Markup.button.callback('💸 Rút Tiền', 'menu:withdraw'),
    Markup.button.callback('🏦 Tài Khoản NH', 'menu:bank')
  ]
]);
```

---

## 4. Callback Query Handling

Always call `answerCbQuery()` to dismiss loading state.

```javascript
bot.action(/^menu:(.+)$/, async (ctx) => {
  const action = ctx.match[1];
  await ctx.answerCbQuery();
  
  switch (action) {
    case 'affiliate':
      await ctx.scene.enter('affiliate-convert');
      break;
    case 'bank':
      await ctx.scene.enter('bank-registration');
      break;
  }
});
```

---

## 5. WizardScene for Multi-Step Flows

Bank registration example:

```javascript
const { Scenes, Markup } = require('telegraf');

const bankRegistrationWizard = new Scenes.WizardScene(
  'bank-registration',
  
  // Step 0: Select bank
  async (ctx) => {
    await ctx.reply('Chọn ngân hàng:', Markup.inlineKeyboard([
      [Markup.button.callback('Vietcombank', 'wizard:bank:vcb')],
      [Markup.button.callback('Techcombank', 'wizard:bank:tcb')],
      [Markup.button.callback('MB Bank', 'wizard:bank:mb')],
      [Markup.button.callback('❌ Hủy', 'wizard:cancel')]
    ]));
    return ctx.wizard.next();
  },
  
  // Step 1: Enter account number
  async (ctx) => {
    if (!ctx.message?.text) return;
    const accountNumber = ctx.message.text;
    if (!/^\d{6,20}$/.test(accountNumber)) {
      await ctx.reply('Số tài khoản không hợp lệ. Nhập lại (6-20 số):');
      return;
    }
    ctx.wizard.state.accountNumber = accountNumber;
    await ctx.reply('Nhập tên chủ tài khoản:');
    return ctx.wizard.next();
  },
  
  // Step 2: Enter holder name + confirm
  async (ctx) => {
    if (!ctx.message?.text) return;
    ctx.wizard.state.accountHolder = ctx.message.text;
    
    const { bankCode, accountNumber, accountHolder } = ctx.wizard.state;
    await ctx.reply(
      `Xác nhận thông tin:\n🏦 Ngân hàng: ${bankCode}\n💳 STK: ${accountNumber}\n👤 Chủ TK: ${accountHolder}`,
      Markup.inlineKeyboard([
        [Markup.button.callback('✅ Xác nhận', 'wizard:confirm')],
        [Markup.button.callback('❌ Hủy', 'wizard:cancel')]
      ])
    );
    return ctx.wizard.next();
  }
);

// Wizard action handlers
bankRegistrationWizard.action(/^wizard:bank:(.+)$/, async (ctx) => {
  ctx.wizard.state.bankCode = ctx.match[1];
  await ctx.answerCbQuery();
  await ctx.editMessageText(`Đã chọn: ${ctx.match[1]}\nNhập số tài khoản:`);
});

bankRegistrationWizard.action('wizard:confirm', async (ctx) => {
  await ctx.answerCbQuery('Đã lưu!');
  // Save to database here
  await ctx.editMessageText('✅ Đăng ký tài khoản thành công!');
  return ctx.scene.leave();
});

bankRegistrationWizard.action('wizard:cancel', async (ctx) => {
  await ctx.answerCbQuery('Đã hủy');
  await ctx.editMessageText('❌ Đã hủy đăng ký.');
  return ctx.scene.leave();
});

// Register stage
const stage = new Scenes.Stage([bankRegistrationWizard]);
bot.use(stage.middleware());
```

---

## 6. Error Handling

```javascript
bot.catch((err, ctx) => {
  console.error(`Error for ${ctx.updateType}:`, err);
  ctx.reply('Đã xảy ra lỗi. Vui lòng thử /start lại.').catch(() => {});
});
```

---

## 7. Complete Bot Initialization

```javascript
const { Telegraf, Scenes, session } = require('telegraf');

const bot = new Telegraf(process.env.BOT_TOKEN);

// 1. Session middleware
bot.use(session({ defaultSession: () => ({ step: 'idle' }) }));

// 2. Scene stage
const stage = new Scenes.Stage([bankRegistrationWizard, affiliateWizard]);
bot.use(stage.middleware());

// 3. Commands
bot.command('start', (ctx) => ctx.reply('Chào mừng!', mainMenuKeyboard));

// 4. Callback handlers
bot.action(/^menu:(.+)$/, handleMenuAction);

// 5. Error handler
bot.catch((err, ctx) => console.error(err));

// 6. Launch
bot.launch();
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
```

---

## Key Recommendations

1. Use WizardScene for bank registration, withdraw flows
2. Always call `answerCbQuery()` within 30s
3. Prefix callback_data: `menu:`, `wizard:`, `action:`
4. Validate each wizard step before `ctx.wizard.next()`
5. Handle SIGINT/SIGTERM for graceful shutdown

---

## Unresolved Questions

1. Redis session config for production scaling
2. State persistence across bot restarts
