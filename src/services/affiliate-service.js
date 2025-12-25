/**
 * Optimized Shopee Affiliate Link Converter
 * Features:
 * 1. Browser init ONCE at bot start, stays open with WebSocket persistence
 * 2. puppeteer-extra with StealthPlugin for anti-bot bypass
 * 3. Load cookies from .cookies.json
 * 4. Request interception to block images/fonts/analytics
 * 5. Performance browser args
 * 6. Link conversion opens new tab only, not new browser
 * 7. Auto-reconnect on disconnect
 */

const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');

// Apply stealth plugin
puppeteer.use(StealthPlugin());

// Configuration
const CONFIG = {
    headless: true,
    cookiesFile: path.join(process.cwd(), '.cookies.json'),
    timeout: 30000,
    targetUrl: 'https://affiliate.shopee.vn/offer/custom_link',
    reconnectDelay: 1000,
    maxReconnectAttempts: 3
};

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

// Blocked resource patterns for request interception
const blockedPatterns = {
    resourceTypes: ['image', 'font', 'media'],
    urlPatterns: ['google-analytics', 'googletagmanager', 'facebook', 'hotjar', 'gtm', 'fbevents', 'doubleclick', 'adsense']
};

// Browser state
let browser = null;
let wsEndpoint = null;
let cookies = [];

/**
 * Load cookies from .cookies.json file
 */
function loadCookies() {
    try {
        if (fs.existsSync(CONFIG.cookiesFile)) {
            const data = fs.readFileSync(CONFIG.cookiesFile, 'utf8');
            cookies = JSON.parse(data);
            logger.info('Cookies loaded', { count: cookies.length });
            return cookies;
        }
        logger.warn('Cookies file not found', { path: CONFIG.cookiesFile });
        return [];
    } catch (e) {
        logger.error('Failed to load cookies', { error: e.message });
        return [];
    }
}

/**
 * Setup request interception to block unnecessary resources
 */
async function setupRequestInterception(page) {
    await page.setRequestInterception(true);
    page.on('request', (request) => {
        const resourceType = request.resourceType();
        const url = request.url();
        if (blockedPatterns.resourceTypes.includes(resourceType) ||
            blockedPatterns.urlPatterns.some(pattern => url.includes(pattern))) {
            request.abort();
        } else {
            request.continue();
        }
    });
}

/**
 * Initialize browser - call ONCE at bot startup
 * Browser stays running with WebSocket persistence
 */
async function initBrowser() {
    if (browser && browser.isConnected()) {
        logger.info('Browser already running');
        return browser;
    }

    // Try to reconnect if we have wsEndpoint
    if (wsEndpoint) {
        try {
            logger.info('Reconnecting to existing browser...');
            browser = await puppeteer.connect({ browserWSEndpoint: wsEndpoint });
            if (browser.isConnected()) {
                logger.info('Reconnected to browser');
                setupBrowserEvents();
                return browser;
            }
        } catch (e) {
            logger.warn('Reconnect failed, launching new browser', { error: e.message });
            wsEndpoint = null;
        }
    }

    // Launch new browser
    logger.info('Launching new browser...');
    browser = await puppeteer.launch({
        headless: CONFIG.headless,
        defaultViewport: { width: 1280, height: 720 },
        args: browserArgs
    });

    wsEndpoint = browser.wsEndpoint();
    logger.info('Browser launched', { wsEndpoint });

    // Load cookies on first launch
    loadCookies();

    setupBrowserEvents();
    return browser;
}

/**
 * Setup browser disconnect/error handlers for auto-reconnect
 */
function setupBrowserEvents() {
    if (!browser) return;

    browser.on('disconnected', async () => {
        logger.warn('Browser disconnected, will reconnect on next request');
        browser = null;
    });
}

/**
 * Get browser instance with auto-reconnect
 */
async function getBrowser() {
    if (browser && browser.isConnected()) {
        return browser;
    }

    // Auto-reconnect
    for (let i = 0; i < CONFIG.maxReconnectAttempts; i++) {
        try {
            await initBrowser();
            if (browser && browser.isConnected()) {
                return browser;
            }
        } catch (e) {
            logger.error('Reconnect attempt failed', { attempt: i + 1, error: e.message });
            await new Promise(r => setTimeout(r, CONFIG.reconnectDelay));
        }
    }

    throw new Error('Failed to get browser after max reconnect attempts');
}

/**
 * Convert Shopee link to affiliate link
 * Opens new TAB only, not new browser
 */
async function convertLink(originalUrl) {
    const startTime = Date.now();
    let page = null;

    try {
        const b = await getBrowser();
        page = await b.newPage();

        // Setup request interception
        await setupRequestInterception(page);

        // Batch set cookies (single call)
        if (cookies.length > 0) {
            await page.setCookie(...cookies);
        }

        // Navigate
        await page.goto(CONFIG.targetUrl, {
            waitUntil: 'networkidle2',
            timeout: CONFIG.timeout
        });

        // Wait for textarea using CSS selector
        await page.waitForFunction(() => {
            return document.querySelector('textarea') !== null;
        }, { timeout: CONFIG.timeout });

        // Enter link
        await page.evaluate(() => {
            const textarea = document.querySelector('textarea');
            textarea.focus();
            textarea.value = '';
        });
        const textarea = await page.$('textarea');
        await textarea.type(originalUrl, { delay: 0 });

        // Click convert button
        await page.waitForSelector('button', { timeout: CONFIG.timeout });
        await page.evaluate(() => {
            const buttons = document.querySelectorAll('button');
            for (const btn of buttons) {
                const span = btn.querySelector('span');
                if (span) {
                    btn.click();
                    return;
                }
            }
            if (buttons.length > 0) buttons[0].click();
        });

        // Wait for result
        await page.waitForFunction(() => {
            const spans = document.querySelectorAll('span');
            for (const span of spans) {
                if (span.textContent === 'Sao chép Link') return true;
            }
            const inputs = document.querySelectorAll('input');
            for (const input of inputs) {
                if (input.value && (input.value.includes('shp.ee') || input.value.includes('s.shopee'))) {
                    return true;
                }
            }
            return false;
        }, { timeout: CONFIG.timeout });

        // Extract affiliate link
        let affiliateLink = await page.evaluate(() => {
            const inputs = document.querySelectorAll('input');
            for (const input of inputs) {
                if (input.value && (input.value.includes('shp.ee') || input.value.includes('s.shopee'))) {
                    return input.value;
                }
            }
            const allElements = document.querySelectorAll('*');
            for (const el of allElements) {
                const text = el.textContent || '';
                if ((text.includes('shp.ee') || text.includes('s.shopee')) && el.children.length === 0) {
                    return text.trim();
                }
            }
            return null;
        });

        const elapsed = Date.now() - startTime;
        logger.info('Link converted', { originalUrl, affiliateLink, elapsed });

        return affiliateLink;
    } catch (err) {
        logger.error('Affiliate conversion failed', { error: err.message, url: originalUrl });
        throw err;
    } finally {
        if (page) await page.close().catch(() => {});
    }
}

/**
 * Close browser - call on bot shutdown
 */
async function closeBrowser() {
    if (browser) {
        try {
            await browser.close();
        } catch (e) {}
        browser = null;
        wsEndpoint = null;
        logger.info('Browser closed');
    }
}

/**
 * Check if browser is running
 */
function isBrowserRunning() {
    return browser && browser.isConnected();
}

module.exports = {
    initBrowser,
    convertLink,
    closeBrowser,
    isBrowserRunning,
    loadCookies
};

