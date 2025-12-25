# Phase 5: Withdrawal

**Parent Plan:** [plan.md](./plan.md)  
**Dependencies:** [Phase 4](./phase-04-commission-balance.md)  
**Status:** pending  
**Priority:** Medium  
**Estimate:** 2 hours

---

## Overview

Implement withdrawal request flow for users. Check minimum balance (100,000 VND), require bank account registration, create pending withdrawal request, and notify user when processed.

---

## Requirements

- Minimum withdrawal: 100,000 VND
- Bank account must be registered first
- Withdrawal amount cannot exceed balance
- Create pending request for admin approval
- Deduct balance on withdrawal completion
- Track withdrawal status (pending/approved/rejected/completed)

---

## Architecture

### Withdrawal Flow
```
User clicks "Rut Tien" → Check balance >= 100k → Check bank registered
    ↓
Prompt for amount → Validate amount <= balance
    ↓
Create pending withdrawal → Notify user
    ↓
Admin approves → Deduct balance → Notify user "Success"
```

### Code Structure
```
src/
├── bot/
│   ├── handlers/
│   │   └── text-handler.js       # Add withdraw amount handler
│   └── scenes/
│       └── withdraw-scene.js     # Optional: WizardScene
├── db/
│   └── repositories/
│       └── withdraw-repository.js
└── services/
    └── withdraw-service.js
```

---

## Related Code Files

| File | Purpose |
|------|---------|
| `src/db/repositories/withdraw-repository.js` | Withdrawal CRUD |
| `src/services/withdraw-service.js` | Withdrawal business logic |
| `src/bot/handlers/text-handler.js` | Handle withdraw amount input |

---

## Implementation Steps

### Step 1: Create src/db/repositories/withdraw-repository.js
```javascript
const db = require('../connection');

const withdrawRepo = {
    async create(userId, amount, bankAccountId) {
        const result = await db.query(
            `INSERT INTO withdrawals (user_id, amount, bank_account_id)
             VALUES ($1, $2, $3)
             RETURNING *`,
            [userId, amount, bankAccountId]
        );
        return result.rows[0];
    },

    async findById(id) {
        const result = await db.query(
            `SELECT w.*, u.telegram_id, u.telegram_username, u.telegram_first_name,
                    b.bank_name, b.account_number, b.account_holder
             FROM withdrawals w
             JOIN users u ON w.user_id = u.id
             LEFT JOIN bank_accounts b ON w.bank_account_id = b.id
             WHERE w.id = $1`,
            [id]
        );
        return result.rows[0] || null;
    },

    async findByUserId(userId, limit = 10) {
        const result = await db.query(
            `SELECT * FROM withdrawals 
             WHERE user_id = $1 
             ORDER BY created_at DESC LIMIT $2`,
            [userId, limit]
        );
        return result.rows;
    },

    async findPending(limit = 50) {
        const result = await db.query(
            `SELECT w.*, u.telegram_username, u.telegram_first_name, u.balance,
                    b.bank_name, b.account_number, b.account_holder
             FROM withdrawals w
             JOIN users u ON w.user_id = u.id
             LEFT JOIN bank_accounts b ON w.bank_account_id = b.id
             WHERE w.status = 'pending'
             ORDER BY w.created_at ASC
             LIMIT $1`,
            [limit]
        );
        return result.rows;
    },

    async updateStatus(id, status, adminNote = null) {
        const result = await db.query(
            `UPDATE withdrawals SET 
                status = $1, 
                admin_note = $2,
                processed_at = CASE WHEN $1 IN ('approved', 'rejected', 'completed') THEN NOW() ELSE processed_at END
             WHERE id = $3
             RETURNING *`,
            [status, adminNote, id]
        );
        return result.rows[0];
    },

    async complete(id) {
        return this.updateStatus(id, 'completed');
    },

    async reject(id, adminNote = null) {
        return this.updateStatus(id, 'rejected', adminNote);
    },

    async countByStatus(status) {
        const result = await db.query(
            'SELECT COUNT(*) as count FROM withdrawals WHERE status = $1',
            [status]
        );
        return parseInt(result.rows[0].count);
    },

    async hasPendingWithdrawal(userId) {
        const result = await db.query(
            `SELECT COUNT(*) as count FROM withdrawals 
             WHERE user_id = $1 AND status = 'pending'`,
            [userId]
        );
        return parseInt(result.rows[0].count) > 0;
    },

    async getTotalWithdrawn(userId) {
        const result = await db.query(
            `SELECT COALESCE(SUM(amount), 0) as total 
             FROM withdrawals 
             WHERE user_id = $1 AND status = 'completed'`,
            [userId]
        );
        return parseFloat(result.rows[0].total);
    }
};

module.exports = withdrawRepo;
```

### Step 2: Create src/services/withdraw-service.js
```javascript
const config = require('../config');
const userRepo = require('../db/repositories/user-repository');
const withdrawRepo = require('../db/repositories/withdraw-repository');
const logger = require('../utils/logger');

const withdrawService = {
    /**
     * Validate and create withdrawal request
     */
    async createRequest(userId, amount) {
        // Get user
        const user = await userRepo.findById(userId);
        if (!user) {
            return { success: false, error: 'User khong ton tai' };
        }

        // Check minimum
        if (amount < config.limits.minWithdraw) {
            return { 
                success: false, 
                error: `So tien toi thieu la ${config.limits.minWithdraw.toLocaleString()}d` 
            };
        }

        // Check balance
        if (amount > user.balance) {
            return { 
                success: false, 
                error: `So du khong du. Hien co: ${user.balance.toLocaleString()}d` 
            };
        }

        // Check bank account
        const bankAccount = await userRepo.getBankAccount(userId);
        if (!bankAccount) {
            return { success: false, error: 'Chua dang ky tai khoan ngan hang' };
        }

        // Check pending withdrawal
        const hasPending = await withdrawRepo.hasPendingWithdrawal(userId);
        if (hasPending) {
            return { success: false, error: 'Ban dang co yeu cau rut tien cho xu ly' };
        }

        // Create withdrawal
        const withdrawal = await withdrawRepo.create(userId, amount, bankAccount.id);

        logger.info('Withdrawal request created', {
            withdrawalId: withdrawal.id,
            userId,
            amount
        });

        return { success: true, withdrawal, bankAccount };
    },

    /**
     * Complete withdrawal (called by admin)
     * Deducts balance from user
     */
    async completeWithdrawal(withdrawalId) {
        const withdrawal = await withdrawRepo.findById(withdrawalId);
        if (!withdrawal) {
            throw new Error('Withdrawal not found');
        }
        if (withdrawal.status !== 'pending') {
            throw new Error('Withdrawal already processed');
        }

        // Deduct balance
        await userRepo.deductBalance(withdrawal.user_id, withdrawal.amount);

        // Mark complete
        const updated = await withdrawRepo.complete(withdrawalId);

        logger.info('Withdrawal completed', {
            withdrawalId,
            userId: withdrawal.user_id,
            amount: withdrawal.amount
        });

        return {
            withdrawal: updated,
            telegramId: withdrawal.telegram_id
        };
    },

    /**
     * Reject withdrawal (called by admin)
     */
    async rejectWithdrawal(withdrawalId, adminNote = null) {
        const withdrawal = await withdrawRepo.findById(withdrawalId);
        if (!withdrawal) {
            throw new Error('Withdrawal not found');
        }
        if (withdrawal.status !== 'pending') {
            throw new Error('Withdrawal already processed');
        }

        const updated = await withdrawRepo.reject(withdrawalId, adminNote);

        logger.info('Withdrawal rejected', {
            withdrawalId,
            userId: withdrawal.user_id,
            reason: adminNote
        });

        return {
            withdrawal: updated,
            telegramId: withdrawal.telegram_id
        };
    },

    /**
     * Get user's withdrawal history
     */
    async getUserWithdrawals(userId, limit = 10) {
        return await withdrawRepo.findByUserId(userId, limit);
    }
};

module.exports = withdrawService;
```

### Step 3: Update src/bot/handlers/text-handler.js
Add withdraw amount handling:

```javascript
const validators = require('../../utils/validators');
const affiliateService = require('../../services/affiliate-service');
const userService = require('../../services/user-service');
const orderService = require('../../services/order-service');
const withdrawService = require('../../services/withdraw-service');
const linkRepo = require('../../db/repositories/link-repository');
const userRepo = require('../../db/repositories/user-repository');
const keyboards = require('../keyboards/inline-keyboards');
const config = require('../../config');
const logger = require('../../utils/logger');

async function handleTextMessage(ctx) {
    const text = ctx.message.text.trim();
    
    // Get user
    const user = await userRepo.findByTelegramId(ctx.from.id);
    if (!user) {
        await ctx.reply('Vui long /start truoc.');
        return;
    }
    ctx.session.user = user;

    // Check if waiting for link
    if (ctx.session.waitingForLink) {
        await handleLinkInput(ctx, user, text);
        return;
    }

    // Check if waiting for order ID
    if (ctx.session.waitingForOrderId) {
        await handleOrderIdInput(ctx, user, text);
        return;
    }

    // Check if waiting for withdraw amount
    if (ctx.session.withdrawing) {
        await handleWithdrawInput(ctx, user, text);
        return;
    }

    // Auto-detect: Is it a Shopee URL?
    if (validators.isShopeeUrl(text)) {
        await handleLinkInput(ctx, user, text);
        return;
    }

    // Auto-detect: Is it an order ID?
    if (validators.isOrderId(text)) {
        await handleOrderIdInput(ctx, user, text);
        return;
    }

    // Unknown input
    await ctx.reply(
        'Khong hieu yeu cau. Chon chuc nang tu menu:',
        keyboards.mainMenu()
    );
}

async function handleWithdrawInput(ctx, user, text) {
    ctx.session.withdrawing = false;

    // Parse amount
    const amount = parseFloat(text.replace(/[,\.]/g, ''));
    
    if (isNaN(amount) || amount <= 0) {
        await ctx.reply(
            '❌ So tien khong hop le. Nhap so (vd: 100000)',
            keyboards.backToMenu()
        );
        return;
    }

    // Create withdrawal request
    const result = await withdrawService.createRequest(user.id, amount);

    if (!result.success) {
        await ctx.reply(`❌ ${result.error}`, keyboards.backToMenu());
        return;
    }

    const { withdrawal, bankAccount } = result;

    await ctx.reply(
        `✅ Yeu cau rut tien da duoc gui!\n\n` +
        `💵 So tien: ${amount.toLocaleString()}d\n` +
        `🏦 Tai khoan: ${bankAccount.bank_name}\n` +
        `💳 STK: ${bankAccount.account_number}\n` +
        `👤 Chu TK: ${bankAccount.account_holder}\n\n` +
        `Trang thai: Cho xu ly\n` +
        `Admin se xac nhan va chuyen tien cho ban.`,
        keyboards.backToMenu()
    );

    logger.info('Withdrawal requested', { userId: user.id, amount });
}

// ... keep existing handleLinkInput and handleOrderIdInput functions

module.exports = { handleTextMessage };
```

### Step 4: Add withdrawal history to stats
Update the stats view in `main-menu-callback.js`:

```javascript
// In handleStatsView function, add:
const withdrawStats = await withdrawService.getUserWithdrawals(user.id, 3);
const totalWithdrawn = await withdrawRepo.getTotalWithdrawn(user.id);

// Update stats message to include:
`💸 Tong da rut: ${totalWithdrawn.toLocaleString()}d\n`
```

### Step 5: Add keyboard for withdraw confirmation (optional)
```javascript
// In inline-keyboards.js
withdrawConfirm(amount) {
    return Markup.inlineKeyboard([
        [Markup.button.callback(`✅ Xac nhan rut ${amount.toLocaleString()}d`, `withdraw:confirm:${amount}`)],
        [Markup.button.callback('❌ Huy', 'menu:main')]
    ]);
}
```

---

## Todo List

- [ ] Create `src/db/repositories/withdraw-repository.js`
- [ ] Create `src/services/withdraw-service.js`
- [ ] Update `src/bot/handlers/text-handler.js` with withdraw handler
- [ ] Test minimum balance check (100k)
- [ ] Test bank account required check
- [ ] Test amount validation (not exceed balance)
- [ ] Test pending withdrawal check (only one at a time)
- [ ] Test withdrawal creation
- [ ] Test withdrawal completion (Phase 6 - Admin)
- [ ] Test balance deduction on completion

---

## Success Criteria

- [ ] Users cannot withdraw below 100,000 VND
- [ ] Users cannot withdraw without bank account
- [ ] Users cannot withdraw more than balance
- [ ] Only one pending withdrawal allowed
- [ ] Withdrawal saved with correct bank info
- [ ] Balance deducted on completion

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Double withdrawal | Low | High | Check pending status before create |
| Balance mismatch | Low | High | DB transaction on completion |
| Invalid amount | Medium | Low | Input validation |
