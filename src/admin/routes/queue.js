/**
 * Queue Admin Routes
 *
 * API endpoints for queue management and monitoring.
 */

const express = require('express');
const router = express.Router();
const { getAffiliateQueue, pauseQueue, resumeQueue, cleanQueue } = require('../../queues/affiliate-queue');
const { getDeadLetterJobs, retryDeadLetterJob, purgeDeadLetterJobs, getDeadLetterCount } = require('../../queues/dead-letter-handler');
const { getQueueMetrics, checkThresholds } = require('../../services/queue-metrics');
const { getCircuitBreakerStatus, resetCircuitBreaker } = require('../../services/affiliate-service');
const jobRepo = require('../../db/repositories/job-repository');
const logger = require('../../utils/logger');

/**
 * GET /admin/queue - Queue dashboard
 */
router.get('/', async (req, res) => {
    try {
        const metrics = await getQueueMetrics();
        const deadLetterCount = await getDeadLetterCount();
        const recentJobs = await jobRepo.getRecentJobs(20);
        
        res.render('admin/queue', {
            metrics,
            deadLetterCount,
            recentJobs
        });
    } catch (err) {
        logger.error('Queue dashboard error', { error: err.message });
        req.flash('error', 'Loi tai du lieu queue');
        res.render('admin/queue', { metrics: null, deadLetterCount: 0, recentJobs: [] });
    }
});

/**
 * GET /admin/queue/metrics - Get queue metrics (JSON)
 */
router.get('/metrics', async (req, res) => {
    try {
        const metrics = await getQueueMetrics();
        res.json({ success: true, data: metrics });
    } catch (err) {
        logger.error('Get metrics error', { error: err.message });
        res.status(500).json({ success: false, error: err.message });
    }
});

/**
 * GET /admin/queue/jobs - Get recent jobs (JSON)
 */
router.get('/jobs', async (req, res) => {
    try {
        const { limit = 50, offset = 0, status } = req.query;
        const jobs = await jobRepo.getRecentJobs(
            parseInt(limit),
            parseInt(offset),
            status || null
        );
        res.json({ success: true, data: jobs });
    } catch (err) {
        logger.error('Get jobs error', { error: err.message });
        res.status(500).json({ success: false, error: err.message });
    }
});

/**
 * POST /admin/queue/pause - Pause the queue
 */
router.post('/pause', async (req, res) => {
    try {
        await pauseQueue();
        logger.info('Queue paused by admin');
        res.json({ success: true, message: 'Queue paused' });
    } catch (err) {
        logger.error('Pause queue error', { error: err.message });
        res.status(500).json({ success: false, error: err.message });
    }
});

/**
 * POST /admin/queue/resume - Resume the queue
 */
router.post('/resume', async (req, res) => {
    try {
        await resumeQueue();
        logger.info('Queue resumed by admin');
        res.json({ success: true, message: 'Queue resumed' });
    } catch (err) {
        logger.error('Resume queue error', { error: err.message });
        res.status(500).json({ success: false, error: err.message });
    }
});

/**
 * POST /admin/queue/clean - Clean completed/failed jobs
 */
router.post('/clean', async (req, res) => {
    try {
        const { grace = 3600000, type = 'completed' } = req.body;
        await cleanQueue(parseInt(grace), type);
        logger.info('Queue cleaned by admin', { grace, type });
        res.json({ success: true, message: `Cleaned ${type} jobs` });
    } catch (err) {
        logger.error('Clean queue error', { error: err.message });
        res.status(500).json({ success: false, error: err.message });
    }
});

/**
 * GET /admin/queue/dead-letter - Get dead letter jobs
 */
router.get('/dead-letter', async (req, res) => {
    try {
        const { limit = 50, offset = 0 } = req.query;
        const jobs = await getDeadLetterJobs(parseInt(limit), parseInt(offset));
        const count = await getDeadLetterCount();
        res.json({ success: true, data: { jobs, count } });
    } catch (err) {
        logger.error('Get dead letter jobs error', { error: err.message });
        res.status(500).json({ success: false, error: err.message });
    }
});

/**
 * POST /admin/queue/dead-letter/:id/retry - Retry a dead letter job
 */
router.post('/dead-letter/:id/retry', async (req, res) => {
    try {
        const { id } = req.params;
        const result = await retryDeadLetterJob(parseInt(id));
        
        if (result.success) {
            logger.info('Dead letter job retried by admin', { jobId: id });
            res.json({ success: true, message: 'Job queued for retry', newJobId: result.newJobId });
        } else {
            res.status(400).json({ success: false, error: result.error });
        }
    } catch (err) {
        logger.error('Retry dead letter job error', { error: err.message });
        res.status(500).json({ success: false, error: err.message });
    }
});

/**
 * POST /admin/queue/dead-letter/purge - Purge old dead letter jobs
 */
router.post('/dead-letter/purge', async (req, res) => {
    try {
        const { days = 7 } = req.body;
        const result = await purgeDeadLetterJobs(parseInt(days));
        
        logger.info('Dead letter jobs purged by admin', { days, count: result.count });
        res.json({ success: true, message: `Purged ${result.count} jobs`, count: result.count });
    } catch (err) {
        logger.error('Purge dead letter jobs error', { error: err.message });
        res.status(500).json({ success: false, error: err.message });
    }
});

/**
 * POST /admin/queue/check-thresholds - Manually check thresholds
 */
router.post('/check-thresholds', async (req, res) => {
    try {
        await checkThresholds();
        res.json({ success: true, message: 'Thresholds checked' });
    } catch (err) {
        logger.error('Check thresholds error', { error: err.message });
        res.status(500).json({ success: false, error: err.message });
    }
});

/**
 * GET /admin/queue/circuit-breaker - Get circuit breaker status
 */
router.get('/circuit-breaker', async (req, res) => {
    try {
        const status = getCircuitBreakerStatus();
        res.json({ success: true, data: status });
    } catch (err) {
        logger.error('Get circuit breaker status error', { error: err.message });
        res.status(500).json({ success: false, error: err.message });
    }
});

/**
 * POST /admin/queue/circuit-breaker/reset - Reset circuit breaker
 */
router.post('/circuit-breaker/reset', async (req, res) => {
    try {
        resetCircuitBreaker();
        logger.info('Circuit breaker reset by admin');
        res.json({ success: true, message: 'Circuit breaker reset' });
    } catch (err) {
        logger.error('Reset circuit breaker error', { error: err.message });
        res.status(500).json({ success: false, error: err.message });
    }
});

module.exports = router;

