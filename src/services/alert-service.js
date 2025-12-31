/**
 * Alert Service
 * 
 * Sends admin alerts for critical events with cooldown to prevent spam.
 */

const { Telegram } = require('telegraf');
const config = require('../config');
const logger = require('../utils/logger');

// Telegram client for sending alerts
let telegramClient = null;

// Cooldown tracking (alert type -> last sent timestamp)
const cooldowns = new Map();

// Default cooldown periods (in milliseconds)
const COOLDOWN_PERIODS = {
    circuitOpen: 5 * 60 * 1000,      // 5 minutes
    queueBacklog: 10 * 60 * 1000,    // 10 minutes
    highFailureRate: 5 * 60 * 1000,  // 5 minutes
    cookieExpired: 60 * 60 * 1000,   // 1 hour
    workerDown: 5 * 60 * 1000,       // 5 minutes
    default: 5 * 60 * 1000           // 5 minutes
};

/**
 * Get Telegram client for sending alerts
 * @returns {Telegram|null}
 */
function getTelegramClient() {
    if (!telegramClient && config.bot.token) {
        telegramClient = new Telegram(config.bot.token);
    }
    return telegramClient;
}

/**
 * Check if alert is on cooldown
 * @param {string} alertType - Type of alert
 * @returns {boolean} True if on cooldown
 */
function isOnCooldown(alertType) {
    const lastSent = cooldowns.get(alertType);
    if (!lastSent) return false;
    
    const cooldownPeriod = COOLDOWN_PERIODS[alertType] || COOLDOWN_PERIODS.default;
    return Date.now() - lastSent < cooldownPeriod;
}

/**
 * Set cooldown for alert type
 * @param {string} alertType - Type of alert
 */
function setCooldown(alertType) {
    cooldowns.set(alertType, Date.now());
}

/**
 * Send alert to admin
 * @param {string} alertType - Type of alert
 * @param {string} message - Alert message
 * @param {Object} [data] - Additional data
 * @returns {Promise<boolean>} True if sent
 */
async function sendAlert(alertType, message, data = {}) {
    const adminChatId = config.admin.alertTelegramId;
    
    if (!adminChatId) {
        logger.warn('Admin alert Telegram ID not configured');
        return false;
    }
    
    if (isOnCooldown(alertType)) {
        logger.debug('Alert on cooldown', { alertType });
        return false;
    }
    
    const telegram = getTelegramClient();
    if (!telegram) {
        logger.warn('Cannot send alert: no Telegram client');
        return false;
    }
    
    try {
        const fullMessage = `🚨 *ALERT: ${alertType}*\n\n${message}\n\n_Time: ${new Date().toISOString()}_`;
        
        await telegram.sendMessage(adminChatId, fullMessage, {
            parse_mode: 'Markdown'
        });
        
        setCooldown(alertType);
        logger.info('Admin alert sent', { alertType });
        return true;
    } catch (err) {
        logger.error('Failed to send admin alert', { alertType, error: err.message });
        return false;
    }
}

/**
 * Alert: Circuit breaker opened
 * @param {string} circuitName - Name of the circuit
 * @param {number} failures - Number of failures
 */
async function alertCircuitOpen(circuitName, failures) {
    const message = `Circuit breaker *${circuitName}* has OPENED!\n\n` +
        `⚠️ Failures: ${failures}\n` +
        `🔒 All requests will be rejected until recovery.\n\n` +
        `Action: Check Shopee API status and browser pool health.`;
    
    await sendAlert('circuitOpen', message, { circuitName, failures });
}

/**
 * Alert: Queue backlog too high
 * @param {number} waiting - Number of waiting jobs
 * @param {number} threshold - Threshold that was exceeded
 */
async function alertQueueBacklog(waiting, threshold) {
    const message = `Queue backlog is HIGH!\n\n` +
        `📊 Waiting jobs: ${waiting}\n` +
        `⚠️ Threshold: ${threshold}\n\n` +
        `Action: Consider scaling workers or checking for issues.`;
    
    await sendAlert('queueBacklog', message, { waiting, threshold });
}

/**
 * Alert: High failure rate
 * @param {number} rate - Failure rate percentage
 * @param {number} total - Total jobs
 * @param {number} failed - Failed jobs
 */
async function alertHighFailureRate(rate, total, failed) {
    const message = `High failure rate detected!\n\n` +
        `📊 Failure rate: ${rate.toFixed(1)}%\n` +
        `❌ Failed: ${failed}/${total} jobs\n\n` +
        `Action: Check logs for error patterns.`;
    
    await sendAlert('highFailureRate', message, { rate, total, failed });
}

/**
 * Alert: Cookies expired or invalid
 * @param {string} [reason] - Reason for expiration
 */
async function alertCookieExpired(reason = 'Authentication failed') {
    const message = `Shopee cookies may be expired!\n\n` +
        `⚠️ Reason: ${reason}\n\n` +
        `Action: Re-login to Shopee and update .cookies.json`;
    
    await sendAlert('cookieExpired', message, { reason });
}

/**
 * Alert: Worker down
 * @param {string} workerId - Worker identifier
 * @param {string} [reason] - Reason for shutdown
 */
async function alertWorkerDown(workerId, reason = 'Unknown') {
    const message = `Worker is DOWN!\n\n` +
        `🔧 Worker: ${workerId}\n` +
        `⚠️ Reason: ${reason}\n\n` +
        `Action: Check worker logs and restart if needed.`;
    
    await sendAlert('workerDown', message, { workerId, reason });
}

/**
 * Clear cooldown for testing
 * @param {string} [alertType] - Specific type or all if not provided
 */
function clearCooldown(alertType) {
    if (alertType) {
        cooldowns.delete(alertType);
    } else {
        cooldowns.clear();
    }
}

module.exports = {
    sendAlert,
    alertCircuitOpen,
    alertQueueBacklog,
    alertHighFailureRate,
    alertCookieExpired,
    alertWorkerDown,
    clearCooldown,
    isOnCooldown
};

