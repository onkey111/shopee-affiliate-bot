/**
 * Retry Utility
 * 
 * Provides retry functionality with exponential backoff and jitter.
 */

const logger = require('./logger');

// Default retry options
const DEFAULT_OPTIONS = {
    maxRetries: 3,
    initialDelay: 1000,
    multiplier: 2,
    maxDelay: 30000,
    jitter: true,
    retryableErrors: ['ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND', 'ECONNREFUSED', 'EAI_AGAIN']
};

/**
 * Calculate backoff delay with optional jitter
 * @param {number} attempt - Current attempt number (0-based)
 * @param {number} initialDelay - Initial delay in ms
 * @param {number} multiplier - Multiplier for exponential backoff
 * @param {number} maxDelay - Maximum delay in ms
 * @param {boolean} [addJitter=true] - Whether to add random jitter
 * @returns {number} Delay in milliseconds
 */
function calculateBackoff(attempt, initialDelay, multiplier, maxDelay, addJitter = true) {
    // Exponential backoff: initialDelay * multiplier^attempt
    let delay = initialDelay * Math.pow(multiplier, attempt);
    
    // Cap at max delay
    delay = Math.min(delay, maxDelay);
    
    // Add jitter (±25% randomization)
    if (addJitter) {
        const jitterRange = delay * 0.25;
        const jitter = (Math.random() * 2 - 1) * jitterRange;
        delay = Math.max(0, delay + jitter);
    }
    
    return Math.floor(delay);
}

/**
 * Check if an error is retryable
 * @param {Error} error - The error to check
 * @param {string[]} [retryableCodes] - List of retryable error codes
 * @returns {boolean} True if error is retryable
 */
function isRetryableError(error, retryableCodes = DEFAULT_OPTIONS.retryableErrors) {
    // Check error code
    if (error.code && retryableCodes.includes(error.code)) {
        return true;
    }
    
    // Check for network-related errors
    const message = error.message?.toLowerCase() || '';
    const retryableMessages = [
        'timeout',
        'network',
        'connection',
        'socket',
        'econnreset',
        'etimedout',
        'temporarily unavailable',
        'service unavailable',
        'too many requests',
        'rate limit'
    ];
    
    if (retryableMessages.some(msg => message.includes(msg))) {
        return true;
    }
    
    // Check HTTP status codes (if available)
    const status = error.status || error.statusCode || error.response?.status;
    if (status) {
        // Retry on 429 (rate limit), 502, 503, 504 (server errors)
        if ([429, 502, 503, 504].includes(status)) {
            return true;
        }
    }
    
    return false;
}

/**
 * Sleep for a specified duration
 * @param {number} ms - Milliseconds to sleep
 * @returns {Promise<void>}
 */
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Retry an async function with exponential backoff
 * @param {Function} asyncFn - Async function to retry
 * @param {Object} [options] - Retry options
 * @param {number} [options.maxRetries=3] - Maximum number of retries
 * @param {number} [options.initialDelay=1000] - Initial delay in ms
 * @param {number} [options.multiplier=2] - Backoff multiplier
 * @param {number} [options.maxDelay=30000] - Maximum delay in ms
 * @param {boolean} [options.jitter=true] - Add random jitter
 * @param {Function} [options.shouldRetry] - Custom function to determine if should retry
 * @param {Function} [options.onRetry] - Callback on each retry
 * @returns {Promise<any>} Result of the function
 */
async function retryWithBackoff(asyncFn, options = {}) {
    const opts = { ...DEFAULT_OPTIONS, ...options };
    let lastError;
    
    for (let attempt = 0; attempt <= opts.maxRetries; attempt++) {
        try {
            return await asyncFn();
        } catch (err) {
            lastError = err;
            
            // Check if we should retry
            const shouldRetry = opts.shouldRetry 
                ? opts.shouldRetry(err, attempt)
                : isRetryableError(err, opts.retryableErrors);
            
            if (attempt >= opts.maxRetries || !shouldRetry) {
                logger.error('Retry exhausted', {
                    attempt: attempt + 1,
                    maxRetries: opts.maxRetries + 1,
                    error: err.message
                });
                throw err;
            }
            
            // Calculate delay
            const delay = calculateBackoff(
                attempt,
                opts.initialDelay,
                opts.multiplier,
                opts.maxDelay,
                opts.jitter
            );
            
            logger.warn('Retrying after error', {
                attempt: attempt + 1,
                maxRetries: opts.maxRetries + 1,
                delay,
                error: err.message
            });
            
            // Call onRetry callback if provided
            if (opts.onRetry) {
                opts.onRetry(err, attempt, delay);
            }
            
            await sleep(delay);
        }
    }
    
    throw lastError;
}

module.exports = {
    retryWithBackoff,
    isRetryableError,
    calculateBackoff,
    sleep,
    DEFAULT_OPTIONS
};

