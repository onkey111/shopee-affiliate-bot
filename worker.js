/**
 * Worker Entry Point
 *
 * Standalone process for processing affiliate conversion jobs.
 * Run with: npm run start:worker
 */

require('dotenv').config();

const { initPool, drainPool } = require('./src/services/browser-pool');
const { startWorker, stopWorker } = require('./src/workers');
const { closeRedisConnection } = require('./src/queues');
const logger = require('./src/utils/logger');

let isShuttingDown = false;

async function main() {
    logger.info('Starting affiliate worker process...');

    // Verify BOT_TOKEN is available for notifications
    if (!process.env.BOT_TOKEN) {
        logger.error('BOT_TOKEN environment variable is not set! Notifications will not work.', {
            cwd: process.cwd(),
            envFile: require('path').resolve('.env')
        });
    } else {
        logger.info('BOT_TOKEN configured for notifications', {
            tokenPrefix: process.env.BOT_TOKEN.substring(0, 10) + '...'
        });
    }

    // Initialize browser pool
    logger.info('Initializing browser pool...');
    initPool();

    // Wait for pool to warm up (min browsers created)
    await new Promise(resolve => setTimeout(resolve, 2000));
    logger.info('Browser pool initialized');

    // Start the worker (loads cookies internally)
    startWorker();
    logger.info('Worker started and listening for jobs');

    // Keep process alive
    logger.info('Worker process running. Press Ctrl+C to stop.');
}

/**
 * Graceful shutdown handler
 * @param {string} signal - Signal received
 */
async function shutdown(signal) {
    if (isShuttingDown) {
        logger.warn('Shutdown already in progress...');
        return;
    }
    isShuttingDown = true;

    logger.info(`Received ${signal}, initiating graceful shutdown...`);

    try {
        // Stop worker (wait for current jobs to complete)
        logger.info('Stopping worker...');
        await stopWorker(false);
        logger.info('Worker stopped');
    } catch (err) {
        logger.error('Error stopping worker', { error: err.message });
    }

    try {
        // Drain browser pool
        logger.info('Draining browser pool...');
        await drainPool();
        logger.info('Browser pool drained');
    } catch (err) {
        logger.error('Error draining browser pool', { error: err.message });
    }

    try {
        // Close Redis connection
        logger.info('Closing Redis connection...');
        await closeRedisConnection();
        logger.info('Redis connection closed');
    } catch (err) {
        logger.error('Error closing Redis', { error: err.message });
    }

    logger.info('Graceful shutdown complete');
    process.exit(0);
}

// Register shutdown handlers
process.once('SIGINT', () => shutdown('SIGINT'));
process.once('SIGTERM', () => shutdown('SIGTERM'));

// Handle uncaught errors
process.on('uncaughtException', (err) => {
    logger.error('Uncaught exception', { error: err.message, stack: err.stack });
    shutdown('uncaughtException');
});

process.on('unhandledRejection', (reason, promise) => {
    logger.error('Unhandled rejection', { reason: reason?.message || reason });
});

// Start the worker
main().catch(err => {
    logger.error('Worker startup failed', { error: err.message });
    process.exit(1);
});

