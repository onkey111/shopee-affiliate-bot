/**
 * Redis Connection Module for BullMQ
 * 
 * Provides singleton Redis connection management for the queue system.
 * Uses IORedis which is required by BullMQ.
 */

const Redis = require('ioredis');
const config = require('../config');
const logger = require('../utils/logger');

// Singleton connection instance
let redisConnection = null;

/**
 * Create a new Redis connection with the configured options
 * @returns {Redis} New Redis connection instance
 */
function createRedisConnection() {
    const options = {
        host: config.redis.host,
        port: config.redis.port,
        maxRetriesPerRequest: config.redis.maxRetriesPerRequest,
        enableReadyCheck: true,
        retryStrategy: (times) => {
            if (times > 10) {
                logger.error('Redis connection failed after 10 retries');
                return null; // Stop retrying
            }
            const delay = Math.min(times * 200, 2000);
            logger.warn('Redis connection retry', { attempt: times, delay });
            return delay;
        }
    };

    // Only add password if it's set
    if (config.redis.password) {
        options.password = config.redis.password;
    }

    const connection = new Redis(options);

    connection.on('connect', () => {
        logger.info('Redis connected', { host: config.redis.host, port: config.redis.port });
    });

    connection.on('ready', () => {
        logger.info('Redis ready to accept commands');
    });

    connection.on('error', (err) => {
        logger.error('Redis connection error', { error: err.message });
    });

    connection.on('close', () => {
        logger.warn('Redis connection closed');
    });

    connection.on('reconnecting', () => {
        logger.info('Redis reconnecting...');
    });

    return connection;
}

/**
 * Get the singleton Redis connection instance
 * Creates a new connection if one doesn't exist
 * @returns {Redis} Redis connection instance
 */
function getRedisConnection() {
    if (!redisConnection) {
        redisConnection = createRedisConnection();
    }
    return redisConnection;
}

/**
 * Close the Redis connection gracefully
 * Should be called during application shutdown
 * @returns {Promise<void>}
 */
async function closeRedisConnection() {
    if (redisConnection) {
        try {
            await redisConnection.quit();
            logger.info('Redis connection closed gracefully');
        } catch (err) {
            logger.error('Error closing Redis connection', { error: err.message });
            // Force disconnect if quit fails
            redisConnection.disconnect();
        } finally {
            redisConnection = null;
        }
    }
}

/**
 * Check if Redis connection is ready
 * @returns {boolean} True if connected and ready
 */
function isRedisReady() {
    return redisConnection && redisConnection.status === 'ready';
}

/**
 * Get Redis connection status
 * @returns {string} Connection status
 */
function getRedisStatus() {
    if (!redisConnection) {
        return 'disconnected';
    }
    return redisConnection.status;
}

/**
 * Ping Redis to check connectivity
 * @returns {Promise<boolean>} True if ping successful
 */
async function pingRedis() {
    try {
        const connection = getRedisConnection();
        const result = await connection.ping();
        return result === 'PONG';
    } catch (err) {
        logger.error('Redis ping failed', { error: err.message });
        return false;
    }
}

module.exports = {
    createRedisConnection,
    getRedisConnection,
    closeRedisConnection,
    isRedisReady,
    getRedisStatus,
    pingRedis
};

