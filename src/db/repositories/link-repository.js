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

