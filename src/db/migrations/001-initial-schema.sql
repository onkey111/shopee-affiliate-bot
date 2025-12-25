-- Users table
CREATE TABLE IF NOT EXISTS users (
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
CREATE TABLE IF NOT EXISTS bank_accounts (
    id SERIAL PRIMARY KEY,
    user_id INT UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    bank_name VARCHAR(100) NOT NULL,
    account_number VARCHAR(50) NOT NULL,
    account_holder VARCHAR(100) NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Links
CREATE TABLE IF NOT EXISTS links (
    id SERIAL PRIMARY KEY,
    user_id INT NOT NULL REFERENCES users(id),
    original_url TEXT NOT NULL,
    affiliate_url TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Orders
DO $$ BEGIN
    CREATE TYPE order_status AS ENUM ('pending', 'approved', 'rejected');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS orders (
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
CREATE TABLE IF NOT EXISTS commissions (
    id SERIAL PRIMARY KEY,
    user_id INT NOT NULL REFERENCES users(id),
    from_user_id INT NOT NULL REFERENCES users(id),
    order_id INT REFERENCES orders(id),
    amount DECIMAL(12,2) NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Withdrawals
DO $$ BEGIN
    CREATE TYPE withdraw_status AS ENUM ('pending', 'approved', 'rejected', 'completed');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS withdrawals (
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
CREATE INDEX IF NOT EXISTS idx_users_telegram_id ON users(telegram_id);
CREATE INDEX IF NOT EXISTS idx_users_ref_code ON users(ref_code);
CREATE INDEX IF NOT EXISTS idx_links_user_id ON links(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_user_id ON orders(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_withdrawals_status ON withdrawals(status);

