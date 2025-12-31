/**
 * Queue Metrics Service
 * 
 * Collects and provides metrics for the affiliate queue.
 */

const { getAffiliateQueue } = require('../queues/affiliate-queue');
const jobRepo = require('../db/repositories/job-repository');
const alertService = require('./alert-service');
const logger = require('../utils/logger');

// Metrics storage
const metrics = {
    processed: 0,
    failed: 0,
    completed: 0,
    avgProcessingTime: 0,
    processingTimes: [],
    lastUpdated: null
};

// Thresholds for alerts
const THRESHOLDS = {
    queueBacklog: 100,
    failureRate: 30,  // percentage
    avgProcessingTime: 30000  // 30 seconds
};

/**
 * Get queue metrics
 * @returns {Promise<Object>} Queue metrics
 */
async function getQueueMetrics() {
    try {
        const queue = getAffiliateQueue();
        
        // Get queue counts
        const [waiting, active, completed, failed, delayed] = await Promise.all([
            queue.getWaitingCount(),
            queue.getActiveCount(),
            queue.getCompletedCount(),
            queue.getFailedCount(),
            queue.getDelayedCount()
        ]);
        
        // Get DB stats
        const dbStats = await jobRepo.getStats();
        const failureRate = await jobRepo.getFailureRate(1);
        
        return {
            queue: {
                waiting,
                active,
                completed,
                failed,
                delayed,
                total: waiting + active + completed + failed + delayed
            },
            database: {
                pending: parseInt(dbStats.pending) || 0,
                processing: parseInt(dbStats.processing) || 0,
                completed: parseInt(dbStats.completed) || 0,
                failed: parseInt(dbStats.failed) || 0,
                total: parseInt(dbStats.total) || 0
            },
            performance: {
                processed: metrics.processed,
                avgProcessingTime: metrics.avgProcessingTime,
                failureRate: failureRate.rate
            },
            lastUpdated: new Date().toISOString()
        };
    } catch (err) {
        logger.error('Failed to get queue metrics', { error: err.message });
        return null;
    }
}

/**
 * Record job completion
 * @param {number} processingTime - Time in ms
 */
function recordJobCompletion(processingTime) {
    metrics.processed++;
    metrics.completed++;
    
    // Keep last 100 processing times for average
    metrics.processingTimes.push(processingTime);
    if (metrics.processingTimes.length > 100) {
        metrics.processingTimes.shift();
    }
    
    // Calculate average
    const sum = metrics.processingTimes.reduce((a, b) => a + b, 0);
    metrics.avgProcessingTime = Math.round(sum / metrics.processingTimes.length);
    metrics.lastUpdated = new Date();
}

/**
 * Record job failure
 */
function recordJobFailure() {
    metrics.processed++;
    metrics.failed++;
    metrics.lastUpdated = new Date();
}

/**
 * Check thresholds and send alerts if needed
 * @returns {Promise<void>}
 */
async function checkThresholds() {
    try {
        const queueMetrics = await getQueueMetrics();
        if (!queueMetrics) return;
        
        // Check queue backlog
        if (queueMetrics.queue.waiting > THRESHOLDS.queueBacklog) {
            await alertService.alertQueueBacklog(
                queueMetrics.queue.waiting,
                THRESHOLDS.queueBacklog
            );
        }
        
        // Check failure rate
        if (queueMetrics.performance.failureRate > THRESHOLDS.failureRate) {
            const failureData = await jobRepo.getFailureRate(1);
            await alertService.alertHighFailureRate(
                failureData.rate,
                failureData.total,
                failureData.failed
            );
        }
        
        // Check average processing time
        if (metrics.avgProcessingTime > THRESHOLDS.avgProcessingTime) {
            logger.warn('High average processing time', {
                avgTime: metrics.avgProcessingTime,
                threshold: THRESHOLDS.avgProcessingTime
            });
        }
    } catch (err) {
        logger.error('Failed to check thresholds', { error: err.message });
    }
}

/**
 * Reset metrics (for testing)
 */
function resetMetrics() {
    metrics.processed = 0;
    metrics.failed = 0;
    metrics.completed = 0;
    metrics.avgProcessingTime = 0;
    metrics.processingTimes = [];
    metrics.lastUpdated = null;
}

/**
 * Get raw metrics object
 * @returns {Object} Raw metrics
 */
function getRawMetrics() {
    return { ...metrics };
}

module.exports = {
    getQueueMetrics,
    recordJobCompletion,
    recordJobFailure,
    checkThresholds,
    resetMetrics,
    getRawMetrics,
    THRESHOLDS
};

