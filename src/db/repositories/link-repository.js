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

    /**
     * Get link creation timestamps within a time window for burst/cooldown calculation
     * @param {number} userId - User ID
     * @param {number} windowMinutes - Time window in minutes
     * @returns {Promise<Date[]>} Array of creation timestamps
     */
    async getRecentCreationTimestamps(userId, windowMinutes) {
        const result = await db.query(
            `SELECT created_at FROM links
             WHERE user_id = $1 AND created_at > NOW() - INTERVAL '1 minute' * $2
             ORDER BY created_at DESC`,
            [userId, windowMinutes]
        );
        return result.rows.map(row => new Date(row.created_at));
    },

    /**
     * Count links created by user within a time window
     * @param {number} userId - User ID
     * @param {number} windowMinutes - Time window in minutes
     * @returns {Promise<number>} Count of links in window
     */
    async countInWindow(userId, windowMinutes) {
        const result = await db.query(
            `SELECT COUNT(*) as count FROM links
             WHERE user_id = $1 AND created_at > NOW() - INTERVAL '1 minute' * $2`,
            [userId, windowMinutes]
        );
        return parseInt(result.rows[0].count);
    },

    /**
     * Get the most recent link creation timestamp for a user
     * @param {number} userId - User ID
     * @returns {Promise<Date|null>} Most recent creation timestamp or null
     */
    async getLastCreationTime(userId) {
        const result = await db.query(
            `SELECT created_at FROM links
             WHERE user_id = $1
             ORDER BY created_at DESC LIMIT 1`,
            [userId]
        );
        return result.rows[0] ? new Date(result.rows[0].created_at) : null;
    }
};

module.exports = linkRepo;

