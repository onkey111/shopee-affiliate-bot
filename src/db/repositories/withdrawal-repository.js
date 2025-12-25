const db = require('../connection');

const withdrawalRepo = {
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
            'SELECT * FROM withdrawals WHERE id = $1',
            [id]
        );
        return result.rows[0] || null;
    },

    async findByUserId(userId, limit = 20) {
        const result = await db.query(
            `SELECT w.*, ba.bank_name, ba.account_number, ba.account_holder
             FROM withdrawals w
             LEFT JOIN bank_accounts ba ON w.bank_account_id = ba.id
             WHERE w.user_id = $1
             ORDER BY w.created_at DESC LIMIT $2`,
            [userId, limit]
        );
        return result.rows;
    },

    async findPending(limit = 50) {
        const result = await db.query(
            `SELECT w.*, u.telegram_username, u.telegram_first_name, u.telegram_id,
                    ba.bank_name, ba.account_number, ba.account_holder
             FROM withdrawals w
             JOIN users u ON w.user_id = u.id
             LEFT JOIN bank_accounts ba ON w.bank_account_id = ba.id
             WHERE w.status = 'pending'
             ORDER BY w.created_at ASC LIMIT $1`,
            [limit]
        );
        return result.rows;
    },

    async approve(id) {
        const result = await db.query(
            `UPDATE withdrawals SET status = 'approved', processed_at = NOW()
             WHERE id = $1 RETURNING *`,
            [id]
        );
        return result.rows[0];
    },

    async complete(id) {
        const result = await db.query(
            `UPDATE withdrawals SET status = 'completed', processed_at = NOW()
             WHERE id = $1 RETURNING *`,
            [id]
        );
        return result.rows[0];
    },

    async reject(id, adminNote = null) {
        const result = await db.query(
            `UPDATE withdrawals SET status = 'rejected', admin_note = $1, processed_at = NOW()
             WHERE id = $2 RETURNING *`,
            [adminNote, id]
        );
        return result.rows[0];
    },

    async hasPending(userId) {
        const result = await db.query(
            `SELECT COUNT(*) as count FROM withdrawals 
             WHERE user_id = $1 AND status = 'pending'`,
            [userId]
        );
        return parseInt(result.rows[0].count) > 0;
    },

    async countByStatus(status) {
        const result = await db.query(
            'SELECT COUNT(*) as count FROM withdrawals WHERE status = $1',
            [status]
        );
        return parseInt(result.rows[0].count);
    }
};

module.exports = withdrawalRepo;

