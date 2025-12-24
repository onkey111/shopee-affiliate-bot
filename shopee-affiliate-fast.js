/**
 * Optimized Shopee Affiliate Link Converter
 * Performance improvements:
 * 1. Browser instance pooling with WebSocket endpoint persistence
 * 2. Batch cookie setting
 * 3. Request interception (block images, fonts, analytics)
 * 4. domcontentloaded instead of networkidle2
 * 5. CSS selectors instead of XPath
 * 6. Direct value setting via evaluate
 * 7. No unnecessary delays
 * 8. Optimized DOM querying
 * 9. Configurable headless mode
 * 10. Performance browser args
 * 11. Cookies loaded from external file (.cookies.json) for security
 */

const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

// Configuration
const CONFIG = {
    // Note: headless mode may not work due to Shopee's anti-bot detection
    // Set to false for reliable operation, or 'new' to try new headless mode
    headless: false,
    sessionFile: path.join(__dirname, '.browser-session.json'),
    cookiesFile: path.join(__dirname, '.cookies.json'),
    sessionMaxAge: 3600000, // 1 hour
    timeout: 30000,
    targetUrl: 'https://affiliate.shopee.vn/offer/custom_link',
    testLink: 'https://vn.shp.ee/XdyYAmE'
};

/**
 * Load cookies từ file .cookies.json
 * @returns {Array} Mảng cookies hoặc mảng rỗng nếu không tìm thấy file
 */
function loadCookies() {
    try {
        if (fs.existsSync(CONFIG.cookiesFile)) {
            const data = fs.readFileSync(CONFIG.cookiesFile, 'utf8');
            return JSON.parse(data);
        }
        console.error('❌ Không tìm thấy file .cookies.json');
        console.error('📝 Hãy copy .cookies.example.json thành .cookies.json và điền cookies của bạn');
        return [];
    } catch (e) {
        console.error('❌ Lỗi đọc file cookies:', e.message);
        return [];
    }
}

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
// Note: Don't block 'stylesheet' as it may break SPA rendering
const blockedPatterns = {
    resourceTypes: ['image', 'font', 'media'],
    urlPatterns: ['google-analytics', 'googletagmanager', 'facebook', 'hotjar', 'gtm', 'fbevents', 'doubleclick', 'adsense']
};

// Session management functions
function readSession() {
    try {
        if (fs.existsSync(CONFIG.sessionFile)) {
            const data = JSON.parse(fs.readFileSync(CONFIG.sessionFile, 'utf8'));
            if (Date.now() - data.timestamp < CONFIG.sessionMaxAge) {
                return data;
            }
        }
    } catch (e) { /* ignore */ }
    return null;
}

function writeSession(wsEndpoint) {
    try {
        fs.writeFileSync(CONFIG.sessionFile, JSON.stringify({ wsEndpoint, timestamp: Date.now() }));
    } catch (e) { /* ignore */ }
}

function clearSession() {
    try { if (fs.existsSync(CONFIG.sessionFile)) fs.unlinkSync(CONFIG.sessionFile); } catch (e) { /* ignore */ }
}

// Get or create browser instance
async function getBrowser() {
    const session = readSession();
    if (session?.wsEndpoint) {
        try {
            console.log('⚡ Connecting to existing browser session...');
            return await puppeteer.connect({ browserWSEndpoint: session.wsEndpoint });
        } catch (e) {
            console.log('📝 Session expired, launching new browser...');
            clearSession();
        }
    }
    
    console.log('🚀 Launching new browser...');
    const browser = await puppeteer.launch({
        headless: CONFIG.headless,
        defaultViewport: { width: 1280, height: 720 },
        args: browserArgs
    });
    writeSession(browser.wsEndpoint());
    return browser;
}

// Setup request interception
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

// Main function
async function convertToAffiliateLink(inputLink) {
    const startTime = Date.now();
    let browser, page;

    try {
        // Load cookies từ file
        const cookies = loadCookies();
        if (cookies.length === 0) {
            throw new Error('Không có cookies. Hãy cấu hình file .cookies.json');
        }

        browser = await getBrowser();
        page = await browser.newPage();

        // Setup request interception
        await setupRequestInterception(page);

        // Batch set cookies (single call instead of loop)
        console.log('🍪 Setting cookies...');
        await page.setCookie(...cookies);
        
        // Navigate with networkidle2 for SPA
        console.log('🌐 Navigating to page...');
        await page.goto(CONFIG.targetUrl, { waitUntil: 'networkidle2', timeout: CONFIG.timeout });

        // Wait for textarea using CSS selector (faster than XPath)
        console.log('⏳ Waiting for textarea...');
        await page.waitForFunction(() => {
            return document.querySelector('textarea') !== null;
        }, { timeout: CONFIG.timeout });

        // Direct value setting via evaluate - need to trigger React properly
        console.log('📝 Entering link...');
        // First clear and focus
        await page.evaluate(() => {
            const textarea = document.querySelector('textarea');
            textarea.focus();
            textarea.value = '';
        });
        // Use type() but with minimal delay for React compatibility
        const textarea = await page.$('textarea');
        await textarea.type(inputLink, { delay: 0 });

        // Click the convert button
        console.log('🖱️ Clicking convert button...');
        await page.waitForSelector('button', { timeout: CONFIG.timeout });

        // Click button that contains span (like original script)
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

        // Wait for result - look for "Sao chép Link" text (indicates result is ready)
        console.log('⏳ Waiting for affiliate link...');
        await page.waitForFunction(() => {
            const spans = document.querySelectorAll('span');
            for (const span of spans) {
                if (span.textContent === 'Sao chép Link') {
                    return true;
                }
            }
            const inputs = document.querySelectorAll('input');
            for (const input of inputs) {
                if (input.value && (input.value.includes('shp.ee') || input.value.includes('s.shopee'))) {
                    return true;
                }
            }
            return false;
        }, { timeout: CONFIG.timeout });

        // Extract affiliate link - use same approach as original script
        console.log('🔍 Extracting affiliate link...');

        // Method 1: Try to find link in input fields using $$
        let affiliateLink = null;
        const inputElements = await page.$$('input[type="text"], input[readonly], input');
        for (const input of inputElements) {
            const value = await page.evaluate(el => el.value, input);
            if (value && (value.includes('shp.ee') || value.includes('s.shopee') || value.includes('shopee'))) {
                affiliateLink = value;
                break;
            }
        }

        // Method 2: Fallback - search in DOM text content
        if (!affiliateLink) {
            affiliateLink = await page.evaluate(() => {
                // Find all leaf elements containing affiliate link
                const allElements = document.querySelectorAll('*');
                for (const el of allElements) {
                    const text = el.textContent || '';
                    if ((text.includes('shp.ee') || text.includes('s.shopee')) &&
                        el.children.length === 0) {
                        return text.trim();
                    }
                }
                // Try input values
                const inputs = document.querySelectorAll('input');
                for (const input of inputs) {
                    if (input.value && (input.value.includes('shp.ee') || input.value.includes('s.shopee'))) {
                        return input.value;
                    }
                }
                return null;
            });
        }

        const elapsed = Date.now() - startTime;

        if (affiliateLink) {
            console.log('');
            console.log('✅ SUCCESS!');
            console.log('🔗 Affiliate Link:', affiliateLink);
            console.log(`⏱️ Time: ${elapsed}ms`);
            return affiliateLink;
        } else {
            throw new Error('Could not extract affiliate link');
        }

    } catch (error) {
        console.error('❌ Error:', error.message);
        throw error;
    } finally {
        if (page) await page.close().catch(() => {});
        if (browser) browser.disconnect();
    }
}

// Run if called directly
if (require.main === module) {
    console.log('='.repeat(50));
    console.log('🚀 Shopee Affiliate Link Converter (Optimized)');
    console.log('='.repeat(50));
    console.log('');

    convertToAffiliateLink(CONFIG.testLink)
        .then(link => {
            console.log('');
            console.log('📋 Result:', link);
            process.exit(0);
        })
        .catch(err => {
            console.error('Failed:', err.message);
            process.exit(1);
        });
}

module.exports = { convertToAffiliateLink, CONFIG };

