/**
 * Notification Service
 *
 * Sends async Telegram notifications for job completion/failure.
 * Used by worker process to notify users of results.
 *
 * Can work in two modes:
 * 1. With bot instance (main process) - uses existing bot
 * 2. Without bot instance (worker process) - creates standalone Telegram API client
 */

const { Markup, Telegram } = require('telegraf');
const logger = require('../utils/logger');

// Bot instance (set by main process)
let botInstance = null;

// Standalone Telegram API client (for worker process)
let telegramClient = null;

// Retry configuration
const RETRY_CONFIG = {
    maxRetries: 3,
    initialDelay: 1000,  // 1 second
    maxDelay: 10000,     // 10 seconds
    backoffMultiplier: 2
};

/**
 * Sleep for a given number of milliseconds
 * @param {number} ms - Milliseconds to sleep
 * @returns {Promise<void>}
 */
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Retry a function with exponential backoff
 * @param {Function} fn - Async function to retry
 * @param {Object} options - Retry options
 * @returns {Promise<any>} Result of the function
 */
async function retryWithBackoff(fn, options = {}) {
    const { maxRetries, initialDelay, maxDelay, backoffMultiplier } = { ...RETRY_CONFIG, ...options };
    let lastError;
    let delay = initialDelay;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            return await fn();
        } catch (err) {
            lastError = err;
            const isRetryable = err.code === 'ETIMEDOUT' ||
                               err.code === 'ECONNRESET' ||
                               err.code === 'ENOTFOUND' ||
                               err.message?.includes('ETIMEDOUT') ||
                               err.message?.includes('ECONNRESET') ||
                               err.message?.includes('network');

            if (!isRetryable || attempt === maxRetries) {
                throw err;
            }

            logger.warn('Retrying after network error', {
                attempt,
                maxRetries,
                delay,
                error: err.message
            });

            await sleep(delay);
            delay = Math.min(delay * backoffMultiplier, maxDelay);
        }
    }

    throw lastError;
}

/**
 * Get bot token from environment (read dynamically to ensure dotenv is loaded)
 * @returns {string|undefined}
 */
function getBotToken() {
    // Read directly from process.env to ensure we get the latest value
    // This handles cases where dotenv might be loaded after config module
    return process.env.BOT_TOKEN;
}

/**
 * Get Telegram API client (bot instance or standalone)
 * @returns {Telegram|null}
 */
function getTelegramClient() {
    logger.info('getTelegramClient called', {
        hasBotInstance: !!botInstance,
        hasTelegramClient: !!telegramClient
    });

    if (botInstance) {
        logger.info('Using bot instance for notifications');
        return botInstance.telegram;
    }

    // Create standalone client for worker process
    if (!telegramClient) {
        const token = getBotToken();
        logger.info('Creating standalone Telegram client', {
            hasToken: !!token,
            tokenLength: token ? token.length : 0,
            tokenPrefix: token ? token.substring(0, 10) + '...' : 'N/A'
        });

        if (!token) {
            logger.error('BOT_TOKEN not configured - cannot send notifications!', {
                envKeys: Object.keys(process.env).filter(k => k.includes('BOT') || k.includes('TOKEN')),
                cwd: process.cwd(),
                nodeEnv: process.env.NODE_ENV
            });
            return null;
        }
        telegramClient = new Telegram(token);
        logger.info('Notification service: standalone Telegram client created successfully', {
            tokenPrefix: token.substring(0, 10) + '...'
        });
    } else {
        logger.info('Reusing existing standalone Telegram client');
    }

    return telegramClient;
}

/**
 * Set the bot instance for sending notifications
 * @param {Telegraf} bot - Telegraf bot instance
 */
function setBotInstance(bot) {
    botInstance = bot;
    logger.info('Notification service: bot instance set');
}

/**
 * Get the bot instance
 * @returns {Telegraf|null}
 */
function getBotInstance() {
    return botInstance;
}

/**
 * Notify user of successful job completion
 * @param {Object} job - Job data from queue
 * @param {string} affiliateUrl - Generated affiliate URL
 * @param {number} [remaining] - Remaining links for today (optional)
 */
async function notifyJobCompleted(job, affiliateUrl, remaining = null) {
    logger.info('notifyJobCompleted called', {
        job: JSON.stringify(job),
        affiliateUrl: affiliateUrl ? affiliateUrl.substring(0, 50) + '...' : 'N/A',
        remaining
    });

    const telegram = getTelegramClient();
    if (!telegram) {
        logger.error('Cannot send notification: no Telegram client available', {
            jobId: job?.jobId,
            telegramChatId: job?.telegramChatId
        });
        return false;
    }

    const { telegramChatId, originalUrl, jobId } = job;

    logger.info('Preparing to send Telegram message', {
        jobId,
        telegramChatId,
        originalUrl: originalUrl ? originalUrl.substring(0, 50) : 'N/A'
    });

    try {
        let message = `✅ *Link da duoc tao thanh cong!*\n\n`;
        message += `📎 Link goc: ${originalUrl.substring(0, 50)}${originalUrl.length > 50 ? '...' : ''}\n\n`;
        message += `🔗 *Link affiliate:*\n${affiliateUrl}\n\n`;
        message += `Các bác copy link và dán vào trình duyệt chính (Chrome, Safari) hoặc mở trực tiếp trong app Shopee để không bị mất cashback hộ em nhé.`;

        if (remaining !== null) {
            message += `\n\n📌 Con lai: ${remaining} luot hom nay`;
        }

        message += `\n\n📝 Sau khi mua hang, nhan nut ben duoi de gui Order ID.`;
        message += `\n\n_Ma yeu cau: #${jobId}_`;

        // Create inline keyboard with Submit Order ID button only (affiliate link sent as plain text)
        const keyboard = Markup.inlineKeyboard([
            [Markup.button.callback('📦 Gui Order ID', 'submit_order')]
        ]);

        logger.info('Calling telegram.sendMessage with retry', {
            chatId: telegramChatId,
            messageLength: message.length
        });

        const result = await retryWithBackoff(async () => {
            return telegram.sendMessage(telegramChatId, message, {
                parse_mode: 'Markdown',
                disable_web_page_preview: true,
                ...keyboard
            });
        });

        logger.info('Job completion notification sent successfully', {
            jobId,
            chatId: telegramChatId,
            messageId: result?.message_id
        });

        return true;
    } catch (err) {
        logger.error('Failed to send completion notification after retries', {
            error: err.message,
            errorCode: err.code,
            errorDescription: err.description,
            stack: err.stack,
            jobId,
            chatId: telegramChatId
        });
        return false;
    }
}

/**
 * Notify user of job failure
 * @param {Object} job - Job data from queue
 * @param {string} errorMessage - Error message
 */
async function notifyJobFailed(job, errorMessage) {
    const telegram = getTelegramClient();
    if (!telegram) {
        logger.warn('Cannot send notification: no Telegram client available');
        return false;
    }

    const { telegramChatId, originalUrl, jobId } = job;

    try {
        let message = `❌ *Khong the tao link affiliate*\n\n`;
        message += `📎 Link goc: ${originalUrl.substring(0, 50)}${originalUrl.length > 50 ? '...' : ''}\n\n`;
        message += `⚠️ Loi: ${errorMessage.substring(0, 100)}\n\n`;
        message += `Vui long thu lai sau hoac lien he ho tro.\n\n`;
        message += `_Ma yeu cau: #${jobId}_`;

        await retryWithBackoff(async () => {
            return telegram.sendMessage(telegramChatId, message, {
                parse_mode: 'Markdown',
                disable_web_page_preview: true
            });
        });

        logger.info('Job failure notification sent', {
            jobId,
            chatId: telegramChatId,
            error: errorMessage.substring(0, 50)
        });

        return true;
    } catch (err) {
        logger.error('Failed to send failure notification after retries', {
            error: err.message,
            jobId,
            chatId: telegramChatId
        });
        return false;
    }
}

/**
 * Notify user of job progress (optional)
 * @param {Object} job - Job data from queue
 * @param {string} message - Progress message
 */
async function notifyJobProgress(job, progressMessage) {
    const telegram = getTelegramClient();
    if (!telegram) {
        logger.warn('Cannot send notification: no Telegram client available');
        return false;
    }

    const { telegramChatId, jobId } = job;

    try {
        const fullMessage = `⏳ *Dang xu ly...*\n\n${progressMessage}\n\n_Ma yeu cau: #${jobId}_`;

        await retryWithBackoff(async () => {
            return telegram.sendMessage(telegramChatId, fullMessage, {
                parse_mode: 'Markdown'
            });
        });

        logger.debug('Job progress notification sent', { jobId, chatId: telegramChatId });
        return true;
    } catch (err) {
        logger.error('Failed to send progress notification after retries', {
            error: err.message,
            jobId,
            chatId: telegramChatId
        });
        return false;
    }
}

/**
 * Create inline keyboard for job status check
 * @param {number} jobId - Database job ID
 * @returns {Object} Telegraf inline keyboard markup
 */
function createStatusCheckKeyboard(jobId) {
    return Markup.inlineKeyboard([
        [Markup.button.callback('🔍 Kiem tra trang thai', `job_status:${jobId}`)]
    ]);
}

module.exports = {
    setBotInstance,
    getBotInstance,
    notifyJobCompleted,
    notifyJobFailed,
    notifyJobProgress,
    createStatusCheckKeyboard
};

