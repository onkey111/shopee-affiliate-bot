/**
 * Production Webhook Entry Point
 * For deploying Telegram Bot to VPS Ubuntu without ngrok
 * 
 * Usage: node index-webhook.js
 * 
 * Required environment variables:
 * - WEBHOOK_URL: Full public URL for webhook (e.g., https://yourdomain.com/webhook/bot)
 */

const { createBot } = require('./src/bot');
const { createAdminApp } = require('./src/admin');
const { initBrowser, closeBrowser } = require('./src/services/affiliate-service');
const config = require('./src/config');
const logger = require('./src/utils/logger');

const WEBHOOK_PATH = '/webhook/bot';
let server = null;

async function main() {
    // Validate required WEBHOOK_URL
    if (!config.webhook.url) {
        throw new Error('WEBHOOK_URL environment variable is required for production deployment');
    }

    logger.info('Starting Shopee Affiliate Bot (Production Mode)...');

    // Initialize browser ONCE at startup (stays running)
    logger.info('Initializing browser...');
    await initBrowser();
    logger.info('Browser initialized');

    const bot = createBot();
    const adminApp = createAdminApp();
    const port = config.app.port;

    // Mount webhook handler on admin app
    adminApp.use(bot.webhookCallback(WEBHOOK_PATH));

    // Health check endpoint for Load Balancer
    adminApp.get('/health', (req, res) => {
        res.json({ status: 'ok' });
    });

    // Start Express server on 0.0.0.0 to accept requests from internal network
    server = adminApp.listen(port, '0.0.0.0', () => {
        logger.info(`Server running on http://0.0.0.0:${port}`);
        logger.info(`Admin panel: http://0.0.0.0:${port}/admin`);
        logger.info(`Health check: http://0.0.0.0:${port}/health`);
    });

    const webhookUrl = config.webhook.url;
    logger.info(`Webhook URL: ${webhookUrl}`);

    // Set webhook
    try {
        await bot.telegram.deleteWebhook({ drop_pending_updates: true });
        await bot.telegram.setWebhook(webhookUrl);
        logger.info('Webhook set successfully');
    } catch (err) {
        logger.error('Failed to set webhook', { error: err.message });
        throw err;
    }

    // Graceful shutdown
    const shutdown = async (signal) => {
        logger.info(`Received ${signal}, shutting down...`);

        try {
            // Delete webhook
            await bot.telegram.deleteWebhook();
            logger.info('Webhook deleted');
        } catch (e) {}

        try {
            // Close browser
            await closeBrowser();
        } catch (e) {}

        try {
            // Close server
            if (server) {
                server.close();
                logger.info('Server closed');
            }
        } catch (e) {}

        process.exit(0);
    };

    process.once('SIGINT', () => shutdown('SIGINT'));
    process.once('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch(err => {
    logger.error('Startup failed', { error: err.message });
    process.exit(1);
});

