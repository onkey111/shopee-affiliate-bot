/**
 * Browser Pool Service
 * 
 * Manages a pool of Puppeteer browser instances using generic-pool.
 * Provides acquire/release pattern for concurrent browser usage.
 */

const genericPool = require('generic-pool');
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const config = require('../config');
const logger = require('../utils/logger');

// Apply stealth plugin once
puppeteer.use(StealthPlugin());

// Performance browser args
const browserArgs = [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-dev-shm-usage',
    '--disable-gpu',
    '--disable-extensions',
    '--disable-background-networking',
    '--disable-default-apps',
    '--disable-sync',
    '--disable-translate',
    '--metrics-recording-only',
    '--mute-audio',
    '--no-first-run',
    '--safebrowsing-disable-auto-update',
    '--disable-infobars',
    '--disable-features=TranslateUI',
    '--disable-ipc-flooding-protection'
];

// Singleton pool instance
let browserPool = null;

/**
 * Create a new browser instance
 * @returns {Promise<Browser>} Puppeteer browser instance
 */
async function createBrowser() {
    const browser = await puppeteer.launch({
        headless: true,
        defaultViewport: { width: 1280, height: 720 },
        args: browserArgs
    });
    
    const wsEndpoint = browser.wsEndpoint();
    logger.info('Browser created', { wsEndpoint: wsEndpoint.substring(0, 50) + '...' });
    
    return browser;
}

/**
 * Destroy a browser instance gracefully
 * @param {Browser} browser - Browser instance to destroy
 */
async function destroyBrowserInstance(browser) {
    try {
        if (browser && browser.isConnected()) {
            // Close all pages first
            const pages = await browser.pages();
            await Promise.all(pages.map(page => page.close().catch(() => {})));
            await browser.close();
            logger.info('Browser destroyed gracefully');
        }
    } catch (err) {
        logger.error('Error destroying browser', { error: err.message });
        // Force kill if graceful close fails
        try {
            const process = browser.process();
            if (process) {
                process.kill('SIGKILL');
            }
        } catch (e) {}
    }
}

/**
 * Validate browser instance is still usable
 * @param {Browser} browser - Browser instance to validate
 * @returns {Promise<boolean>} True if browser is valid
 */
async function validateBrowser(browser) {
    try {
        if (!browser || !browser.isConnected()) {
            return false;
        }
        // Try to get pages as additional validation
        await browser.pages();
        return true;
    } catch (err) {
        logger.warn('Browser validation failed', { error: err.message });
        return false;
    }
}

/**
 * Pool factory configuration
 */
const poolFactory = {
    create: createBrowser,
    destroy: destroyBrowserInstance,
    validate: validateBrowser
};

/**
 * Initialize the browser pool
 * @returns {Pool} Generic pool instance
 */
function initPool() {
    if (browserPool) {
        logger.info('Browser pool already initialized');
        return browserPool;
    }

    const poolOptions = {
        min: config.browserPool.min,
        max: config.browserPool.max,
        acquireTimeoutMillis: config.browserPool.acquireTimeout,
        idleTimeoutMillis: config.browserPool.idleTimeout,
        evictionRunIntervalMillis: config.browserPool.evictionInterval,
        testOnBorrow: config.browserPool.testOnBorrow,
        autostart: true
    };

    browserPool = genericPool.createPool(poolFactory, poolOptions);

    // Pool event handlers
    browserPool.on('factoryCreateError', (err) => {
        logger.error('Browser pool create error', { error: err.message });
    });

    browserPool.on('factoryDestroyError', (err) => {
        logger.error('Browser pool destroy error', { error: err.message });
    });

    logger.info('Browser pool initialized', {
        min: poolOptions.min,
        max: poolOptions.max,
        acquireTimeout: poolOptions.acquireTimeoutMillis,
        idleTimeout: poolOptions.idleTimeoutMillis
    });

    return browserPool;
}

/**
 * Get the pool instance, initializing if needed
 * @returns {Pool} Browser pool instance
 */
function getPool() {
    if (!browserPool) {
        return initPool();
    }
    return browserPool;
}

/**
 * Acquire a browser from the pool
 * @returns {Promise<Browser>} Browser instance
 */
async function acquireBrowser() {
    const pool = getPool();
    const startTime = Date.now();
    
    try {
        const browser = await pool.acquire();
        const elapsed = Date.now() - startTime;
        logger.debug('Browser acquired from pool', { elapsed, poolSize: pool.size });
        return browser;
    } catch (err) {
        logger.error('Failed to acquire browser', { error: err.message });
        throw err;
    }
}

/**
 * Release a browser back to the pool
 * @param {Browser} browser - Browser instance to release
 */
async function releaseBrowser(browser) {
    const pool = getPool();
    
    try {
        if (browser && browser.isConnected()) {
            await pool.release(browser);
            logger.debug('Browser released to pool', { poolSize: pool.size });
        } else {
            // Browser is disconnected, destroy it
            await pool.destroy(browser);
            logger.warn('Disconnected browser destroyed instead of released');
        }
    } catch (err) {
        logger.error('Error releasing browser', { error: err.message });
        // Try to destroy if release fails
        try {
            await pool.destroy(browser);
        } catch (e) {}
    }
}

/**
 * Destroy a browser (remove from pool permanently)
 * Use when browser is in bad state (crashed, etc.)
 * @param {Browser} browser - Browser instance to destroy
 */
async function destroyBrowser(browser) {
    const pool = getPool();
    
    try {
        await pool.destroy(browser);
        logger.info('Browser destroyed and removed from pool');
    } catch (err) {
        logger.error('Error destroying browser from pool', { error: err.message });
    }
}

/**
 * Get pool statistics
 * @returns {Object} Pool statistics
 */
function getPoolStats() {
    const pool = getPool();
    
    return {
        size: pool.size,
        available: pool.available,
        borrowed: pool.borrowed,
        pending: pool.pending,
        min: pool.min,
        max: pool.max
    };
}

/**
 * Drain and clear the pool (for shutdown)
 * @returns {Promise<void>}
 */
async function drainPool() {
    if (!browserPool) {
        return;
    }

    logger.info('Draining browser pool...');
    
    try {
        await browserPool.drain();
        await browserPool.clear();
        browserPool = null;
        logger.info('Browser pool drained and cleared');
    } catch (err) {
        logger.error('Error draining pool', { error: err.message });
    }
}

/**
 * Check if pool is ready
 * @returns {boolean} True if pool is initialized and has available browsers
 */
function isPoolReady() {
    return browserPool !== null && browserPool.size > 0;
}

module.exports = {
    initPool,
    getPool,
    acquireBrowser,
    releaseBrowser,
    destroyBrowser,
    getPoolStats,
    drainPool,
    isPoolReady
};

