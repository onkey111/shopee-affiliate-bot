// Chạy bot ở chế độ polling (không cần ngrok/webhook)
// Phù hợp cho development và testing
const { createBot } = require('./src/bot');
const { createAdminApp } = require('./src/admin');
const { initBrowser, closeBrowser } = require('./src/services/affiliate-service');
const config = require('./src/config');
const logger = require('./src/utils/logger');

let server = null;

async function main() {
    logger.info('Starting Shopee Affiliate Bot (Polling Mode)...');

    // Khởi tạo browser
    logger.info('Initializing browser...');
    await initBrowser();
    logger.info('Browser initialized');

    // Tạo bot và admin app
    const bot = createBot();
    const adminApp = createAdminApp();
    const port = config.app.port;

    // Khởi động Express server (chỉ admin panel)
    server = adminApp.listen(port, () => {
        logger.info(`Server running on http://localhost:${port}`);
        logger.info(`Admin panel: http://localhost:${port}/admin`);
    });

    // Khởi động bot ở chế độ polling
    logger.info('Starting bot in polling mode...');
    await bot.launch({
        dropPendingUpdates: true
    });
    logger.info('Bot started successfully in polling mode');

    // Graceful shutdown
    const shutdown = async (signal) => {
        logger.info(`Received ${signal}, shutting down...`);

        try {
            // Dừng bot
            await bot.stop();
            logger.info('Bot stopped');
        } catch (e) {
            logger.error('Error stopping bot', { error: e.message });
        }

        try {
            // Đóng browser
            await closeBrowser();
        } catch (e) {
            logger.error('Error closing browser', { error: e.message });
        }

        try {
            // Đóng server
            if (server) {
                server.close();
                logger.info('Server closed');
            }
        } catch (e) {
            logger.error('Error closing server', { error: e.message });
        }

        process.exit(0);
    };

    process.once('SIGINT', () => shutdown('SIGINT'));
    process.once('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch(err => {
    logger.error('Startup failed', { error: err.message, stack: err.stack });
    process.exit(1);
});

