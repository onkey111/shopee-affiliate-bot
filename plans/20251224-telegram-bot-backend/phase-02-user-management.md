# Phase 2: User Management

**Parent Plan:** [plan.md](./plan.md)  
**Dependencies:** [Phase 1](./phase-01-core-infrastructure.md)  
**Status:** pending  
**Priority:** High  
**Estimate:** 3 hours

---

## Overview

Implement user registration via /start command with referral code handling, user repository, bank account registration flow (WizardScene), and main menu keyboard.

---

## Requirements

- /start command creates user if not exists
- /start?ref=CODE links new user to referrer
- Generate unique 8-char ref_code per user
- Bank account registration via WizardScene
- Main menu inline keyboard
- User repository with CRUD operations

---

## Architecture

### Code Structure
```
src/
├── bot/
│   ├── index.js              # Add Stage middleware
│   ├── commands/
│   │   └── start-command.js  # /start handler
│   ├── callbacks/
│   │   └── main-menu-callback.js
│   ├── keyboards/
│   │   └── inline-keyboards.js
│   └── scenes/
│       └── bank-registration-scene.js
├── db/
│   └── repositories/
│       └── user-repository.js
├── services/
│   └── user-service.js
└── utils/
    └── ref-code-generator.js
```

### Bot UI - Main Menu
```
┌─────────────────────────────────────────┐
│  Chao mung [Name]! Chon chuc nang:      │
├─────────────────────────────────────────┤
│  [ 🔗 Tao Link Affiliate ]              │
│  [ 👥 Link Gioi Thieu ]                 │
│  [ 💰 Hoa Hong ] [ 📊 Thong Ke ]        │
│  [ 💸 Rut Tien ] [ 🏦 Tai Khoan NH ]    │
└─────────────────────────────────────────┘
```

---

## Related Code Files

| File | Purpose |
|------|---------|
| `src/bot/commands/start-command.js` | /start with referral handling |
| `src/bot/callbacks/main-menu-callback.js` | Menu button actions |
| `src/bot/keyboards/inline-keyboards.js` | Keyboard builders |
| `src/bot/scenes/bank-registration-scene.js` | Bank WizardScene |
| `src/db/repositories/user-repository.js` | User CRUD |
| `src/services/user-service.js` | User business logic |
| `src/utils/ref-code-generator.js` | Generate unique codes |

---

## Implementation Steps

### Step 1: Create src/utils/ref-code-generator.js
```javascript
const crypto = require('crypto');

/**
 * Generate unique 8-char alphanumeric ref code
 */
function generateRefCode() {
    return crypto.randomBytes(4).toString('hex').toUpperCase();
}

module.exports = { generateRefCode };
```

### Step 2: Create src/db/repositories/user-repository.js
```javascript
const db = require('../connection');

const userRepo = {
    async findByTelegramId(telegramId) {
        const result = await db.query(
            'SELECT * FROM users WHERE telegram_id = $1',
            [telegramId]
        );
        return result.rows[0] || null;
    },

    async findByRefCode(refCode) {
        const result = await db.query(
            'SELECT * FROM users WHERE ref_code = $1',
            [refCode]
        );
        return result.rows[0] || null;
    },

    async findById(id) {
        const result = await db.query(
            'SELECT * FROM users WHERE id = $1',
            [id]
        );
        return result.rows[0] || null;
    },

    async create(data) {
        const result = await db.query(
            `INSERT INTO users (telegram_id, telegram_username, telegram_first_name, ref_code, referred_by)
             VALUES ($1, $2, $3, $4, $5)
             RETURNING *`,
            [data.telegramId, data.username, data.firstName, data.refCode, data.referredBy]
        );
        return result.rows[0];
    },

    async updateDailyLinks(userId, count, date) {
        await db.query(
            `UPDATE users SET daily_links = $1, daily_links_date = $2, updated_at = NOW()
             WHERE id = $3`,
            [count, date, userId]
        );
    },

    async incrementTotalLinks(userId) {
        await db.query(
            `UPDATE users SET total_links = total_links + 1, updated_at = NOW()
             WHERE id = $1`,
            [userId]
        );
    },

    async addBalance(userId, amount) {
        await db.query(
            `UPDATE users SET balance = balance + $1, updated_at = NOW()
             WHERE id = $2`,
            [amount, userId]
        );
    },

    async deductBalance(userId, amount) {
        await db.query(
            `UPDATE users SET balance = balance - $1, updated_at = NOW()
             WHERE id = $2`,
            [amount, userId]
        );
    },

    async countReferrals(userId) {
        const result = await db.query(
            'SELECT COUNT(*) as count FROM users WHERE referred_by = $1',
            [userId]
        );
        return parseInt(result.rows[0].count);
    },

    async getBankAccount(userId) {
        const result = await db.query(
            'SELECT * FROM bank_accounts WHERE user_id = $1',
            [userId]
        );
        return result.rows[0] || null;
    },

    async saveBankAccount(userId, bankName, accountNumber, accountHolder) {
        // Upsert
        await db.query(
            `INSERT INTO bank_accounts (user_id, bank_name, account_number, account_holder)
             VALUES ($1, $2, $3, $4)
             ON CONFLICT (user_id) DO UPDATE SET
                bank_name = $2, account_number = $3, account_holder = $4, updated_at = NOW()`,
            [userId, bankName, accountNumber, accountHolder]
        );
    }
};

module.exports = userRepo;
```

### Step 3: Create src/services/user-service.js
```javascript
const userRepo = require('../db/repositories/user-repository');
const { generateRefCode } = require('../utils/ref-code-generator');
const config = require('../config');

const userService = {
    /**
     * Get or create user from Telegram context
     * @param {object} from - ctx.from object
     * @param {string|null} refCodeParam - Referral code from /start param
     */
    async getOrCreateUser(from, refCodeParam = null) {
        // Check existing user
        let user = await userRepo.findByTelegramId(from.id);
        if (user) return { user, isNew: false };

        // Find referrer if refCode provided
        let referrerId = null;
        if (refCodeParam) {
            const referrer = await userRepo.findByRefCode(refCodeParam);
            if (referrer && referrer.telegram_id !== from.id) {
                referrerId = referrer.id;
            }
        }

        // Generate unique ref code
        let refCode;
        let attempts = 0;
        do {
            refCode = generateRefCode();
            const existing = await userRepo.findByRefCode(refCode);
            if (!existing) break;
            attempts++;
        } while (attempts < 10);

        // Create user
        user = await userRepo.create({
            telegramId: from.id,
            username: from.username,
            firstName: from.first_name,
            refCode,
            referredBy: referrerId
        });

        return { user, isNew: true, referrerId };
    },

    /**
     * Check if user can create more links today
     */
    async canCreateLink(user) {
        const today = new Date().toISOString().split('T')[0];
        
        if (user.daily_links_date !== today) {
            // Reset daily count
            await userRepo.updateDailyLinks(user.id, 0, today);
            return { allowed: true, remaining: config.limits.dailyLinks };
        }

        const remaining = config.limits.dailyLinks - user.daily_links;
        return { allowed: remaining > 0, remaining };
    },

    /**
     * Record link creation
     */
    async recordLinkCreation(userId) {
        const today = new Date().toISOString().split('T')[0];
        const user = await userRepo.findById(userId);
        
        let newCount = 1;
        if (user.daily_links_date === today) {
            newCount = user.daily_links + 1;
        }
        
        await userRepo.updateDailyLinks(userId, newCount, today);
        await userRepo.incrementTotalLinks(userId);
    }
};

module.exports = userService;
```

### Step 4: Create src/bot/keyboards/inline-keyboards.js
```javascript
const { Markup } = require('telegraf');

const keyboards = {
    mainMenu() {
        return Markup.inlineKeyboard([
            [Markup.button.callback('🔗 Tao Link Affiliate', 'menu:affiliate')],
            [Markup.button.callback('👥 Link Gioi Thieu', 'menu:referral')],
            [
                Markup.button.callback('💰 Hoa Hong', 'menu:commission'),
                Markup.button.callback('📊 Thong Ke', 'menu:stats')
            ],
            [
                Markup.button.callback('💸 Rut Tien', 'menu:withdraw'),
                Markup.button.callback('🏦 Tai Khoan NH', 'menu:bank')
            ]
        ]);
    },

    backToMenu() {
        return Markup.inlineKeyboard([
            [Markup.button.callback('⬅️ Quay lai Menu', 'menu:main')]
        ]);
    },

    bankSelection() {
        return Markup.inlineKeyboard([
            [Markup.button.callback('Vietcombank', 'bank:VCB')],
            [Markup.button.callback('Techcombank', 'bank:TCB')],
            [Markup.button.callback('MB Bank', 'bank:MB')],
            [Markup.button.callback('BIDV', 'bank:BIDV')],
            [Markup.button.callback('VPBank', 'bank:VPB')],
            [Markup.button.callback('Khac...', 'bank:OTHER')],
            [Markup.button.callback('❌ Huy', 'bank:cancel')]
        ]);
    },

    confirm() {
        return Markup.inlineKeyboard([
            [
                Markup.button.callback('✅ Xac nhan', 'confirm:yes'),
                Markup.button.callback('❌ Huy', 'confirm:no')
            ]
        ]);
    }
};

module.exports = keyboards;
```

### Step 5: Create src/bot/commands/start-command.js
```javascript
const userService = require('../../services/user-service');
const keyboards = require('../keyboards/inline-keyboards');
const logger = require('../../utils/logger');

async function startCommand(ctx) {
    try {
        // Parse referral code from /start param
        const startPayload = ctx.message.text.split(' ')[1]; // e.g., "REF123ABC"
        
        const { user, isNew, referrerId } = await userService.getOrCreateUser(
            ctx.from, 
            startPayload
        );

        let welcomeMsg = `Chao mung ${ctx.from.first_name}! 👋\n\n`;

        if (isNew) {
            welcomeMsg += `Ban da duoc dang ky thanh cong!\n`;
            welcomeMsg += `Ma gioi thieu cua ban: ${user.ref_code}\n\n`;
            
            if (referrerId) {
                welcomeMsg += `✨ Ban duoc gioi thieu boi mot nguoi dung khac!\n\n`;
            }
        }

        welcomeMsg += `Chon chuc nang ben duoi:`;

        await ctx.reply(welcomeMsg, keyboards.mainMenu());
        
        logger.info('User started bot', { 
            userId: user.id, 
            telegramId: ctx.from.id, 
            isNew,
            referrerId 
        });
    } catch (err) {
        logger.error('Start command error', { error: err.message });
        await ctx.reply('Co loi xay ra. Vui long thu lai sau.');
    }
}

module.exports = { startCommand };
```

### Step 6: Create src/bot/scenes/bank-registration-scene.js
```javascript
const { Scenes, Markup } = require('telegraf');
const userRepo = require('../../db/repositories/user-repository');
const keyboards = require('../keyboards/inline-keyboards');
const logger = require('../../utils/logger');

const BANK_NAMES = {
    VCB: 'Vietcombank',
    TCB: 'Techcombank',
    MB: 'MB Bank',
    BIDV: 'BIDV',
    VPB: 'VPBank'
};

const bankRegistrationScene = new Scenes.WizardScene(
    'bank-registration',

    // Step 0: Show current info or prompt bank selection
    async (ctx) => {
        const user = ctx.session.user;
        const bankAccount = await userRepo.getBankAccount(user.id);

        if (bankAccount) {
            const msg = `🏦 Tai khoan hien tai:\n\n` +
                `Ngan hang: ${bankAccount.bank_name}\n` +
                `STK: ${bankAccount.account_number}\n` +
                `Chu TK: ${bankAccount.account_holder}\n\n` +
                `Muon cap nhat? Chon ngan hang moi:`;
            await ctx.reply(msg, keyboards.bankSelection());
        } else {
            await ctx.reply('Chon ngan hang:', keyboards.bankSelection());
        }
        return ctx.wizard.next();
    },

    // Step 1: Wait for bank selection callback, then ask account number
    async (ctx) => {
        // This step handles text input for account number
        if (!ctx.message?.text) {
            await ctx.reply('Vui long nhap so tai khoan (6-20 so):');
            return;
        }

        const accountNumber = ctx.message.text.trim();
        if (!/^\d{6,20}$/.test(accountNumber)) {
            await ctx.reply('So tai khoan khong hop le. Nhap lai (6-20 so):');
            return;
        }

        ctx.wizard.state.accountNumber = accountNumber;
        await ctx.reply('Nhap ten chu tai khoan (in hoa, khong dau):');
        return ctx.wizard.next();
    },

    // Step 2: Get holder name and confirm
    async (ctx) => {
        if (!ctx.message?.text) {
            await ctx.reply('Vui long nhap ten chu tai khoan:');
            return;
        }

        const accountHolder = ctx.message.text.trim().toUpperCase();
        if (accountHolder.length < 3) {
            await ctx.reply('Ten khong hop le. Nhap lai:');
            return;
        }

        ctx.wizard.state.accountHolder = accountHolder;

        const { bankCode, bankName, accountNumber } = ctx.wizard.state;
        const confirmMsg = `Xac nhan thong tin:\n\n` +
            `🏦 Ngan hang: ${bankName}\n` +
            `💳 STK: ${accountNumber}\n` +
            `👤 Chu TK: ${accountHolder}`;

        await ctx.reply(confirmMsg, keyboards.confirm());
        return ctx.wizard.next();
    },

    // Step 3: Wait for confirmation callback
    async (ctx) => {
        // This step just waits for callback
        await ctx.reply('Nhan nut Xac nhan hoac Huy.');
    }
);

// Handle bank selection callbacks
bankRegistrationScene.action(/^bank:(.+)$/, async (ctx) => {
    const code = ctx.match[1];
    await ctx.answerCbQuery();

    if (code === 'cancel') {
        await ctx.editMessageText('Da huy dang ky tai khoan.');
        return ctx.scene.leave();
    }

    if (code === 'OTHER') {
        await ctx.editMessageText('Nhap ten ngan hang:');
        ctx.wizard.state.bankCode = 'OTHER';
        ctx.wizard.state.waitingBankName = true;
        return;
    }

    ctx.wizard.state.bankCode = code;
    ctx.wizard.state.bankName = BANK_NAMES[code] || code;
    await ctx.editMessageText(`Da chon: ${ctx.wizard.state.bankName}\n\nNhap so tai khoan:`);
});

// Handle text input for custom bank name
bankRegistrationScene.on('text', async (ctx, next) => {
    if (ctx.wizard.state.waitingBankName) {
        ctx.wizard.state.bankName = ctx.message.text.trim();
        ctx.wizard.state.waitingBankName = false;
        await ctx.reply('Nhap so tai khoan:');
        return;
    }
    return next();
});

// Handle confirmation callbacks
bankRegistrationScene.action('confirm:yes', async (ctx) => {
    await ctx.answerCbQuery('Dang luu...');

    try {
        const user = ctx.session.user;
        const { bankName, accountNumber, accountHolder } = ctx.wizard.state;

        await userRepo.saveBankAccount(user.id, bankName, accountNumber, accountHolder);

        await ctx.editMessageText('✅ Dang ky tai khoan thanh cong!');
        logger.info('Bank account saved', { userId: user.id });
    } catch (err) {
        logger.error('Bank save error', { error: err.message });
        await ctx.editMessageText('❌ Loi khi luu. Thu lai sau.');
    }

    return ctx.scene.leave();
});

bankRegistrationScene.action('confirm:no', async (ctx) => {
    await ctx.answerCbQuery('Da huy');
    await ctx.editMessageText('❌ Da huy dang ky.');
    return ctx.scene.leave();
});

module.exports = { bankRegistrationScene };
```

### Step 7: Create src/bot/callbacks/main-menu-callback.js
```javascript
const userService = require('../../services/user-service');
const userRepo = require('../../db/repositories/user-repository');
const keyboards = require('../keyboards/inline-keyboards');
const config = require('../../config');

async function handleMenuCallback(ctx) {
    const action = ctx.match[1];
    await ctx.answerCbQuery();

    // Refresh user data
    const user = await userRepo.findByTelegramId(ctx.from.id);
    if (!user) {
        await ctx.reply('Vui long /start lai.');
        return;
    }
    ctx.session.user = user;

    switch (action) {
        case 'main':
            await ctx.editMessageText(
                `Chao ${ctx.from.first_name}! Chon chuc nang:`,
                keyboards.mainMenu()
            );
            break;

        case 'affiliate':
            // Check daily limit
            const { allowed, remaining } = await userService.canCreateLink(user);
            if (!allowed) {
                await ctx.editMessageText(
                    `❌ Ban da het 5 luot tao link hom nay.\nQuay lai ngay mai!`,
                    keyboards.backToMenu()
                );
            } else {
                ctx.session.waitingForLink = true;
                await ctx.editMessageText(
                    `🔗 Gui link Shopee can convert (con ${remaining}/5 luot hom nay):\n\n` +
                    `Vi du: https://shopee.vn/product/123/456`,
                    keyboards.backToMenu()
                );
            }
            break;

        case 'referral':
            const botUsername = ctx.botInfo.username;
            const refLink = `https://t.me/${botUsername}?start=${user.ref_code}`;
            await ctx.editMessageText(
                `👥 Link gioi thieu cua ban:\n\n${refLink}\n\n` +
                `Chia se link nay. Moi don hang tu nguoi ban gioi thieu, ban nhan 10% hoa hong!`,
                keyboards.backToMenu()
            );
            break;

        case 'commission':
            // Placeholder - Phase 4
            await ctx.editMessageText(
                `💰 Hoa hong tu gioi thieu\n\n(Chuc nang dang phat trien)`,
                keyboards.backToMenu()
            );
            break;

        case 'stats':
            const referralCount = await userRepo.countReferrals(user.id);
            await ctx.editMessageText(
                `📊 Thong ke cua ban:\n\n` +
                `💵 So du: ${user.balance.toLocaleString()}d\n` +
                `🔗 Tong link da tao: ${user.total_links}\n` +
                `👥 Nguoi da gioi thieu: ${referralCount}`,
                keyboards.backToMenu()
            );
            break;

        case 'withdraw':
            // Check balance
            if (user.balance < config.limits.minWithdraw) {
                await ctx.editMessageText(
                    `❌ So du toi thieu de rut: ${config.limits.minWithdraw.toLocaleString()}d\n` +
                    `So du hien tai: ${user.balance.toLocaleString()}d`,
                    keyboards.backToMenu()
                );
            } else {
                // Check bank account
                const bank = await userRepo.getBankAccount(user.id);
                if (!bank) {
                    await ctx.editMessageText(
                        `⚠️ Ban chua dang ky tai khoan ngan hang.\n` +
                        `Vui long dang ky truoc khi rut tien.`,
                        keyboards.backToMenu()
                    );
                } else {
                    // Enter withdraw scene - Phase 5
                    ctx.session.withdrawing = true;
                    await ctx.editMessageText(
                        `💸 Nhap so tien muon rut (toi thieu ${config.limits.minWithdraw.toLocaleString()}d):\n\n` +
                        `So du hien tai: ${user.balance.toLocaleString()}d`,
                        keyboards.backToMenu()
                    );
                }
            }
            break;

        case 'bank':
            await ctx.scene.enter('bank-registration');
            break;
    }
}

module.exports = { handleMenuCallback };
```

### Step 8: Update src/bot/index.js
```javascript
const { Telegraf, session, Scenes } = require('telegraf');
const config = require('../config');
const logger = require('../utils/logger');
const { startCommand } = require('./commands/start-command');
const { handleMenuCallback } = require('./callbacks/main-menu-callback');
const { bankRegistrationScene } = require('./scenes/bank-registration-scene');

function createBot() {
    const bot = new Telegraf(config.bot.token);

    // Session middleware
    bot.use(session({
        defaultSession: () => ({ step: 'idle' })
    }));

    // Scene stage
    const stage = new Scenes.Stage([bankRegistrationScene]);
    bot.use(stage.middleware());

    // Error handler
    bot.catch((err, ctx) => {
        logger.error('Bot error', { error: err.message, update: ctx.updateType });
        ctx.reply('Co loi xay ra. Vui long thu lai /start').catch(() => {});
    });

    // Commands
    bot.command('start', startCommand);
    bot.command('help', (ctx) => ctx.reply('Dung /start de bat dau'));

    // Menu callbacks
    bot.action(/^menu:(.+)$/, handleMenuCallback);

    return bot;
}

module.exports = { createBot };
```

---

## Todo List

- [ ] Create `src/utils/ref-code-generator.js`
- [ ] Create `src/db/repositories/user-repository.js`
- [ ] Create `src/services/user-service.js`
- [ ] Create `src/bot/keyboards/inline-keyboards.js`
- [ ] Create `src/bot/commands/start-command.js`
- [ ] Create `src/bot/scenes/bank-registration-scene.js`
- [ ] Create `src/bot/callbacks/main-menu-callback.js`
- [ ] Update `src/bot/index.js` with Stage and handlers
- [ ] Test /start creates new user
- [ ] Test /start?ref=CODE links referrer
- [ ] Test main menu keyboard
- [ ] Test bank registration flow
- [ ] Test referral link display

---

## Success Criteria

- [ ] /start creates user with unique ref_code
- [ ] /start?start=REFCODE links new user to referrer
- [ ] Main menu displays all 6 buttons
- [ ] Bank registration WizardScene completes successfully
- [ ] User data persists in PostgreSQL
- [ ] Referral count shows correctly

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Duplicate ref_code | Low | Medium | Retry generation up to 10x |
| Scene state lost | Medium | Medium | Session middleware order matters |
| Callback timeout | Low | Low | Always call answerCbQuery() |
