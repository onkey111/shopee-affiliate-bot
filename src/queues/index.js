/**
 * Queue Module Index
 *
 * Central export point for all queue-related components.
 * Re-exports connection utilities and queue definitions.
 */

const {
    createRedisConnection,
    getRedisConnection,
    closeRedisConnection,
    isRedisReady,
    getRedisStatus,
    pingRedis
} = require('./connection');

const {
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
    getDefaultJobOptions
} = require('./affiliate-queue');

module.exports = {
    // Redis connection management
    createRedisConnection,
    getRedisConnection,
    closeRedisConnection,
    isRedisReady,
    getRedisStatus,
    pingRedis,

    // Affiliate queue
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
    getDefaultJobOptions
};

