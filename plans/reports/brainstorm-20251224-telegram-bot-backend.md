# Brainstorm Report: Telegram Bot Backend for Shopee Affiliate

**Date:** 2025-12-24  
**Status:** Ready for Review

---

## 1. Problem Statement

Build a Telegram bot backend for Shopee affiliate link conversion with:
- Beautiful inline button UI
- 1-tier referral system (5:4:1 commission split)
- User balance management & withdrawal
- Admin web panel for order verification
- Rate limiting (5 links/day)

---

## 2. Requirements Summary

| Aspect | Decision |
|--------|----------|
| Database | PostgreSQL |
| Referral Model | 1-tier: A→B (A gets 10% from B's orders) |
| Commission Split | 5:4:1 (Owner:User:Referrer) |
| Order Verification | Manual by admin via web panel |
| Rate Limit | 5 links/day/user |
| Min Withdraw | 100,000 VND |
| Notifications | Order approved, New referral commission, Withdraw success |

---

## 3. Evaluated Approaches

### Approach A: Full Monolith (NOT Recommended)
Single file with everything mixed together.

**Cons:** Unmaintainable, hard to scale, violates SRP.

### Approach B: Modular Monolith (RECOMMENDED)
Separate concerns into modules but single deployment.

```
src/
├── bot/           # Telegram bot (handlers, keyboards)
├── admin/         # Express web admin panel
├── services/      # Business logic layer
├── db/            # Database layer
├── utils/         # Helpers
└── config/        # Configuration
```

**Pros:**
- Clean separation of concerns
- Easy to maintain & test
- Single deployment simplicity
- Can evolve to microservices if needed

**Cons:**
- Slightly more initial setup

### Approach C: Microservices (Overkill)
Separate services for bot, admin, worker.

**Cons:** Over-engineering for this scale, complex deployment.

---

## 4. Recommended Solution

### 4.1 Project Structure

```
shopee-bot-tele-aff/
├── src/
│   ├── bot/
│   │   ├── index.js                     # Bot initialization
│   │   ├── commands/
│   │   │   ├── start-command.js         # /start handler
│   │   │   └── help-command.js          # /help handler
│   │   ├── callbacks/
│   │   │   ├── main-menu-callback.js    # Main menu actions
│   │   │   ├── affiliate-callback.js    # Convert link flow
│   │   │   ├── referral-callback.js     # Referral link
│   │   │   ├── commission-callback.js   # View commission
│   │   │   ├── balance-callback.js      # View balance/stats
│   │   │   ├── withdraw-callback.js     # Withdraw flow
│   │   │   └── bank-register-callback.js# Register bank account
│   │   ├── keyboards/
│   │   │   └── inline-keyboards.js      # All keyboard builders
│   │   └── middlewares/
│   │       └── rate-limiter.js          # Daily link limit check
│   │
│   ├── admin/
│   │   ├── index.js                     # Express app init
│   │   ├── routes/
│   │   │   ├── auth-routes.js           # Admin login
│   │   │   ├── order-routes.js          # Order management
│   │   │   ├── user-routes.js           # User management
│   │   │   └── withdraw-routes.js       # Withdraw requests
│   │   ├── controllers/
│   │   │   ├── order-controller.js
│   │   │   ├── user-controller.js
│   │   │   └── withdraw-controller.js
│   │   └── views/                       # EJS/HTML templates (simple)
│   │
│   ├── services/
│   │   ├── affiliate-service.js         # Reuse existing Puppeteer code
│   │   ├── user-service.js              # User CRUD, referral logic
│   │   ├── order-service.js             # Order CRUD, approval
│   │   ├── commission-service.js        # Commission calculation (5:4:1)
│   │   ├── withdraw-service.js          # Withdraw requests
│   │   └── notification-service.js      # Send Telegram notifications
│   │
│   ├── db/
│   │   ├── connection.js                # PostgreSQL pool
│   │   ├── migrations/
│   │   │   └── 001-initial-schema.sql   # All tables
│   │   └── repositories/
│   │       ├── user-repository.js
│   │       ├── link-repository.js
│   │       ├── order-repository.js
│   │       ├── commission-repository.js
│   │       └── withdraw-repository.js
│   │
│   ├── utils/
│   │   ├── ref-code-generator.js        # Generate unique ref codes
│   │   ├── validators.js                # Input validation
│   │   └── formatters.js                # Currency, date formatting
│   │
│   └── config/
│       └── index.js                     # All config from env
│
├── public/                              # Admin panel static files
├── .env.example
├── .cookies.json                        # Existing (gitignored)
├── package.json
└── index.js                             # Main entry point
```

### 4.2 Database Schema

```sql
-- =============================================
-- USERS TABLE
-- =============================================
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    telegram_id BIGINT UNIQUE NOT NULL,
    telegram_username VARCHAR(50),
    telegram_first_name VARCHAR(100),
    ref_code VARCHAR(20) UNIQUE NOT NULL,
    referred_by INT REFERENCES users(id),
    balance DECIMAL(12,2) DEFAULT 0,
    total_links INT DEFAULT 0,
    daily_links INT DEFAULT 0,
    daily_links_date DATE,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- =============================================
-- BANK ACCOUNTS TABLE (for withdrawals)
-- =============================================
CREATE TABLE bank_accounts (
    id SERIAL PRIMARY KEY,
    user_id INT UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    bank_name VARCHAR(100) NOT NULL,
    account_number VARCHAR(50) NOT NULL,
    account_holder VARCHAR(100) NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- =============================================
-- LINKS TABLE
-- =============================================
CREATE TABLE links (
    id SERIAL PRIMARY KEY,
    user_id INT NOT NULL REFERENCES users(id),
    original_url TEXT NOT NULL,
    affiliate_url TEXT NOT NULL,
    short_code VARCHAR(50),              -- for future short URL
    click_count INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT NOW()
);

-- =============================================
-- ORDERS TABLE
-- =============================================
CREATE TYPE order_status AS ENUM ('pending', 'approved', 'rejected');

CREATE TABLE orders (
    id SERIAL PRIMARY KEY,
    user_id INT NOT NULL REFERENCES users(id),
    shopee_order_id VARCHAR(100) NOT NULL,
    link_id INT REFERENCES links(id),
    status order_status DEFAULT 'pending',
    amount DECIMAL(12,2),                -- Total order value
    commission_total DECIMAL(12,2),      -- Total commission from Shopee
    user_commission DECIMAL(12,2),       -- 40% for user
    referrer_commission DECIMAL(12,2),   -- 10% for referrer (if any)
    owner_commission DECIMAL(12,2),      -- 50% for owner
    notified BOOLEAN DEFAULT FALSE,
    admin_note TEXT,
    approved_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW()
);

-- =============================================
-- COMMISSIONS TABLE (referral earnings)
-- =============================================
CREATE TABLE commissions (
    id SERIAL PRIMARY KEY,
    user_id INT NOT NULL REFERENCES users(id),      -- Referrer (who gets commission)
    from_user_id INT NOT NULL REFERENCES users(id), -- Referred user
    order_id INT REFERENCES orders(id),
    amount DECIMAL(12,2) NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);

-- =============================================
-- WITHDRAWALS TABLE
-- =============================================
CREATE TYPE withdraw_status AS ENUM ('pending', 'approved', 'rejected', 'completed');

CREATE TABLE withdrawals (
    id SERIAL PRIMARY KEY,
    user_id INT NOT NULL REFERENCES users(id),
    amount DECIMAL(12,2) NOT NULL,
    bank_account_id INT REFERENCES bank_accounts(id),
    status withdraw_status DEFAULT 'pending',
    admin_note TEXT,
    processed_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW()
);

-- =============================================
-- ORDER HISTORY TABLE (archive)
-- =============================================
CREATE TABLE order_history (
    id SERIAL PRIMARY KEY,
    user_id INT NOT NULL,
    shopee_order_id VARCHAR(100),
    source VARCHAR(50),
    status VARCHAR(20),
    amount DECIMAL(12,2),
    commission DECIMAL(12,2),
    original_created TIMESTAMP,
    archived_at TIMESTAMP DEFAULT NOW()
);

-- =============================================
-- INDEXES
-- =============================================
CREATE INDEX idx_users_telegram_id ON users(telegram_id);
CREATE INDEX idx_users_ref_code ON users(ref_code);
CREATE INDEX idx_links_user_id ON links(user_id);
CREATE INDEX idx_orders_user_id ON orders(user_id);
CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_commissions_user_id ON commissions(user_id);
CREATE INDEX idx_withdrawals_user_id ON withdrawals(user_id);
CREATE INDEX idx_withdrawals_status ON withdrawals(status);
```

### 4.3 Tech Stack

| Component | Choice | Reason |
|-----------|--------|--------|
| Runtime | Node.js 18+ | Existing Puppeteer code |
| Bot Framework | `telegraf` | Modern, middleware support, good TypeScript |
| Web Framework | Express.js | Simple, fast, well-known |
| Database | PostgreSQL + `pg` | Requested, reliable |
| Query Builder | Raw SQL (pg) | Simple, explicit, no ORM overhead |
| Admin UI | EJS + Bootstrap 5 | Simple server-rendered, fast to build |
| Auth | express-session + bcrypt | Simple admin auth |

### 4.4 Bot UI Flow

```
┌─────────────────────────────────────────────────────────────┐
│                    MAIN MENU                                │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │           🔗 Tạo Link Affiliate                     │   │
│  └─────────────────────────────────────────────────────┘   │
│  ┌─────────────────────────────────────────────────────┐   │
│  │           👥 Link Giới Thiệu                        │   │
│  └─────────────────────────────────────────────────────┘   │
│  ┌──────────────────────┬──────────────────────────────┐   │
│  │   💰 Hoa Hồng        │       📊 Thống Kê            │   │
│  └──────────────────────┴──────────────────────────────┘   │
│  ┌──────────────────────┬──────────────────────────────┐   │
│  │   💸 Rút Tiền        │       🏦 Tài Khoản NH        │   │
│  └──────────────────────┴──────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

**Flow Details:**

1. **🔗 Tạo Link Affiliate**
   ```
   User click → Bot: "Gửi link Shopee cần convert (còn X/5 lượt hôm nay)"
   User send link → Bot: "⏳ Đang xử lý..."
   Success → Bot: "✅ Link affiliate: [link]\n\n📝 Khi có đơn hàng, gửi Order ID để nhận hoa hồng"
   Limit reached → Bot: "❌ Đã hết 5 lượt hôm nay. Quay lại ngày mai!"
   ```

2. **👥 Link Giới Thiệu**
   ```
   User click → Bot: "🎁 Link giới thiệu của bạn:\nt.me/bot_name?start=REF_CODE\n\nMỗi đơn hàng từ người bạn giới thiệu, bạn nhận 10% hoa hồng!"
   ```

3. **💰 Hoa Hồng**
   ```
   User click → Bot shows:
   "💰 Hoa hồng từ giới thiệu
   
   Tổng: 150,000đ
   Tháng này: 50,000đ
   
   📋 Chi tiết gần đây:
   - @user1: +10,000đ (24/12)
   - @user2: +15,000đ (23/12)"
   ```

4. **📊 Thống Kê**
   ```
   User click → Bot shows:
   "📊 Thống Kê của bạn
   
   💵 Số dư: 250,000đ
   🔗 Tổng link đã tạo: 45
   📦 Đơn hàng thành công: 12
   👥 Người đã giới thiệu: 5
   💰 Tổng hoa hồng nhận: 150,000đ"
   ```

5. **💸 Rút Tiền**
   ```
   User click (no bank) → Bot: "⚠️ Vui lòng đăng ký tài khoản ngân hàng trước"
   User click (balance < 100k) → Bot: "❌ Số dư tối thiểu để rút: 100,000đ. Số dư hiện tại: Xđ"
   User click (OK) → Bot: "Nhập số tiền muốn rút (tối thiểu 100,000đ):"
   User send amount → Bot: "✅ Yêu cầu rút X đ đã được gửi. Chờ admin xử lý!"
   ```

6. **🏦 Tài Khoản NH**
   ```
   User click → Show current bank info OR registration form
   Registration: Bank name → Account number → Account holder → Confirm
   ```

### 4.5 Admin Panel Features

```
┌─────────────────────────────────────────────────────────────┐
│  SHOPEE AFFILIATE ADMIN                              [Logout]│
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  📊 Dashboard                                               │
│  ├── Total Users: 150                                       │
│  ├── Pending Orders: 12                                     │
│  ├── Pending Withdrawals: 5                                 │
│  └── Total Commission Paid: 2,500,000đ                      │
│                                                             │
│  📦 Orders (with filters: pending/approved/rejected)        │
│  ├── [Table: User, Order ID, Amount, Status, Actions]       │
│  └── Actions: Approve (enter amount) / Reject               │
│                                                             │
│  💸 Withdrawals (with filters)                              │
│  ├── [Table: User, Amount, Bank Info, Status, Actions]      │
│  └── Actions: Complete / Reject                             │
│                                                             │
│  👥 Users                                                   │
│  └── [Table: ID, Username, Balance, Links, Referrals]       │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 4.6 Commission Calculation Logic

```javascript
// When admin approves order with commission_total from Shopee
function calculateCommission(order, commissionTotal) {
    const user = getUser(order.user_id);
    
    // Split 5:4:1 = 50%:40%:10%
    const ownerShare = commissionTotal * 0.5;    // 50% for owner
    const userShare = commissionTotal * 0.4;     // 40% for user
    const referrerShare = commissionTotal * 0.1; // 10% for referrer
    
    // Update order
    order.commission_total = commissionTotal;
    order.owner_commission = ownerShare;
    order.user_commission = userShare;
    
    // Add to user balance
    user.balance += userShare;
    
    // Handle referrer commission
    if (user.referred_by) {
        const referrer = getUser(user.referred_by);
        referrer.balance += referrerShare;
        order.referrer_commission = referrerShare;
        
        // Record in commissions table
        createCommission({
            user_id: referrer.id,
            from_user_id: user.id,
            order_id: order.id,
            amount: referrerShare
        });
        
        // Notify referrer
        notifyUser(referrer.telegram_id, 
            `💰 Bạn nhận được ${referrerShare}đ hoa hồng từ @${user.telegram_username}!`);
    } else {
        // No referrer → owner gets the 10% too
        order.owner_commission += referrerShare;
        order.referrer_commission = 0;
    }
    
    // Notify user
    notifyUser(user.telegram_id,
        `✅ Đơn hàng ${order.shopee_order_id} đã được duyệt!\n💵 +${userShare}đ vào số dư`);
}
```

---

## 5. Implementation Phases

### Phase 1: Core Infrastructure
- Project setup (npm init, dependencies)
- Database connection & migrations
- Configuration management
- Basic bot initialization

### Phase 2: User Management
- /start command with referral handling
- User registration
- Bank account registration
- Main menu keyboard

### Phase 3: Affiliate Link Feature
- Integrate existing Puppeteer code
- Rate limiting (5/day)
- Link storage
- Order ID submission flow

### Phase 4: Commission & Balance
- Order creation (pending)
- Balance viewing
- Commission history
- Statistics

### Phase 5: Withdrawal
- Withdrawal request flow
- Minimum check (100k)
- Notification on completion

### Phase 6: Admin Panel
- Express setup
- Admin authentication
- Dashboard
- Order management (approve/reject)
- Withdrawal management
- User list

### Phase 7: Notifications
- Order approved notification
- Referral commission notification
- Withdrawal completed notification

---

## 6. Dependencies

```json
{
  "dependencies": {
    "telegraf": "^4.16.0",
    "express": "^4.18.2",
    "pg": "^8.11.3",
    "express-session": "^1.17.3",
    "bcrypt": "^5.1.1",
    "ejs": "^3.1.9",
    "dotenv": "^16.3.1",
    "puppeteer": "^24.33.0",
    "puppeteer-extra": "^3.3.6",
    "puppeteer-extra-plugin-stealth": "^2.11.2"
  }
}
```

---

## 7. Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Puppeteer blocking | High | Already using stealth plugin; add retry logic |
| Rate limit abuse | Medium | IP tracking, cooldown between requests |
| Database bottleneck | Low | Connection pooling, proper indexes |
| Admin panel security | High | Session auth, HTTPS, rate limiting |

---

## 8. Success Metrics

- Bot responds within 2s for non-Puppeteer actions
- Affiliate link conversion <30s
- Admin can process order in <30s
- Zero data loss on transactions

---

## 9. Next Steps

1. **User Review** → Approve this plan
2. **Create implementation plan** with detailed file-by-file tasks
3. **Start Phase 1** → Core infrastructure

---

## 10. Unresolved Questions

None - all requirements clarified.
