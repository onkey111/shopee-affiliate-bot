# Phase 4: Commission & Balance

**Parent Plan:** [plan.md](./plan.md)  
**Dependencies:** [Phase 3](./phase-03-affiliate-link-feature.md)  
**Status:** pending  
**Priority:** High  
**Estimate:** 2 hours

---

## Overview

Implement commission calculation logic (5:4:1 split), balance management, commission history from referrals, and statistics display.

---

## Requirements

- Commission split: 50% owner, 40% user, 10% referrer
- If no referrer: owner gets 60%, user gets 40%
- Commission history shows referral earnings
- Balance updates when order approved
- Statistics show comprehensive user data

---

## Architecture

### Commission Split Logic
```
Total Commission from Shopee: X VND
├── Owner:    50% (X * 0.5)
├── User:     40% (X * 0.4)
└── Referrer: 10% (X * 0.1) — or Owner if no referrer
```

### Code Structure
```
src/
├── db/
│   └── repositories/
│       └── commission-repository.js
├── services/
│   └── commission-service.js    # Split calculation
└── bot/
    └── callbacks/
        └── main-menu-callback.js  # Updated for commission/stats
```

---

## Related Code Files

| File | Purpose |
|------|---------|
| `src/db/repositories/commission-repository.js` | Commission CRUD |
| `src/services/commission-service.js` | Split calculation |
| `src/bot/callbacks/main-menu-callback.js` | Updated handlers |

---

## Implementation Steps

### Step 1: Create src/db/repositories/commission-repository.js
```javascript
const db = require('../connection');

const commissionRepo = {
    /**
     * Create commission record (for referral earnings)
     */
    async create(userId, fromUserId, orderId, amount) {
        const result = await db.query(
            `INSERT INTO commissions (user_id, from_user_id, order_id, amount)
             VALUES ($1, $2, $3, $4)
             RETURNING *`,
            [userId, fromUserId, orderId, amount]
        );
        return result.rows[0];
    },

    /**
     * Get user's referral commission history
     */
    async findByUserId(userId, limit = 20) {
        const result = await db.query(
            `SELECT c.*, u.telegram_username, u.telegram_first_name
             FROM commissions c
             JOIN users u ON c.from_user_id = u.id
             WHERE c.user_id = $1
             ORDER BY c.created_at DESC
             LIMIT $2`,
            [userId, limit]
        );
        return result.rows;
    },

    /**
     * Get total referral earnings for user
     */
    async getTotalByUserId(userId) {
        const result = await db.query(
            `SELECT COALESCE(SUM(amount), 0) as total
             FROM commissions WHERE user_id = $1`,
            [userId]
        );
        return parseFloat(result.rows[0].total);
    },

    /**
     * Get this month's referral earnings
     */
    async getMonthlyByUserId(userId) {
        const result = await db.query(
            `SELECT COALESCE(SUM(amount), 0) as total
             FROM commissions 
             WHERE user_id = $1 
             AND DATE_TRUNC('month', created_at) = DATE_TRUNC('month', CURRENT_DATE)`,
            [userId]
        );
        return parseFloat(result.rows[0].total);
    }
};

module.exports = commissionRepo;
```

### Step 2: Create src/services/commission-service.js
```javascript
const config = require('../config');
const userRepo = require('../db/repositories/user-repository');
const orderRepo = require('../db/repositories/order-repository');
const commissionRepo = require('../db/repositories/commission-repository');
const logger = require('../utils/logger');

const commissionService = {
    /**
     * Calculate and apply commission split when admin approves order
     * @param {number} orderId 
     * @param {number} commissionTotal - Total commission from Shopee
     * @returns {Promise<{order, userCommission, referrerCommission, ownerCommission}>}
     */
    async processOrderApproval(orderId, commissionTotal) {
        const order = await orderRepo.findById(orderId);
        if (!order) {
            throw new Error('Order not found');
        }
        if (order.status !== 'pending') {
            throw new Error('Order already processed');
        }

        const user = await userRepo.findById(order.user_id);
        if (!user) {
            throw new Error('User not found');
        }

        // Calculate split
        const ownerShare = commissionTotal * config.commission.owner;    // 50%
        const userShare = commissionTotal * config.commission.user;      // 40%
        let referrerShare = commissionTotal * config.commission.referrer; // 10%

        let finalOwnerShare = ownerShare;
        let finalReferrerShare = 0;
        let referrer = null;

        // Handle referrer
        if (user.referred_by) {
            referrer = await userRepo.findById(user.referred_by);
            if (referrer) {
                finalReferrerShare = referrerShare;
                
                // Add to referrer balance
                await userRepo.addBalance(referrer.id, referrerShare);
                
                // Record commission
                await commissionRepo.create(
                    referrer.id,
                    user.id,
                    orderId,
                    referrerShare
                );

                logger.info('Referrer commission added', {
                    referrerId: referrer.id,
                    fromUserId: user.id,
                    orderId,
                    amount: referrerShare
                });
            } else {
                // Referrer not found, owner gets the share
                finalOwnerShare += referrerShare;
            }
        } else {
            // No referrer, owner gets the 10%
            finalOwnerShare += referrerShare;
        }

        // Add to user balance
        await userRepo.addBalance(user.id, userShare);

        // Update order with commission breakdown
        const updatedOrder = await orderRepo.approve(orderId, {
            commission_total: commissionTotal,
            user_commission: userShare,
            referrer_commission: finalReferrerShare,
            owner_commission: finalOwnerShare
        });

        logger.info('Order approved with commission', {
            orderId,
            commissionTotal,
            userShare,
            referrerShare: finalReferrerShare,
            ownerShare: finalOwnerShare
        });

        return {
            order: updatedOrder,
            user,
            referrer,
            userCommission: userShare,
            referrerCommission: finalReferrerShare,
            ownerCommission: finalOwnerShare
        };
    },

    /**
     * Get comprehensive commission stats for user
     */
    async getUserCommissionStats(userId) {
        const totalReferral = await commissionRepo.getTotalByUserId(userId);
        const monthlyReferral = await commissionRepo.getMonthlyByUserId(userId);
        const recentCommissions = await commissionRepo.findByUserId(userId, 5);
        
        return {
            totalReferral,
            monthlyReferral,
            recentCommissions
        };
    }
};

module.exports = commissionService;
```

### Step 3: Update src/bot/callbacks/main-menu-callback.js
Update the commission and stats handlers:

```javascript
const userService = require('../../services/user-service');
const userRepo = require('../../db/repositories/user-repository');
const orderRepo = require('../../db/repositories/order-repository');
const commissionService = require('../../services/commission-service');
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
            const referralCount = await userRepo.countReferrals(user.id);
            await ctx.editMessageText(
                `👥 Link gioi thieu cua ban:\n\n` +
                `${refLink}\n\n` +
                `Da gioi thieu: ${referralCount} nguoi\n` +
                `Moi don hang tu nguoi ban gioi thieu, ban nhan 10% hoa hong!`,
                keyboards.backToMenu()
            );
            break;

        case 'commission':
            await handleCommissionView(ctx, user);
            break;

        case 'stats':
            await handleStatsView(ctx, user);
            break;

        case 'withdraw':
            if (user.balance < config.limits.minWithdraw) {
                await ctx.editMessageText(
                    `❌ So du toi thieu de rut: ${config.limits.minWithdraw.toLocaleString()}d\n` +
                    `So du hien tai: ${user.balance.toLocaleString()}d`,
                    keyboards.backToMenu()
                );
            } else {
                const bank = await userRepo.getBankAccount(user.id);
                if (!bank) {
                    await ctx.editMessageText(
                        `⚠️ Ban chua dang ky tai khoan ngan hang.\n` +
                        `Vui long dang ky truoc khi rut tien.`,
                        keyboards.backToMenu()
                    );
                } else {
                    ctx.session.withdrawing = true;
                    await ctx.editMessageText(
                        `💸 Nhap so tien muon rut (toi thieu ${config.limits.minWithdraw.toLocaleString()}d):\n\n` +
                        `So du hien tai: ${user.balance.toLocaleString()}d\n\n` +
                        `Tai khoan: ${bank.bank_name} - ${bank.account_number}`,
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

async function handleCommissionView(ctx, user) {
    const stats = await commissionService.getUserCommissionStats(user.id);
    
    let msg = `💰 Hoa hong tu gioi thieu\n\n`;
    msg += `Tong: ${stats.totalReferral.toLocaleString()}d\n`;
    msg += `Thang nay: ${stats.monthlyReferral.toLocaleString()}d\n\n`;

    if (stats.recentCommissions.length > 0) {
        msg += `📋 Chi tiet gan day:\n`;
        for (const c of stats.recentCommissions) {
            const name = c.telegram_username ? `@${c.telegram_username}` : c.telegram_first_name;
            const date = new Date(c.created_at).toLocaleDateString('vi-VN');
            msg += `- ${name}: +${c.amount.toLocaleString()}d (${date})\n`;
        }
    } else {
        msg += `Chua co hoa hong tu gioi thieu.\n`;
        msg += `Chia se link gioi thieu de bat dau!`;
    }

    await ctx.editMessageText(msg, keyboards.backToMenu());
}

async function handleStatsView(ctx, user) {
    const referralCount = await userRepo.countReferrals(user.id);
    const orderStats = await orderRepo.getStats(user.id);
    const commissionStats = await commissionService.getUserCommissionStats(user.id);

    const msg = `📊 Thong ke cua ban\n\n` +
        `💵 So du: ${user.balance.toLocaleString()}d\n` +
        `🔗 Tong link da tao: ${user.total_links}\n` +
        `📦 Don hang thanh cong: ${orderStats.approved_count}\n` +
        `⏳ Don cho duyet: ${orderStats.pending_count}\n` +
        `👥 Nguoi da gioi thieu: ${referralCount}\n` +
        `💰 Hoa hong tu don hang: ${parseFloat(orderStats.total_commission).toLocaleString()}d\n` +
        `💰 Hoa hong tu gioi thieu: ${commissionStats.totalReferral.toLocaleString()}d`;

    await ctx.editMessageText(msg, keyboards.backToMenu());
}

module.exports = { handleMenuCallback };
```

### Step 4: Add formatters utility
Create `src/utils/formatters.js`:
```javascript
const formatters = {
    /**
     * Format number as VND currency
     */
    currency(amount) {
        return new Intl.NumberFormat('vi-VN').format(amount) + 'd';
    },

    /**
     * Format date as DD/MM/YYYY
     */
    date(dateStr) {
        return new Date(dateStr).toLocaleDateString('vi-VN');
    },

    /**
     * Format datetime as DD/MM HH:mm
     */
    datetime(dateStr) {
        const d = new Date(dateStr);
        return `${d.toLocaleDateString('vi-VN')} ${d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}`;
    }
};

module.exports = formatters;
```

---

## Todo List

- [ ] Create `src/db/repositories/commission-repository.js`
- [ ] Create `src/services/commission-service.js`
- [ ] Create `src/utils/formatters.js`
- [ ] Update `src/bot/callbacks/main-menu-callback.js`
- [ ] Test commission calculation (5:4:1 split)
- [ ] Test referrer gets 10% when exists
- [ ] Test owner gets 60% when no referrer
- [ ] Test balance updates correctly
- [ ] Test commission history display
- [ ] Test statistics display

---

## Success Criteria

- [ ] Commission split accurate: 50/40/10
- [ ] User balance increases on order approval
- [ ] Referrer balance increases if exists
- [ ] Commission history shows recent referral earnings
- [ ] Statistics comprehensive and accurate
- [ ] Currency formatting correct (VND)

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Floating point errors | Low | Medium | Use DECIMAL in DB, round to 2 places |
| Missing referrer | Low | Low | Owner gets referrer share |
| Race condition on balance | Low | High | DB transaction for approval |
