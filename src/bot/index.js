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

let botInstance = null;

function createBot() {
    const bot = new Telegraf(config.bot.token);

    bot.use(session({
        defaultSession: () => ({ step: 'idle' })
    }));

    bot.catch((err, ctx) => {
        logger.error('Bot error', { error: err.message, update: ctx.updateType });
        ctx.reply('Co loi xay ra. Vui long thu lai /start').catch(() => {});
    });

    // Commands
    bot.command('start', startCommand);
    bot.command('stats', statsCommand);
    bot.command('balance', balanceCommand);
    bot.command('referral', referralCommand);
    bot.command('history', historyCommand);

    // Menu buttons
    bot.hears('🔗 Tao link', createLinkHandler);
    bot.hears('📦 Gui don', submitOrderHandler);
    bot.hears('📊 Thong ke', statsCommand);
    bot.hears('💰 So du', balanceCommand);
    bot.hears('🏦 Rut tien', withdrawHandler);
    bot.hears('👥 Gioi thieu', referralCommand);
    bot.hears('📋 Lich su', historyCommand);

    // Callbacks
    bot.action('setup_bank', setupBankCallback);
    bot.action('confirm_withdraw', confirmWithdrawCallback);
    bot.action('cancel_withdraw', cancelWithdrawCallback);

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

