const { Telegraf, session } = require('telegraf');
const config = require('../config');
const logger = require('../utils/logger');

// Commands
const startCommand = require('./commands/start');
const statsCommand = require('./commands/stats');
const balanceCommand = require('./commands/balance');
const referralCommand = require('./commands/referral');
const historyCommand = require('./commands/history');

// Handlers
const { createLinkHandler, processLinkInput } = require('./handlers/link-handler');
const { withdrawHandler, processWithdrawInput, confirmWithdrawCallback, cancelWithdrawCallback } = require('./handlers/withdraw-handler');
const { setupBankCallback, processBankInput } = require('./handlers/bank-handler');
const { submitOrderHandler, processOrderInput } = require('./handlers/order-handler');

// Callbacks
const { handleSubmitOrderCallback } = require('./callbacks/submit-order-callback');

let botInstance = null;

function createBot() {
    const bot = new Telegraf(config.bot.token);

    bot.use(session({
        defaultSession: () => ({ step: 'idle' })
    }));

    bot.catch((err, ctx) => {
        logger.error('Bot error', { error: err.message, update: ctx.updateType });
        ctx.reply('Có lỗi xảy ra. Vui lòng thử lại /start').catch(() => {});
    });

    // Commands
    bot.command('start', startCommand);
    bot.command('stats', statsCommand);
    bot.command('balance', balanceCommand);
    bot.command('referral', referralCommand);
    bot.command('history', historyCommand);

    // Menu buttons
    bot.hears('🔗 Tạo link', createLinkHandler);
    bot.hears('📦 Gửi đơn', submitOrderHandler);
    bot.hears('📊 Thống kê', statsCommand);
    bot.hears('💰 Số dư', balanceCommand);
    bot.hears('🏦 Rút tiền', withdrawHandler);
    bot.hears('👥 Giới thiệu', referralCommand);
    bot.hears('📋 Lịch sử', historyCommand);

    // Callbacks
    bot.action('setup_bank', setupBankCallback);
    bot.action('confirm_withdraw', confirmWithdrawCallback);
    bot.action('cancel_withdraw', cancelWithdrawCallback);
    bot.action('submit_order', handleSubmitOrderCallback);

    // Text message handler
    bot.on('text', async (ctx) => {
        // Process based on current step
        const handled = await processLinkInput(ctx) ||
                       await processOrderInput(ctx) ||
                       await processWithdrawInput(ctx) ||
                       await processBankInput(ctx);

        if (!handled && ctx.session.step === 'idle') {
            // Unknown message
        }
    });

    botInstance = bot;
    return bot;
}

function getBotInstance() {
    return botInstance;
}

module.exports = { createBot, getBotInstance };

