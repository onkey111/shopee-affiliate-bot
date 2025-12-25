const db = require('../connection');

const commissionRepo = {
    async create(userId, fromUserId, orderId, amount) {
        const result = await db.query(
            `INSERT INTO commissions (user_id, from_user_id, order_id, amount)
             VALUES ($1, $2, $3, $4)
             RETURNING *`,
            [userId, fromUserId, orderId, amount]
        );
        return result.rows[0];
    },

    async findByUserId(userId, limit = 20) {
        const result = await db.query(
            `SELECT c.*, u.telegram_username as from_username
             FROM commissions c
             JOIN users u ON c.from_user_id = u.id
             WHERE c.user_id = $1
             ORDER BY c.created_at DESC LIMIT $2`,
            [userId, limit]
        );
        return result.rows;
    },

    async getTotalByUserId(userId) {
        const result = await db.query(
            'SELECT COALESCE(SUM(amount), 0) as total FROM commissions WHERE user_id = $1',
            [userId]
        );
        return parseFloat(result.rows[0].total);
    }
};

module.exports = commissionRepo;

