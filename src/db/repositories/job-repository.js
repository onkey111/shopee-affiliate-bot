/**
 * Job Repository
 * 
 * CRUD operations for conversion_jobs table.
 * Tracks affiliate link conversion jobs processed by BullMQ workers.
 */

const db = require('../connection');
const logger = require('../../utils/logger');

const jobRepo = {
    /**
     * Create a new conversion job
     * @param {Object} data - Job data
     * @param {number} data.userId - User ID
     * @param {string} data.originalUrl - Original Shopee URL
     * @param {bigint} data.telegramChatId - Telegram chat ID for response
     * @param {bigint} [data.telegramMessageId] - Optional message ID to edit
     * @param {string} [data.bullmqJobId] - BullMQ job ID for correlation
     * @returns {Promise<Object>} Created job record
     */
    async create(data) {
        const result = await db.query(
            `INSERT INTO conversion_jobs 
             (user_id, original_url, telegram_chat_id, telegram_message_id, bullmq_job_id, status)
             VALUES ($1, $2, $3, $4, $5, 'pending')
             RETURNING *`,
            [data.userId, data.originalUrl, data.telegramChatId, data.telegramMessageId || null, data.bullmqJobId || null]
        );
        return result.rows[0];
    },

    /**
     * Find job by ID
     * @param {number} id - Job ID
     * @returns {Promise<Object|null>} Job record or null
     */
    async findById(id) {
        const result = await db.query(
            'SELECT * FROM conversion_jobs WHERE id = $1',
            [id]
        );
        return result.rows[0] || null;
    },

    /**
     * Find job by BullMQ job ID
     * @param {string} jobId - BullMQ job ID
     * @returns {Promise<Object|null>} Job record or null
     */
    async findByBullMQJobId(jobId) {
        const result = await db.query(
            'SELECT * FROM conversion_jobs WHERE bullmq_job_id = $1',
            [jobId]
        );
        return result.rows[0] || null;
    },

    /**
     * Find jobs by user ID
     * @param {number} userId - User ID
     * @param {number} [limit=10] - Maximum number of jobs to return
     * @returns {Promise<Array>} Array of job records
     */
    async findByUserId(userId, limit = 10) {
        const result = await db.query(
            `SELECT * FROM conversion_jobs 
             WHERE user_id = $1 
             ORDER BY created_at DESC 
             LIMIT $2`,
            [userId, limit]
        );
        return result.rows;
    },

    /**
     * Find pending jobs
     * @param {number} [limit=100] - Maximum number of jobs to return
     * @returns {Promise<Array>} Array of pending job records
     */
    async findPending(limit = 100) {
        const result = await db.query(
            `SELECT * FROM conversion_jobs 
             WHERE status = 'pending' 
             ORDER BY created_at ASC 
             LIMIT $1`,
            [limit]
        );
        return result.rows;
    },

    /**
     * Update job status with optional additional data
     * @param {number} id - Job ID
     * @param {string} status - New status (pending, processing, completed, failed)
     * @param {Object} [data={}] - Additional data to update
     * @returns {Promise<Object|null>} Updated job record or null
     */
    async updateStatus(id, status, data = {}) {
        const updates = ['status = $2'];
        const values = [id, status];
        let paramIndex = 3;

        if (data.affiliateUrl !== undefined) {
            updates.push(`affiliate_url = $${paramIndex++}`);
            values.push(data.affiliateUrl);
        }
        if (data.errorMessage !== undefined) {
            updates.push(`error_message = $${paramIndex++}`);
            values.push(data.errorMessage);
        }
        if (data.bullmqJobId !== undefined) {
            updates.push(`bullmq_job_id = $${paramIndex++}`);
            values.push(data.bullmqJobId);
        }

        const result = await db.query(
            `UPDATE conversion_jobs 
             SET ${updates.join(', ')}
             WHERE id = $1
             RETURNING *`,
            values
        );
        return result.rows[0] || null;
    },

    /**
     * Mark job as processing
     * @param {number} id - Job ID
     * @returns {Promise<Object|null>} Updated job record or null
     */
    async markProcessing(id) {
        const result = await db.query(
            `UPDATE conversion_jobs 
             SET status = 'processing', started_at = NOW()
             WHERE id = $1
             RETURNING *`,
            [id]
        );
        return result.rows[0] || null;
    },

    /**
     * Mark job as completed with affiliate URL
     * @param {number} id - Job ID
     * @param {string} affiliateUrl - Generated affiliate URL
     * @returns {Promise<Object|null>} Updated job record or null
     */
    async markCompleted(id, affiliateUrl) {
        const result = await db.query(
            `UPDATE conversion_jobs 
             SET status = 'completed', affiliate_url = $2, completed_at = NOW()
             WHERE id = $1
             RETURNING *`,
            [id, affiliateUrl]
        );
        return result.rows[0] || null;
    },

    /**
     * Mark job as failed with error message
     * @param {number} id - Job ID
     * @param {string} errorMessage - Error message
     * @returns {Promise<Object|null>} Updated job record or null
     */
    async markFailed(id, errorMessage) {
        const result = await db.query(
            `UPDATE conversion_jobs 
             SET status = 'failed', error_message = $2, completed_at = NOW()
             WHERE id = $1
             RETURNING *`,
            [id, errorMessage]
        );
        return result.rows[0] || null;
    },

    /**
     * Increment job attempts counter
     * @param {number} id - Job ID
     * @returns {Promise<Object|null>} Updated job record or null
     */
    async incrementAttempts(id) {
        const result = await db.query(
            `UPDATE conversion_jobs 
             SET attempts = attempts + 1
             WHERE id = $1
             RETURNING *`,
            [id]
        );
        return result.rows[0] || null;
    },

    /**
     * Count jobs created by user today
     * @param {number} userId - User ID
     * @returns {Promise<number>} Count of jobs today
     */
    async countByUserToday(userId) {
        const result = await db.query(
            `SELECT COUNT(*) as count FROM conversion_jobs 
             WHERE user_id = $1 AND DATE(created_at) = CURRENT_DATE`,
            [userId]
        );
        return parseInt(result.rows[0].count);
    },

    /**
     * Move failed job to dead letter queue
     * @param {number} jobId - Job ID
     * @returns {Promise<Object|null>} Dead letter job record or null
     */
    async moveToDeadLetter(jobId) {
        const job = await this.findById(jobId);
        if (!job) return null;

        const result = await db.query(
            `INSERT INTO dead_letter_jobs 
             (original_job_id, user_id, original_url, error_message, attempts, telegram_chat_id)
             VALUES ($1, $2, $3, $4, $5, $6)
             RETURNING *`,
            [job.id, job.user_id, job.original_url, job.error_message, job.attempts, job.telegram_chat_id]
        );
        return result.rows[0] || null;
    },

    /**
     * Get job statistics
     * @returns {Promise<Object>} Statistics object
     */
    async getStats() {
        const result = await db.query(`
            SELECT
                COUNT(*) FILTER (WHERE status = 'pending') as pending,
                COUNT(*) FILTER (WHERE status = 'processing') as processing,
                COUNT(*) FILTER (WHERE status = 'completed') as completed,
                COUNT(*) FILTER (WHERE status = 'failed') as failed,
                COUNT(*) as total
            FROM conversion_jobs
            WHERE created_at > NOW() - INTERVAL '24 hours'
        `);
        return result.rows[0];
    },

    /**
     * Get dead letter jobs
     * @param {number} [limit=50] - Maximum jobs to return
     * @param {number} [offset=0] - Offset for pagination
     * @returns {Promise<Array>} Array of dead letter jobs
     */
    async getDeadLetterJobs(limit = 50, offset = 0) {
        const result = await db.query(
            `SELECT * FROM dead_letter_jobs
             ORDER BY failed_at DESC
             LIMIT $1 OFFSET $2`,
            [limit, offset]
        );
        return result.rows;
    },

    /**
     * Get dead letter job count
     * @returns {Promise<number>} Count of dead letter jobs
     */
    async getDeadLetterCount() {
        const result = await db.query('SELECT COUNT(*) as count FROM dead_letter_jobs');
        return parseInt(result.rows[0].count);
    },

    /**
     * Reset job for retry (from dead letter)
     * @param {number} id - Job ID
     * @returns {Promise<Object|null>} Updated job record or null
     */
    async resetForRetry(id) {
        const result = await db.query(
            `UPDATE conversion_jobs
             SET status = 'pending', attempts = 0, error_message = NULL,
                 started_at = NULL, completed_at = NULL
             WHERE id = $1
             RETURNING *`,
            [id]
        );

        // Remove from dead letter table if exists
        await db.query(
            'DELETE FROM dead_letter_jobs WHERE original_job_id = $1',
            [id]
        );

        return result.rows[0] || null;
    },

    /**
     * Purge old dead letter jobs
     * @param {Date} cutoffDate - Delete jobs older than this date
     * @returns {Promise<number>} Count of deleted jobs
     */
    async purgeDeadLetterJobs(cutoffDate) {
        const result = await db.query(
            'DELETE FROM dead_letter_jobs WHERE failed_at < $1',
            [cutoffDate]
        );
        return result.rowCount;
    },

    /**
     * Get recent jobs with pagination
     * @param {number} [limit=50] - Maximum jobs to return
     * @param {number} [offset=0] - Offset for pagination
     * @param {string} [status] - Optional status filter
     * @returns {Promise<Array>} Array of job records
     */
    async getRecentJobs(limit = 50, offset = 0, status = null) {
        let query = `SELECT cj.*, u.telegram_id, u.first_name
                     FROM conversion_jobs cj
                     LEFT JOIN users u ON cj.user_id = u.id`;
        const params = [];

        if (status) {
            query += ' WHERE cj.status = $1';
            params.push(status);
        }

        query += ` ORDER BY cj.created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
        params.push(limit, offset);

        const result = await db.query(query, params);
        return result.rows;
    },

    /**
     * Get failure rate for last N hours
     * @param {number} [hours=1] - Number of hours to look back
     * @returns {Promise<Object>} Object with total, failed, rate
     */
    async getFailureRate(hours = 1) {
        const result = await db.query(`
            SELECT
                COUNT(*) as total,
                COUNT(*) FILTER (WHERE status = 'failed') as failed
            FROM conversion_jobs
            WHERE created_at > NOW() - INTERVAL '${hours} hours'
        `);
        const { total, failed } = result.rows[0];
        const rate = total > 0 ? (parseInt(failed) / parseInt(total)) * 100 : 0;
        return { total: parseInt(total), failed: parseInt(failed), rate };
    }
};

module.exports = jobRepo;

