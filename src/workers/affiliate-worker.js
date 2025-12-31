/**
 * Affiliate Worker
 *
 * BullMQ worker that processes affiliate link conversion jobs.
 * Uses browser pool for concurrent conversions.
 * Includes circuit breaker protection and metrics tracking.
 */

const { Worker } = require('bullmq');
const { getRedisConnection } = require('../queues/connection');
const { QUEUE_NAME } = require('../queues/affiliate-queue');
const { convertLinkProtected, loadCookies } = require('../services/affiliate-service');
const { notifyJobCompleted, notifyJobFailed } = require('../services/notification-service');
const { recordJobCompletion, recordJobFailure, checkThresholds } = require('../services/queue-metrics');
const jobRepo = require('../db/repositories/job-repository');
const linkRepo = require('../db/repositories/link-repository');
const userRepo = require('../db/repositories/user-repository');
const config = require('../config');
const logger = require('../utils/logger');

// Worker instance
let worker = null;

// Cached cookies (loaded once at startup)
let cachedCookies = null;

/**
 * Process a conversion job
 * @param {Object} job - BullMQ job instance
 * @returns {Promise<Object>} Result with affiliate URL
 */
async function processJob(job) {
    const startTime = Date.now();
    const { jobId: dbJobId, userId, originalUrl, telegramChatId, telegramMessageId } = job.data;

    logger.info('Processing conversion job', {
        bullmqJobId: job.id,
        dbJobId,
        userId,
        originalUrl: originalUrl.substring(0, 50) + '...',
        attempt: job.attemptsMade + 1
    });

    try {
        // Update DB job status to processing
        await jobRepo.markProcessing(dbJobId);
        await jobRepo.incrementAttempts(dbJobId);

        // Use cached cookies
        const cookies = cachedCookies || loadCookies();

        // Convert link using browser pool with circuit breaker protection
        // Note: We disable internal retry since BullMQ handles retries
        const affiliateUrl = await convertLinkProtected(originalUrl, {
            useCircuitBreaker: true,
            useRetry: false  // BullMQ handles retries
        });

        if (!affiliateUrl) {
            throw new Error('Failed to extract affiliate URL from page');
        }

        // Success: Update DB, create link record, increment user stats
        await jobRepo.markCompleted(dbJobId, affiliateUrl);
        await linkRepo.create(userId, originalUrl, affiliateUrl);
        await userRepo.incrementTotalLinks(userId);

        const elapsed = Date.now() - startTime;

        // Record metrics
        recordJobCompletion(elapsed);

        logger.info('Job completed successfully', {
            bullmqJobId: job.id,
            dbJobId,
            affiliateUrl: affiliateUrl.substring(0, 50) + '...',
            elapsed
        });

        // Send success notification to user
        logger.info('About to send notification', {
            dbJobId,
            telegramChatId,
            originalUrl: originalUrl.substring(0, 50) + '...',
            affiliateUrl: affiliateUrl.substring(0, 50) + '...'
        });

        try {
            const notificationSent = await notifyJobCompleted(
                { telegramChatId, originalUrl, jobId: dbJobId },
                affiliateUrl
            );
            logger.info('Notification call completed', {
                dbJobId,
                notificationSent
            });
            if (!notificationSent) {
                logger.warn('Notification was not sent (returned false)', {
                    dbJobId,
                    telegramChatId
                });
            }
        } catch (notifyErr) {
            logger.error('Failed to send completion notification', {
                error: notifyErr.message,
                stack: notifyErr.stack,
                dbJobId,
                telegramChatId
            });
        }

        return {
            success: true,
            affiliateUrl,
            dbJobId,
            elapsed
        };

    } catch (err) {
        const elapsed = Date.now() - startTime;
        logger.error('Job processing failed', {
            bullmqJobId: job.id,
            dbJobId,
            error: err.message,
            attempt: job.attemptsMade + 1,
            maxAttempts: config.queue.maxRetries,
            elapsed
        });

        // Check if max retries reached
        if (job.attemptsMade + 1 >= config.queue.maxRetries) {
            // Record failure metric
            recordJobFailure();

            // Check thresholds (may trigger alerts)
            checkThresholds().catch(e => logger.error('Threshold check failed', { error: e.message }));

            // Mark as failed in DB and move to dead letter
            await jobRepo.markFailed(dbJobId, err.message);
            await jobRepo.moveToDeadLetter(dbJobId);
            logger.warn('Job moved to dead letter queue', { dbJobId });

            // Send failure notification to user
            try {
                const notificationSent = await notifyJobFailed(
                    { telegramChatId, originalUrl, jobId: dbJobId },
                    err.message
                );
                if (!notificationSent) {
                    logger.warn('Failure notification was not sent (returned false)', {
                        dbJobId,
                        telegramChatId
                    });
                }
            } catch (notifyErr) {
                logger.error('Failed to send failure notification', {
                    error: notifyErr.message,
                    dbJobId,
                    telegramChatId
                });
            }
        }

        // Throw error for BullMQ retry handling
        throw err;
    }
}

/**
 * Create the worker instance
 * @returns {Worker} BullMQ Worker instance
 */
function createWorker() {
    if (worker) {
        logger.warn('Worker already exists');
        return worker;
    }

    const connection = getRedisConnection();

    worker = new Worker(QUEUE_NAME, processJob, {
        connection,
        concurrency: config.queue.concurrency,
        lockDuration: 60000,        // 60 seconds lock
        stalledInterval: 30000,     // Check for stalled jobs every 30s
        maxStalledCount: 2          // Max stalled count before failing
    });

    // Event handlers
    worker.on('completed', (job, result) => {
        logger.info('Worker: job completed', {
            jobId: job.id,
            dbJobId: result?.dbJobId,
            elapsed: result?.elapsed
        });
    });

    worker.on('failed', (job, err) => {
        logger.error('Worker: job failed', {
            jobId: job?.id,
            error: err.message,
            attemptsMade: job?.attemptsMade,
            willRetry: job?.attemptsMade < config.queue.maxRetries
        });
    });

    worker.on('error', (err) => {
        logger.error('Worker error', { error: err.message });
    });

    worker.on('stalled', (jobId) => {
        logger.warn('Worker: job stalled', { jobId });
    });

    logger.info('Affiliate worker created', {
        queue: QUEUE_NAME,
        concurrency: config.queue.concurrency
    });

    return worker;
}

/**
 * Start the worker
 * @returns {Worker} Worker instance
 */
function startWorker() {
    // Load cookies once at startup
    cachedCookies = loadCookies();
    logger.info('Cookies loaded for worker', { count: cachedCookies?.length || 0 });

    const w = createWorker();
    logger.info('Affiliate worker started');
    return w;
}

/**
 * Stop the worker gracefully
 * @param {boolean} [force=false] - Force close without waiting
 * @returns {Promise<void>}
 */
async function stopWorker(force = false) {
    if (!worker) {
        return;
    }

    logger.info('Stopping affiliate worker...', { force });

    try {
        if (force) {
            await worker.close(true);
        } else {
            // Wait for current jobs to complete
            await worker.close();
        }
        worker = null;
        logger.info('Affiliate worker stopped');
    } catch (err) {
        logger.error('Error stopping worker', { error: err.message });
    }
}

/**
 * Check if worker is running
 * @returns {boolean}
 */
function isWorkerRunning() {
    return worker !== null && !worker.closing;
}

/**
 * Get worker instance
 * @returns {Worker|null}
 */
function getWorker() {
    return worker;
}

module.exports = {
    createWorker,
    startWorker,
    stopWorker,
    isWorkerRunning,
    getWorker,
    processJob
};

