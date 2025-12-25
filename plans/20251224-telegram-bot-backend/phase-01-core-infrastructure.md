# Phase 1: Core Infrastructure

**Parent Plan:** [plan.md](./plan.md)  
**Dependencies:** None  
**Status:** pending  
**Priority:** Critical  
**Estimate:** 2 hours

---

## Overview

Set up project foundation: directory structure, dependencies, configuration, database connection, migrations, and basic bot initialization.

---

## Requirements

- Project structure as per plan
- PostgreSQL connection with pooling
- Environment-based configuration
- Database migrations system
- Bot skeleton with session middleware
- Error handling foundation

---

## Architecture

### Code Structure
```
src/
├── config/
│   └── index.js              # Config loader from env
├── db/
│   ├── connection.js         # PG pool
│   └── migrations/
│       └── 001-initial-schema.sql
├── bot/
│   └── index.js              # Bot init skeleton
└── utils/
    └── logger.js             # Simple console logger
index.js                      # Entry point
.env.example
package.json
```

### Database Schema (Phase 1)
```sql
-- Users table
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

-- Bank accounts
CREATE TABLE bank_accounts (
    id SERIAL PRIMARY KEY,
    user_id INT UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    bank_name VARCHAR(100) NOT NULL,
    account_number VARCHAR(50) NOT NULL,
    account_holder VARCHAR(100) NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Links
CREATE TABLE links (
    id SERIAL PRIMARY KEY,
    user_id INT NOT NULL REFERENCES users(id),
    original_url TEXT NOT NULL,
    affiliate_url TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Orders
CREATE TYPE order_status AS ENUM ('pending', 'approved', 'rejected');
CREATE TABLE orders (
    id SERIAL PRIMARY KEY,
    user_id INT NOT NULL REFERENCES users(id),
    shopee_order_id VARCHAR(100) NOT NULL,
    link_id INT REFERENCES links(id),
    status order_status DEFAULT 'pending',
    amount DECIMAL(12,2),
    commission_total DECIMAL(12,2),
    user_commission DECIMAL(12,2),
    referrer_commission DECIMAL(12,2),
    owner_commission DECIMAL(12,2),
    notified BOOLEAN DEFAULT FALSE,
    admin_note TEXT,
    approved_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Commissions (referral earnings)
CREATE TABLE commissions (
    id SERIAL PRIMARY KEY,
    user_id INT NOT NULL REFERENCES users(id),
    from_user_id INT NOT NULL REFERENCES users(id),
    order_id INT REFERENCES orders(id),
    amount DECIMAL(12,2) NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Withdrawals
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

-- Indexes
CREATE INDEX idx_users_telegram_id ON users(telegram_id);
CREATE INDEX idx_users_ref_code ON users(ref_code);
CREATE INDEX idx_links_user_id ON links(user_id);
CREATE INDEX idx_orders_user_id ON orders(user_id);
CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_withdrawals_status ON withdrawals(status);
```

---

## Related Code Files

| File | Purpose |
|------|---------|
| `index.js` | Entry point - starts bot + admin |
| `src/config/index.js` | Load env vars |
| `src/db/connection.js` | PG pool singleton |
| `src/db/migrations/001-initial-schema.sql` | Full schema |
| `src/bot/index.js` | Bot init with session |
| `src/utils/logger.js` | Logging utility |
| `.env.example` | Environment template |
| `package.json` | Dependencies |

---

## Implementation Steps

### Step 1: Initialize package.json
```bash
npm init -y
```

Add to `package.json`:
```json
{
  "name": "shopee-affiliate-bot",
  "version": "1.0.0",
  "main": "index.js",
  "scripts": {
    "start": "node index.js",
    "dev": "node --watch index.js",
    "migrate": "node src/db/migrate.js"
  },
  "dependencies": {
    "telegraf": "^4.16.0",
    "express": "^4.18.2",
    "express-session": "^1.17.3",
    "express-ejs-layouts": "^2.5.1",
    "ejs": "^3.1.9",
    "connect-flash": "^0.1.1",
    "pg": "^8.11.3",
    "dotenv": "^16.3.1",
    "puppeteer": "^24.0.0",
    "puppeteer-extra": "^3.3.6",
    "puppeteer-extra-plugin-stealth": "^2.11.2"
  }
}
```

### Step 2: Create .env.example
```env
# Bot
BOT_TOKEN=your_telegram_bot_token

# Database
DATABASE_URL=postgresql://user:pass@localhost:5432/shopee_bot
DB_HOST=localhost
DB_PORT=5432
DB_NAME=shopee_bot
DB_USER=postgres
DB_PASSWORD=postgres

# Admin
ADMIN_USER=admin
ADMIN_PASSWORD=changeme
SESSION_SECRET=random-secret-key

# App
NODE_ENV=development
PORT=3000
```

### Step 3: Create src/config/index.js
```javascript
require('dotenv').config();

module.exports = {
    bot: {
        token: process.env.BOT_TOKEN
    },
    db: {
        connectionString: process.env.DATABASE_URL,
        host: process.env.DB_HOST || 'localhost',
        port: parseInt(process.env.DB_PORT) || 5432,
        database: process.env.DB_NAME || 'shopee_bot',
        user: process.env.DB_USER || 'postgres',
        password: process.env.DB_PASSWORD || 'postgres',
        max: 20,  // pool size
        idleTimeoutMillis: 30000
    },
    admin: {
        user: process.env.ADMIN_USER || 'admin',
        password: process.env.ADMIN_PASSWORD || 'admin123',
        sessionSecret: process.env.SESSION_SECRET || 'change-me'
    },
    app: {
        env: process.env.NODE_ENV || 'development',
        port: parseInt(process.env.PORT) || 3000
    },
    limits: {
        dailyLinks: 5,
        minWithdraw: 100000  // VND
    },
    commission: {
        owner: 0.5,    // 50%
        user: 0.4,     // 40%
        referrer: 0.1  // 10%
    }
};
```

### Step 4: Create src/db/connection.js
```javascript
const { Pool } = require('pg');
const config = require('../config');

const pool = new Pool(config.db);

pool.on('error', (err) => {
    console.error('Unexpected DB error:', err);
    process.exit(-1);
});

module.exports = {
    query: (text, params) => pool.query(text, params),
    getClient: () => pool.connect(),
    pool
};
```

### Step 5: Create src/db/migrations/001-initial-schema.sql
Full schema as shown in Architecture section above.

### Step 6: Create src/db/migrate.js
```javascript
const fs = require('fs');
const path = require('path');
const db = require('./connection');

async function migrate() {
    const migrationsDir = path.join(__dirname, 'migrations');
    const files = fs.readdirSync(migrationsDir)
        .filter(f => f.endsWith('.sql'))
        .sort();

    console.log('Running migrations...');
    
    for (const file of files) {
        const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
        console.log(`  - ${file}`);
        await db.query(sql);
    }
    
    console.log('Migrations complete!');
    process.exit(0);
}

migrate().catch(err => {
    console.error('Migration failed:', err);
    process.exit(1);
});
```

### Step 7: Create src/utils/logger.js
```javascript
const log = (level, msg, data = {}) => {
    const ts = new Date().toISOString();
    console.log(JSON.stringify({ ts, level, msg, ...data }));
};

module.exports = {
    info: (msg, data) => log('info', msg, data),
    error: (msg, data) => log('error', msg, data),
    warn: (msg, data) => log('warn', msg, data),
    debug: (msg, data) => process.env.NODE_ENV !== 'production' && log('debug', msg, data)
};
```

### Step 8: Create src/bot/index.js (Skeleton)
```javascript
const { Telegraf, session, Scenes } = require('telegraf');
const config = require('../config');
const logger = require('../utils/logger');

function createBot() {
    const bot = new Telegraf(config.bot.token);

    // Session middleware
    bot.use(session({
        defaultSession: () => ({ step: 'idle' })
    }));

    // Error handler
    bot.catch((err, ctx) => {
        logger.error('Bot error', { error: err.message, update: ctx.updateType });
        ctx.reply('Co loi xay ra. Vui long thu lai /start').catch(() => {});
    });

    // Placeholder for /start
    bot.command('start', (ctx) => {
        ctx.reply('Bot dang duoc phat trien...');
    });

    return bot;
}

module.exports = { createBot };
```

### Step 9: Create index.js (Entry Point)
```javascript
const { createBot } = require('./src/bot');
const logger = require('./src/utils/logger');

async function main() {
    logger.info('Starting Shopee Affiliate Bot...');

    // Create and launch bot
    const bot = createBot();
    
    // Graceful shutdown
    process.once('SIGINT', () => bot.stop('SIGINT'));
    process.once('SIGTERM', () => bot.stop('SIGTERM'));

    await bot.launch();
    logger.info('Bot started successfully');
}

main().catch(err => {
    logger.error('Startup failed', { error: err.message });
    process.exit(1);
});
```

### Step 10: Create Directory Structure
```bash
mkdir -p src/bot/commands src/bot/callbacks src/bot/keyboards src/bot/scenes
mkdir -p src/admin/routes src/admin/controllers src/admin/middleware
mkdir -p src/services src/db/repositories src/db/migrations
mkdir -p src/utils src/config
mkdir -p views/layouts views/partials views/admin
mkdir -p public/css public/js
```

---

## Todo List

- [ ] Run `npm init` and configure package.json
- [ ] Create `.env.example` and copy to `.env`
- [ ] Create `src/config/index.js`
- [ ] Create `src/db/connection.js`
- [ ] Create `src/db/migrations/001-initial-schema.sql`
- [ ] Create `src/db/migrate.js`
- [ ] Create `src/utils/logger.js`
- [ ] Create `src/bot/index.js` skeleton
- [ ] Create `index.js` entry point
- [ ] Create directory structure
- [ ] Run `npm install`
- [ ] Create PostgreSQL database
- [ ] Run migrations (`npm run migrate`)
- [ ] Test bot starts and responds to /start

---

## Success Criteria

- [ ] Bot starts without errors
- [ ] Database connection established
- [ ] All tables created via migration
- [ ] /start command responds
- [ ] Graceful shutdown works (SIGINT/SIGTERM)

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| DB connection fails | Medium | High | Check credentials, firewall |
| Bot token invalid | Low | High | Verify with @BotFather |
| Missing dependencies | Low | Medium | Check package.json |
