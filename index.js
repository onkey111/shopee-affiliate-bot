const ngrok = require('@ngrok/ngrok');
const { createBot } = require('./src/bot');
const { createAdminApp } = require('./src/admin');
const { initBrowser, closeBrowser } = require('./src/services/affiliate-service');
const config = require('./src/config');
const logger = require('./src/utils/logger');

const WEBHOOK_PATH = '/webhook/bot';
let listener = null;
let server = null;

async function main() {
    logger.info('Starting Shopee Affiliate Bot...');

    // Initialize browser ONCE at startup (stays running)
    logger.info('Initializing browser...');
    await initBrowser();
    logger.info('Browser initialized');

    const bot = createBot();
    const adminApp = createAdminApp();
    const port = config.app.port;

    // Mount webhook handler on admin app
    adminApp.use(bot.webhookCallback(WEBHOOK_PATH));

    // Start Express server first
    server = adminApp.listen(port, () => {
        logger.info(`Server running on http://localhost:${port}`);
        logger.info(`Admin panel: http://localhost:${port}/admin`);
    });

    // Start ngrok tunnel using @ngrok/ngrok
    logger.info('Starting ngrok tunnel...');

    // Set authtoken
    if (config.ngrok.authtoken) {
        await ngrok.authtoken(config.ngrok.authtoken);
    }

    // Create listener/tunnel
    listener = await ngrok.forward({
        addr: port,
        authtoken_from_env: !config.ngrok.authtoken
    });

    const tunnelUrl = listener.url();
    const webhookUrl = `${tunnelUrl}${WEBHOOK_PATH}`;

    logger.info('Ngrok tunnel established', { url: tunnelUrl });
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
            // Close ngrok listener
            if (listener) {
                await listener.close();
                logger.info('Ngrok tunnel closed');
            }
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

