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
        await db.query(
            `INSERT INTO bank_accounts (user_id, bank_name, account_number, account_holder)
             VALUES ($1, $2, $3, $4)
             ON CONFLICT (user_id) DO UPDATE SET
                bank_name = $2, account_number = $3, account_holder = $4`,
            [userId, bankName, accountNumber, accountHolder]
        );
    }
};

module.exports = userRepo;

