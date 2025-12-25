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
        await db.query('UPDATE orders SET notified = TRUE WHERE id = $1', [orderId]);
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

