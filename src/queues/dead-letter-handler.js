/**
 * Dead Letter Queue Handler
 * 
 * Handles jobs that have failed all retries.
 * Provides functions to view, retry, and purge dead letter jobs.
 */

const { QueueEvents } = require('bullmq');
const { getRedisConnection } = require('./connection');
const { getAffiliateQueue, QUEUE_NAME, addConversionJob } = require('./affiliate-queue');
const jobRepo = require('../db/repositories/job-repository');
const logger = require('../utils/logger');

// QueueEvents instance for monitoring
let queueEvents = null;

// Dead letter job tracking (in-memory cache, synced with DB)
const deadLetterCache = new Map();

/**
 * Setup dead letter queue handler
 * Listens for failed jobs and tracks them
 * @param {Queue} [queue] - Optional queue instance
 * @returns {QueueEvents} QueueEvents instance
 */
function setupDeadLetterHandler(queue) {
    if (queueEvents) {
        return queueEvents;
    }

    const connection = getRedisConnection();
    queueEvents = new QueueEvents(QUEUE_NAME, { connection });

    queueEvents.on('failed', async ({ jobId, failedReason, prev }) => {
        logger.warn('Job failed event', { jobId, failedReason, prev });
        
        // Check if this is a final failure (moved to dead letter)
        const q = queue || getAffiliateQueue();
        const job = await q.getJob(jobId);
        
        if (job && job.attemptsMade >= job.opts.attempts) {
            // This job has exhausted all retries
            deadLetterCache.set(jobId, {
                jobId,
                data: job.data,
                failedReason,
                failedAt: new Date(),
                attemptsMade: job.attemptsMade
            });
            
            logger.error('Job moved to dead letter', {
                jobId,
                dbJobId: job.data?.jobId,
                failedReason,
                attempts: job.attemptsMade
            });
        }
    });

    queueEvents.on('error', (err) => {
        logger.error('QueueEvents error', { error: err.message });
    });

    logger.info('Dead letter handler setup complete');
    return queueEvents;
}

/**
 * Get dead letter jobs from database
 * @param {number} [limit=50] - Maximum jobs to return
 * @param {number} [offset=0] - Offset for pagination
 * @returns {Promise<Array>} Array of dead letter jobs
 */
async function getDeadLetterJobs(limit = 50, offset = 0) {
    try {
        // Get from database (jobs with status 'dead_letter')
        const jobs = await jobRepo.getDeadLetterJobs(limit, offset);
        return jobs;
    } catch (err) {
        logger.error('Failed to get dead letter jobs', { error: err.message });
        return [];
    }
}

/**
 * Retry a dead letter job
 * Creates a new job with the same data
 * @param {number} dbJobId - Database job ID
 * @returns {Promise<Object>} Result with success status
 */
async function retryDeadLetterJob(dbJobId) {
    try {
        // Get job from database
        const job = await jobRepo.findById(dbJobId);
        
        if (!job) {
            return { success: false, error: 'Job not found' };
        }
        
        if (job.status !== 'dead_letter' && job.status !== 'failed') {
            return { success: false, error: `Cannot retry job with status: ${job.status}` };
        }
        
        // Reset job status in database
        await jobRepo.resetForRetry(dbJobId);
        
        // Add new job to queue
        const newJob = await addConversionJob({
            jobId: dbJobId,
            userId: job.user_id,
            originalUrl: job.original_url,
            telegramChatId: job.telegram_chat_id,
            telegramMessageId: job.telegram_message_id
        });
        
        // Remove from dead letter cache
        deadLetterCache.delete(`conversion-${dbJobId}`);
        
        logger.info('Dead letter job retried', { dbJobId, newJobId: newJob.id });
        
        return { success: true, newJobId: newJob.id };
    } catch (err) {
        logger.error('Failed to retry dead letter job', { dbJobId, error: err.message });
        return { success: false, error: err.message };
    }
}

/**
 * Purge old dead letter jobs
 * @param {number} [olderThanDays=7] - Delete jobs older than this many days
 * @returns {Promise<Object>} Result with count of purged jobs
 */
async function purgeDeadLetterJobs(olderThanDays = 7) {
    try {
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);
        
        const count = await jobRepo.purgeDeadLetterJobs(cutoffDate);
        
        // Clear cache entries older than cutoff
        for (const [jobId, job] of deadLetterCache.entries()) {
            if (job.failedAt < cutoffDate) {
                deadLetterCache.delete(jobId);
            }
        }
        
        logger.info('Dead letter jobs purged', { olderThanDays, count });
        
        return { success: true, count };
    } catch (err) {
        logger.error('Failed to purge dead letter jobs', { error: err.message });
        return { success: false, error: err.message, count: 0 };
    }
}

/**
 * Get dead letter job count
 * @returns {Promise<number>} Count of dead letter jobs
 */
async function getDeadLetterCount() {
    try {
        return await jobRepo.getDeadLetterCount();
    } catch (err) {
        logger.error('Failed to get dead letter count', { error: err.message });
        return 0;
    }
}

/**
 * Close the queue events listener
 * @returns {Promise<void>}
 */
async function closeDeadLetterHandler() {
    if (queueEvents) {
        await queueEvents.close();
        queueEvents = null;
        logger.info('Dead letter handler closed');
    }
}

module.exports = {
    setupDeadLetterHandler,
    getDeadLetterJobs,
    retryDeadLetterJob,
    purgeDeadLetterJobs,
    getDeadLetterCount,
    closeDeadLetterHandler
};

