/**
 * Affiliate Queue Module
 * 
 * BullMQ queue definition for affiliate link conversion jobs.
 * Handles job creation, queue management, and statistics.
 */

const { Queue } = require('bullmq');
const { getRedisConnection } = require('./connection');
const config = require('../config');
const logger = require('../utils/logger');

// Queue name constant
const QUEUE_NAME = 'affiliate-conversion';

// Singleton queue instance
let affiliateQueue = null;

/**
 * Get default job options from config
 * @returns {Object} Default job options
 */
function getDefaultJobOptions() {
    return {
        attempts: config.queue.maxRetries,
        backoff: {
            type: 'exponential',
            delay: 2000 // Start with 2 seconds, then 4s, 8s, etc.
        },
        timeout: config.queue.jobTimeout,
        removeOnComplete: config.queue.removeOnComplete,
        removeOnFail: config.queue.removeOnFail
    };
}

/**
 * Get or create the affiliate queue instance
 * @returns {Queue} BullMQ Queue instance
 */
function getAffiliateQueue() {
    if (!affiliateQueue) {
        const connection = getRedisConnection();
        
        affiliateQueue = new Queue(QUEUE_NAME, {
            connection,
            defaultJobOptions: getDefaultJobOptions(),
            limiter: {
                max: config.queue.rateLimitMax,
                duration: config.queue.rateLimitDuration
            }
        });

        affiliateQueue.on('error', (err) => {
            logger.error('Affiliate queue error', { error: err.message });
        });

        logger.info('Affiliate queue initialized', { 
            name: QUEUE_NAME,
            concurrency: config.queue.concurrency,
            maxRetries: config.queue.maxRetries
        });
    }
    return affiliateQueue;
}

/**
 * Add a conversion job to the queue
 * @param {Object} data - Job data
 * @param {number} data.jobId - Database job ID
 * @param {number} data.userId - User ID
 * @param {string} data.originalUrl - Original Shopee URL
 * @param {bigint} data.telegramChatId - Telegram chat ID for response
 * @param {bigint} [data.telegramMessageId] - Optional message ID to edit
 * @param {Object} [options={}] - Additional job options
 * @returns {Promise<Object>} BullMQ Job instance
 */
async function addConversionJob(data, options = {}) {
    const queue = getAffiliateQueue();
    
    const jobOptions = {
        ...getDefaultJobOptions(),
        ...options,
        jobId: `conversion-${data.jobId}` // Use DB job ID for deduplication
    };

    const job = await queue.add('convert', data, jobOptions);
    
    logger.info('Conversion job added to queue', {
        bullmqJobId: job.id,
        dbJobId: data.jobId,
        userId: data.userId
    });

    return job;
}

/**
 * Get queue statistics
 * @returns {Promise<Object>} Queue statistics
 */
async function getQueueStats() {
    const queue = getAffiliateQueue();
    
    const [waiting, active, completed, failed, delayed] = await Promise.all([
        queue.getWaitingCount(),
        queue.getActiveCount(),
        queue.getCompletedCount(),
        queue.getFailedCount(),
        queue.getDelayedCount()
    ]);

    return {
        waiting,
        active,
        completed,
        failed,
        delayed,
        total: waiting + active + delayed,
        isPaused: await queue.isPaused()
    };
}

/**
 * Pause the queue
 * @returns {Promise<void>}
 */
async function pauseQueue() {
    const queue = getAffiliateQueue();
    await queue.pause();
    logger.info('Affiliate queue paused');
}

/**
 * Resume the queue
 * @returns {Promise<void>}
 */
async function resumeQueue() {
    const queue = getAffiliateQueue();
    await queue.resume();
    logger.info('Affiliate queue resumed');
}

/**
 * Get a job by ID
 * @param {string} jobId - BullMQ job ID
 * @returns {Promise<Object|null>} Job instance or null
 */
async function getJob(jobId) {
    const queue = getAffiliateQueue();
    return queue.getJob(jobId);
}

/**
 * Retry a failed job
 * @param {string} jobId - BullMQ job ID
 * @returns {Promise<boolean>} True if retry was successful
 */
async function retryJob(jobId) {
    const queue = getAffiliateQueue();
    const job = await queue.getJob(jobId);
    
    if (!job) {
        logger.warn('Job not found for retry', { jobId });
        return false;
    }

    const state = await job.getState();
    if (state !== 'failed') {
        logger.warn('Cannot retry job - not in failed state', { jobId, state });
        return false;
    }

    await job.retry();
    logger.info('Job retried', { jobId });
    return true;
}

/**
 * Close the queue gracefully
 * @returns {Promise<void>}
 */
async function closeQueue() {
    if (affiliateQueue) {
        await affiliateQueue.close();
        affiliateQueue = null;
        logger.info('Affiliate queue closed');
    }
}

/**
 * Get jobs by state
 * @param {string} state - Job state (waiting, active, completed, failed, delayed)
 * @param {number} [start=0] - Start index
 * @param {number} [end=20] - End index
 * @returns {Promise<Array>} Array of jobs
 */
async function getJobsByState(state, start = 0, end = 20) {
    const queue = getAffiliateQueue();

    switch (state) {
        case 'waiting':
            return queue.getWaiting(start, end);
        case 'active':
            return queue.getActive(start, end);
        case 'completed':
            return queue.getCompleted(start, end);
        case 'failed':
            return queue.getFailed(start, end);
        case 'delayed':
            return queue.getDelayed(start, end);
        default:
            return [];
    }
}

/**
 * Clean jobs from the queue
 * @param {number} [grace=3600000] - Grace period in ms (default 1 hour)
 * @param {string} [type='completed'] - Type of jobs to clean (completed, failed)
 * @returns {Promise<number>} Number of jobs cleaned
 */
async function cleanQueue(grace = 3600000, type = 'completed') {
    const queue = getAffiliateQueue();

    let cleaned = 0;
    if (type === 'completed' || type === 'all') {
        const completedCleaned = await queue.clean(grace, 1000, 'completed');
        cleaned += completedCleaned.length;
    }
    if (type === 'failed' || type === 'all') {
        const failedCleaned = await queue.clean(grace, 1000, 'failed');
        cleaned += failedCleaned.length;
    }

    logger.info('Queue cleaned', { grace, type, cleaned });
    return cleaned;
}

module.exports = {
    QUEUE_NAME,
    getAffiliateQueue,
    addConversionJob,
    getQueueStats,
    pauseQueue,
    resumeQueue,
    getJob,
    retryJob,
    closeQueue,
    getJobsByState,
    cleanQueue,
    getDefaultJobOptions
};

