const userService = require('../../services/user-service');
const orderService = require('../../services/order-service');
const { mainMenu, cancelMenu } = require('../keyboards');
const { isOrderId } = require('../../utils/validators');
const logger = require('../../utils/logger');

async function submitOrderHandler(ctx) {
    const profile = await userService.getUserProfile(ctx.from.id);
    if (!profile) {
        return ctx.reply('Vui long /start truoc!');
    }

    ctx.session.step = 'awaiting_order_id';
    await ctx.reply(
        `📦 *Gui ma don hang*\n\nNhap ma don hang Shopee (10-25 ky tu) de nhan hoa hong.\n\n📌 Luu y: Chi gui don hang da mua qua link affiliate cua ban.`,
        { parse_mode: 'Markdown', ...cancelMenu }
    );
}

async function processOrderInput(ctx) {
    if (ctx.session.step !== 'awaiting_order_id') return false;

    const text = ctx.message.text;
    if (text === '❌ Huy') {
        ctx.session.step = 'idle';
        return ctx.reply('Da huy.', mainMenu);
    }

    const orderId = text.trim().replace(/\s/g, '');
    
    if (!isOrderId(orderId)) {
        return ctx.reply('❌ Ma don hang khong hop le! Vui long nhap day 10-25 ky tu.');
    }

    const profile = await userService.getUserProfile(ctx.from.id);

    try {
        const order = await orderService.submitOrder(profile.id, orderId);
        ctx.session.step = 'idle';

        await ctx.reply(
            `✅ *Gui don hang thanh cong!*\n\n📦 Ma don: \`${orderId}\`\nTrang thai: Cho duyet\n\nAdmin se kiem tra va duyet hoa hong cho ban trong 24-48h.`,
            { parse_mode: 'Markdown', ...mainMenu }
        );
    } catch (err) {
        logger.error('Order submission failed', { error: err.message, userId: profile.id });

        if (err.message === 'ORDER_EXISTS') {
            ctx.session.step = 'idle';
            return ctx.reply('❌ Ma don hang nay da duoc gui truoc do!', mainMenu);
        }

        await ctx.reply('❌ Khong the gui don hang. Vui long thu lai sau!', mainMenu);
        ctx.session.step = 'idle';
    }

    return true;
}

module.exports = { submitOrderHandler, processOrderInput };

