# Phase 7: Notifications

**Parent Plan:** [plan.md](./plan.md)  
**Dependencies:** [Phase 6](./phase-06-admin-panel.md)  
**Status:** pending  
**Priority:** Medium  
**Estimate:** 1 hour

---

## Overview

Implement Telegram notification service to notify users when: order approved, referral commission received, withdrawal completed/rejected.

---

## Requirements

- Notify user when order approved (show commission earned)
- Notify referrer when they earn commission from referred user
- Notify user when withdrawal completed
- Notify user when withdrawal rejected (with reason)
- Non-blocking notifications (don't fail main flow)

---

## Architecture

### Notification Types
```
1. ORDER_APPROVED     → "Don hang X da duyet! +Y d"
2. REFERRAL_COMMISSION → "@user mua hang, ban nhan +X d"
3. WITHDRAW_COMPLETED → "Rut tien X d thanh cong!"
4. WITHDRAW_REJECTED  → "Yeu cau rut tien bi tu choi: [reason]"
```

### Code Structure
```
src/
└── services/
    └── notification-service.js    # Telegram notification sender
```

---

## Related Code Files

| File | Purpose |
|------|---------|
| `src/services/notification-service.js` | Send Telegram messages |
| `src/bot/index.js` | Export bot instance for notifications |

---

## Implementation Steps

### Step 1: Update src/bot/index.js to export bot instance
```javascript
const { Telegraf, session, Scenes } = require('telegraf');
const config = require('../config');
const logger = require('../utils/logger');
const { startCommand } = require('./commands/start-command');
const { handleMenuCallback } = require('./callbacks/main-menu-callback');
const { bankRegistrationScene } = require('./scenes/bank-registration-scene');
const { handleTextMessage } = require('./handlers/text-handler');

let botInstance = null;

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

    // Text handler
    bot.on('text', handleTextMessage);

    // Store instance for notification service
    botInstance = bot;

    return bot;
}

function getBotInstance() {
    return botInstance;
}

module.exports = { createBot, getBotInstance };
```

### Step 2: Create src/services/notification-service.js
```javascript
const { getBotInstance } = require('../bot');
const logger = require('../utils/logger');

const notificationService = {
    /**
     * Send message to user by telegram ID
     * Non-blocking, logs errors but doesn't throw
     */
    async sendMessage(telegramId, message) {
        try {
            const bot = getBotInstance();
            if (!bot) {
                logger.error('Bot instance not available for notification');
                return false;
            }

            await bot.telegram.sendMessage(telegramId, message, {
                parse_mode: 'HTML'
            });
            
            logger.info('Notification sent', { telegramId, preview: message.substring(0, 50) });
            return true;
        } catch (err) {
            // User may have blocked bot or chat not found
            logger.error('Failed to send notification', {
                telegramId,
                error: err.message
            });
            return false;
        }
    },

    /**
     * Notify user when order approved
     */
    async notifyOrderApproved(telegramId, order, userCommission) {
        const message = 
            `✅ <b>Don hang da duoc duyet!</b>\n\n` +
            `📦 Order ID: <code>${order.shopee_order_id}</code>\n` +
            `💵 Hoa hong nhan duoc: <b>${userCommission.toLocaleString()}d</b>\n\n` +
            `So du da duoc cap nhat. Xem /start de kiem tra.`;

        return this.sendMessage(telegramId, message);
    },

    /**
     * Notify referrer when they earn commission
     */
    async notifyReferralCommission(telegramId, fromUser, commission) {
        const username = fromUser.telegram_username 
            ? `@${fromUser.telegram_username}` 
            : fromUser.telegram_first_name;

        const message = 
            `💰 <b>Hoa hong gioi thieu!</b>\n\n` +
            `Nguoi ban gioi thieu (${username}) vua co don hang thanh cong.\n` +
            `Ban nhan duoc: <b>+${commission.toLocaleString()}d</b>\n\n` +
            `Tiep tuc gioi thieu de nhan them hoa hong!`;

        return this.sendMessage(telegramId, message);
    },

    /**
     * Notify user when withdrawal completed
     */
    async notifyWithdrawCompleted(telegramId, amount) {
        const message = 
            `✅ <b>Rut tien thanh cong!</b>\n\n` +
            `💸 So tien: <b>${amount.toLocaleString()}d</b>\n\n` +
            `Tien da duoc chuyen vao tai khoan ngan hang cua ban.\n` +
            `Cam on ban da su dung dich vu!`;

        return this.sendMessage(telegramId, message);
    },

    /**
     * Notify user when withdrawal rejected
     */
    async notifyWithdrawRejected(telegramId, amount, reason = null) {
        let message = 
            `❌ <b>Yeu cau rut tien bi tu choi</b>\n\n` +
            `💸 So tien: ${amount.toLocaleString()}d\n`;

        if (reason) {
            message += `📝 Ly do: ${reason}\n`;
        }

        message += `\nVui long kiem tra lai thong tin va thu lai.`;

        return this.sendMessage(telegramId, message);
    },

    /**
     * Notify user when new referral joins
     */
    async notifyNewReferral(telegramId, newUser) {
        const username = newUser.telegram_username 
            ? `@${newUser.telegram_username}` 
            : newUser.telegram_first_name;

        const message = 
            `🎉 <b>Co nguoi moi tham gia!</b>\n\n` +
            `${username} da dang ky qua link gioi thieu cua ban.\n` +
            `Moi don hang thanh cong cua ho, ban se nhan 10% hoa hong!`;

        return this.sendMessage(telegramId, message);
    },

    /**
     * Send custom message (for admin use)
     */
    async sendCustomMessage(telegramId, message) {
        return this.sendMessage(telegramId, message);
    }
};

module.exports = notificationService;
```

### Step 3: Add new referral notification to user service
Update `src/services/user-service.js`:

```javascript
const userRepo = require('../db/repositories/user-repository');
const { generateRefCode } = require('../utils/ref-code-generator');
const notificationService = require('./notification-service');
const config = require('../config');

const userService = {
    async getOrCreateUser(from, refCodeParam = null) {
        // Check existing user
        let user = await userRepo.findByTelegramId(from.id);
        if (user) return { user, isNew: false };

        // Find referrer if refCode provided
        let referrerId = null;
        let referrer = null;
        if (refCodeParam) {
            referrer = await userRepo.findByRefCode(refCodeParam);
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

        // Notify referrer about new signup
        if (referrer) {
            await notificationService.notifyNewReferral(referrer.telegram_id, user);
        }

        return { user, isNew: true, referrerId };
    },

    // ... rest of methods unchanged
};

module.exports = userService;
```

### Step 4: Ensure notifications called in admin controllers
Already added in Phase 6:
- `order-controller.js` calls `notifyOrderApproved` and `notifyReferralCommission`
- `withdraw-controller.js` calls `notifyWithdrawCompleted` and `notifyWithdrawRejected`

### Step 5: Add notification queue (optional enhancement)
For high volume, consider adding a simple queue:

```javascript
// src/services/notification-queue.js (optional)
const queue = [];
let processing = false;

async function processQueue() {
    if (processing || queue.length === 0) return;
    processing = true;

    while (queue.length > 0) {
        const { telegramId, message } = queue.shift();
        await notificationService.sendMessage(telegramId, message);
        // Small delay between messages
        await new Promise(r => setTimeout(r, 100));
    }

    processing = false;
}

function enqueue(telegramId, message) {
    queue.push({ telegramId, message });
    processQueue();
}

module.exports = { enqueue };
```

---

## Todo List

- [ ] Update `src/bot/index.js` to export bot instance
- [ ] Create `src/services/notification-service.js`
- [ ] Update `src/services/user-service.js` with referral notification
- [ ] Test order approved notification
- [ ] Test referral commission notification
- [ ] Test withdrawal completed notification
- [ ] Test withdrawal rejected notification
- [ ] Test new referral notification
- [ ] Verify notifications don't block main flow on failure

---

## Success Criteria

- [ ] Users receive notification on order approval
- [ ] Referrers receive notification on commission earned
- [ ] Users receive notification on withdrawal completion
- [ ] Users receive notification on withdrawal rejection
- [ ] Failed notifications logged but don't crash app
- [ ] Messages formatted with HTML (bold, code)

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| User blocked bot | Medium | Low | Catch error, log, continue |
| Rate limit by Telegram | Low | Medium | Add delay between messages |
| Bot not initialized | Low | Medium | Check botInstance exists |

---

## Message Templates

### Order Approved
```
✅ Don hang da duoc duyet!

📦 Order ID: 123456789
💵 Hoa hong nhan duoc: 50,000d

So du da duoc cap nhat. Xem /start de kiem tra.
```

### Referral Commission
```
💰 Hoa hong gioi thieu!

Nguoi ban gioi thieu (@user) vua co don hang thanh cong.
Ban nhan duoc: +5,000d

Tiep tuc gioi thieu de nhan them hoa hong!
```

### Withdrawal Completed
```
✅ Rut tien thanh cong!

💸 So tien: 200,000d

Tien da duoc chuyen vao tai khoan ngan hang cua ban.
Cam on ban da su dung dich vu!
```

### Withdrawal Rejected
```
❌ Yeu cau rut tien bi tu choi

💸 So tien: 200,000d
📝 Ly do: Thong tin tai khoan khong chinh xac

Vui long kiem tra lai thong tin va thu lai.
```

### New Referral
```
🎉 Co nguoi moi tham gia!

@newuser da dang ky qua link gioi thieu cua ban.
Moi don hang thanh cong cua ho, ban se nhan 10% hoa hong!
```
