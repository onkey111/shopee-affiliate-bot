# Phase 3: Affiliate Link Feature

**Parent Plan:** [plan.md](./plan.md)  
**Dependencies:** [Phase 2](./phase-02-user-management.md)  
**Status:** pending  
**Priority:** High  
**Estimate:** 2 hours

---

## Overview

Integrate existing Puppeteer-based affiliate link converter into bot. Handle link input from users, enforce 5/day rate limit, store converted links, and provide order ID submission flow.

---

## Requirements

- Reuse `convertToAffiliateLink()` from `shopee-affiliate-fast.js`
- Rate limit: 5 links/day/user
- Store original + affiliate link in DB
- Show "processing" message during conversion
- Handle conversion errors gracefully
- Order ID submission flow (user sends order ID after purchase)

---

## Architecture

### Code Structure
```
src/
├── bot/
│   ├── handlers/
│   │   └── text-handler.js       # Handle text messages (links, order IDs)
│   └── callbacks/
│       └── main-menu-callback.js # Updated
├── db/
│   └── repositories/
│       ├── link-repository.js
│       └── order-repository.js
├── services/
│   ├── affiliate-service.js      # Wrapper around Puppeteer converter
│   └── order-service.js          # Order CRUD
└── utils/
    └── validators.js             # Link validation
```

### Flow Diagram
```
User clicks "Tao Link" → Bot asks for link → User sends Shopee URL
    ↓
Validate URL → Check rate limit → Show "Processing..."
    ↓
Call convertToAffiliateLink() → Save to DB
    ↓
Reply with affiliate link + "Send Order ID after purchase"
```

---

## Related Code Files

| File | Purpose |
|------|---------|
| `shopee-affiliate-fast.js` | Existing converter (REUSE) |
| `src/services/affiliate-service.js` | Service wrapper |
| `src/db/repositories/link-repository.js` | Link CRUD |
| `src/db/repositories/order-repository.js` | Order CRUD |
| `src/services/order-service.js` | Order business logic |
| `src/bot/handlers/text-handler.js` | Process text messages |
| `src/utils/validators.js` | URL/Order ID validation |

---

## Implementation Steps

### Step 1: Create src/utils/validators.js
```javascript
const validators = {
    /**
     * Check if string is valid Shopee URL
     */
    isShopeeUrl(text) {
        const patterns = [
            /^https?:\/\/(www\.)?shopee\.vn\//,
            /^https?:\/\/vn\.shp\.ee\//,
            /^https?:\/\/s\.shopee\.vn\//
        ];
        return patterns.some(p => p.test(text));
    },

    /**
     * Check if string looks like Shopee order ID
     * Format: typically numeric, 15-20 chars
     */
    isOrderId(text) {
        return /^\d{10,25}$/.test(text.trim());
    },

    /**
     * Extract product URL from various formats
     */
    extractShopeeUrl(text) {
        // Match full URLs
        const urlMatch = text.match(/https?:\/\/[^\s]+shopee[^\s]*/i);
        if (urlMatch) return urlMatch[0];
        
        // Match short URLs
        const shortMatch = text.match(/https?:\/\/vn\.shp\.ee\/[^\s]+/i);
        if (shortMatch) return shortMatch[0];
        
        return null;
    }
};

module.exports = validators;
```

### Step 2: Create src/services/affiliate-service.js
```javascript
const path = require('path');
const logger = require('../utils/logger');

// Import existing converter
const { convertToAffiliateLink } = require('../../shopee-affiliate-fast');

const affiliateService = {
    /**
     * Convert Shopee URL to affiliate link
     * @param {string} originalUrl 
     * @returns {Promise<{success: boolean, affiliateUrl?: string, error?: string}>}
     */
    async convert(originalUrl) {
        try {
            logger.info('Converting affiliate link', { originalUrl });
            
            const affiliateUrl = await convertToAffiliateLink(originalUrl);
            
            if (!affiliateUrl) {
                return { success: false, error: 'Khong the tao link affiliate' };
            }

            logger.info('Conversion successful', { originalUrl, affiliateUrl });
            return { success: true, affiliateUrl };

        } catch (err) {
            logger.error('Affiliate conversion error', { 
                error: err.message, 
                originalUrl 
            });
            
            // User-friendly error messages
            if (err.message.includes('cookies')) {
                return { success: false, error: 'Loi xac thuc. Lien he admin.' };
            }
            if (err.message.includes('timeout')) {
                return { success: false, error: 'Qua thoi gian cho. Thu lai sau.' };
            }
            
            return { success: false, error: 'Loi khi tao link. Thu lai sau.' };
        }
    }
};

module.exports = affiliateService;
```

### Step 3: Create src/db/repositories/link-repository.js
```javascript
const db = require('../connection');

const linkRepo = {
    async create(userId, originalUrl, affiliateUrl) {
        const result = await db.query(
            `INSERT INTO links (user_id, original_url, affiliate_url)
             VALUES ($1, $2, $3)
             RETURNING *`,
            [userId, originalUrl, affiliateUrl]
        );
        return result.rows[0];
    },

    async findByUserId(userId, limit = 10) {
        const result = await db.query(
            `SELECT * FROM links WHERE user_id = $1 
             ORDER BY created_at DESC LIMIT $2`,
            [userId, limit]
        );
        return result.rows;
    },

    async findById(id) {
        const result = await db.query(
            'SELECT * FROM links WHERE id = $1',
            [id]
        );
        return result.rows[0] || null;
    },

    async countByUserToday(userId) {
        const result = await db.query(
            `SELECT COUNT(*) as count FROM links 
             WHERE user_id = $1 AND DATE(created_at) = CURRENT_DATE`,
            [userId]
        );
        return parseInt(result.rows[0].count);
    }
};

module.exports = linkRepo;
```

### Step 4: Create src/db/repositories/order-repository.js
```javascript
const db = require('../connection');

const orderRepo = {
    async create(userId, shopeeOrderId, linkId = null) {
        const result = await db.query(
            `INSERT INTO orders (user_id, shopee_order_id, link_id)
             VALUES ($1, $2, $3)
             RETURNING *`,
            [userId, shopeeOrderId, linkId]
        );
        return result.rows[0];
    },

    async findById(id) {
        const result = await db.query(
            'SELECT * FROM orders WHERE id = $1',
            [id]
        );
        return result.rows[0] || null;
    },

    async findByShopeeOrderId(orderId) {
        const result = await db.query(
            'SELECT * FROM orders WHERE shopee_order_id = $1',
            [orderId]
        );
        return result.rows[0] || null;
    },

    async findByUserId(userId, status = null, limit = 20) {
        let query = 'SELECT * FROM orders WHERE user_id = $1';
        const params = [userId];

        if (status) {
            query += ' AND status = $2';
            params.push(status);
        }

        query += ' ORDER BY created_at DESC LIMIT $' + (params.length + 1);
        params.push(limit);

        const result = await db.query(query, params);
        return result.rows;
    },

    async findPending(limit = 50) {
        const result = await db.query(
            `SELECT o.*, u.telegram_username, u.telegram_first_name
             FROM orders o 
             JOIN users u ON o.user_id = u.id
             WHERE o.status = 'pending'
             ORDER BY o.created_at ASC LIMIT $1`,
            [limit]
        );
        return result.rows;
    },

    async approve(orderId, commissionData) {
        const { commission_total, user_commission, referrer_commission, owner_commission } = commissionData;
        
        const result = await db.query(
            `UPDATE orders SET 
                status = 'approved',
                commission_total = $1,
                user_commission = $2,
                referrer_commission = $3,
                owner_commission = $4,
                approved_at = NOW()
             WHERE id = $5
             RETURNING *`,
            [commission_total, user_commission, referrer_commission, owner_commission, orderId]
        );
        return result.rows[0];
    },

    async reject(orderId, adminNote = null) {
        const result = await db.query(
            `UPDATE orders SET status = 'rejected', admin_note = $1
             WHERE id = $2 RETURNING *`,
            [adminNote, orderId]
        );
        return result.rows[0];
    },

    async markNotified(orderId) {
        await db.query(
            'UPDATE orders SET notified = TRUE WHERE id = $1',
            [orderId]
        );
    },

    async countByStatus(status) {
        const result = await db.query(
            'SELECT COUNT(*) as count FROM orders WHERE status = $1',
            [status]
        );
        return parseInt(result.rows[0].count);
    },

    async getStats(userId) {
        const result = await db.query(
            `SELECT 
                COUNT(*) FILTER (WHERE status = 'approved') as approved_count,
                COUNT(*) FILTER (WHERE status = 'pending') as pending_count,
                COALESCE(SUM(user_commission) FILTER (WHERE status = 'approved'), 0) as total_commission
             FROM orders WHERE user_id = $1`,
            [userId]
        );
        return result.rows[0];
    }
};

module.exports = orderRepo;
```

### Step 5: Create src/services/order-service.js
```javascript
const orderRepo = require('../db/repositories/order-repository');
const userRepo = require('../db/repositories/user-repository');
const logger = require('../utils/logger');

const orderService = {
    /**
     * Create pending order from user's order ID submission
     */
    async createPendingOrder(userId, shopeeOrderId, linkId = null) {
        // Check duplicate
        const existing = await orderRepo.findByShopeeOrderId(shopeeOrderId);
        if (existing) {
            return { success: false, error: 'Order ID nay da duoc gui truoc do.' };
        }

        const order = await orderRepo.create(userId, shopeeOrderId, linkId);
        logger.info('Order created', { orderId: order.id, userId, shopeeOrderId });

        return { success: true, order };
    },

    /**
     * Get user's order statistics
     */
    async getUserOrderStats(userId) {
        return await orderRepo.getStats(userId);
    }
};

module.exports = orderService;
```

### Step 6: Create src/bot/handlers/text-handler.js
```javascript
const validators = require('../../utils/validators');
const affiliateService = require('../../services/affiliate-service');
const userService = require('../../services/user-service');
const orderService = require('../../services/order-service');
const linkRepo = require('../../db/repositories/link-repository');
const userRepo = require('../../db/repositories/user-repository');
const keyboards = require('../keyboards/inline-keyboards');
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
        // Phase 5 handles this
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

async function handleLinkInput(ctx, user, text) {
    ctx.session.waitingForLink = false;

    // Extract URL
    const url = validators.extractShopeeUrl(text);
    if (!url) {
        await ctx.reply(
            '❌ Link khong hop le. Gui link Shopee (vd: https://shopee.vn/...)',
            keyboards.backToMenu()
        );
        return;
    }

    // Check rate limit
    const { allowed, remaining } = await userService.canCreateLink(user);
    if (!allowed) {
        await ctx.reply(
            '❌ Ban da het 5 luot tao link hom nay.\nQuay lai ngay mai!',
            keyboards.backToMenu()
        );
        return;
    }

    // Show processing message
    const processingMsg = await ctx.reply('⏳ Dang tao link affiliate...');

    try {
        // Convert link
        const result = await affiliateService.convert(url);

        if (!result.success) {
            await ctx.telegram.editMessageText(
                ctx.chat.id,
                processingMsg.message_id,
                null,
                `❌ ${result.error}`,
                keyboards.backToMenu()
            );
            return;
        }

        // Save to DB
        const link = await linkRepo.create(user.id, url, result.affiliateUrl);
        await userService.recordLinkCreation(user.id);

        // Success message
        const newRemaining = remaining - 1;
        await ctx.telegram.editMessageText(
            ctx.chat.id,
            processingMsg.message_id,
            null,
            `✅ Link affiliate cua ban:\n\n${result.affiliateUrl}\n\n` +
            `📝 Sau khi mua hang, gui Order ID de nhan hoa hong.\n` +
            `(Con ${newRemaining}/5 luot hom nay)`,
            keyboards.backToMenu()
        );

        // Set session to expect order ID
        ctx.session.lastLinkId = link.id;
        ctx.session.waitingForOrderId = true;

        logger.info('Link created', { 
            userId: user.id, 
            linkId: link.id,
            remaining: newRemaining 
        });

    } catch (err) {
        logger.error('Link creation error', { error: err.message });
        await ctx.telegram.editMessageText(
            ctx.chat.id,
            processingMsg.message_id,
            null,
            '❌ Loi khi tao link. Thu lai sau.',
            keyboards.backToMenu()
        );
    }
}

async function handleOrderIdInput(ctx, user, text) {
    ctx.session.waitingForOrderId = false;

    const orderId = text.trim();

    if (!validators.isOrderId(orderId)) {
        await ctx.reply(
            '❌ Order ID khong hop le. Order ID la day so 10-25 ky tu.',
            keyboards.backToMenu()
        );
        return;
    }

    // Create pending order
    const result = await orderService.createPendingOrder(
        user.id, 
        orderId, 
        ctx.session.lastLinkId || null
    );

    if (!result.success) {
        await ctx.reply(`❌ ${result.error}`, keyboards.backToMenu());
        return;
    }

    await ctx.reply(
        `✅ Order ID ${orderId} da duoc gui!\n\n` +
        `Trang thai: Cho duyet\n` +
        `Admin se kiem tra va duyet hoa hong cho ban.`,
        keyboards.backToMenu()
    );

    ctx.session.lastLinkId = null;
}

module.exports = { handleTextMessage };
```

### Step 7: Update src/bot/index.js
Add text handler:
```javascript
// ... existing imports
const { handleTextMessage } = require('./handlers/text-handler');

function createBot() {
    // ... existing code

    // Text message handler (MUST be after commands and callbacks)
    bot.on('text', handleTextMessage);

    return bot;
}
```

---

## Todo List

- [ ] Create `src/utils/validators.js`
- [ ] Create `src/services/affiliate-service.js`
- [ ] Create `src/db/repositories/link-repository.js`
- [ ] Create `src/db/repositories/order-repository.js`
- [ ] Create `src/services/order-service.js`
- [ ] Create `src/bot/handlers/text-handler.js`
- [ ] Update `src/bot/index.js` with text handler
- [ ] Test link conversion flow end-to-end
- [ ] Test rate limiting (5/day)
- [ ] Test order ID submission
- [ ] Test duplicate order ID rejection
- [ ] Test error handling (timeout, invalid URL)

---

## Success Criteria

- [ ] Shopee URLs converted to affiliate links
- [ ] Conversion completes in <30 seconds
- [ ] Rate limit enforced (5/day)
- [ ] Links saved to database
- [ ] Order IDs saved as pending orders
- [ ] Duplicate order IDs rejected
- [ ] Error messages user-friendly

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Puppeteer timeout | Medium | Medium | 30s timeout, retry message |
| Cookie expiration | Medium | High | Admin must refresh .cookies.json |
| Bot detection | Low | High | Stealth plugin already in use |
| Concurrent conversions | Medium | Medium | Browser pooling in existing code |
