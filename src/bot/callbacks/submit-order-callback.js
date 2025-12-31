/**
 * Submit Order Callback Handler
 *
 * Handles inline keyboard callback for submitting order ID.
 * Triggers the order submission flow when user clicks the button.
 */

const userService = require('../../services/user-service');
const { cancelMenu } = require('../keyboards');
const logger = require('../../utils/logger');

/**
 * Handle submit order callback query
 * @param {Context} ctx - Telegraf context
 */
async function handleSubmitOrderCallback(ctx) {
    try {
        // Answer callback query first (removes loading state)
        await ctx.answerCbQuery();

        const profile = await userService.getUserProfile(ctx.from.id);
        if (!profile) {
            await ctx.reply('Vui long /start truoc!');
            return;
        }

        // Set session step to awaiting order ID
        ctx.session.step = 'awaiting_order_id';

        await ctx.reply(
            `📦 *Gui ma don hang*\n\nNhap ma don hang Shopee (10-25 so) de nhan hoa hong.\n\n📌 Luu y: Chi gui don hang da mua qua link affiliate cua ban.`,
            { parse_mode: 'Markdown', ...cancelMenu }
        );

        logger.info('Submit order flow triggered via callback', {
            userId: ctx.from.id
        });

    } catch (err) {
        logger.error('Error handling submit order callback', {
            error: err.message,
            userId: ctx.from?.id
        });
        await ctx.answerCbQuery('Co loi xay ra. Vui long thu lai!');
    }
}

module.exports = {
    handleSubmitOrderCallback
};

