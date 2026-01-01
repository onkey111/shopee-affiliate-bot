const userService = require('../../services/user-service');
const orderService = require('../../services/order-service');
const { mainMenu, cancelMenu } = require('../keyboards');
const { isOrderId } = require('../../utils/validators');
const logger = require('../../utils/logger');

async function submitOrderHandler(ctx) {
    const profile = await userService.getUserProfile(ctx.from.id);
    if (!profile) {
        return ctx.reply('Vui lòng /start trước!');
    }

    ctx.session.step = 'awaiting_order_id';
    await ctx.reply(
        `📦 *Gửi mã đơn hàng*\n\nNhập mã đơn hàng Shopee (10-25 ký tự) để nhận hoa hồng.\n\n📌 Lưu ý: Chỉ gửi đơn hàng đã mua qua link affiliate của bạn.`,
        { parse_mode: 'Markdown', ...cancelMenu }
    );
}

async function processOrderInput(ctx) {
    if (ctx.session.step !== 'awaiting_order_id') return false;

    const text = ctx.message.text;
    if (text === '❌ Hủy') {
        ctx.session.step = 'idle';
        return ctx.reply('Đã hủy.', mainMenu);
    }

    const orderId = text.trim().replace(/\s/g, '');

    if (!isOrderId(orderId)) {
        return ctx.reply('❌ Mã đơn hàng không hợp lệ! Vui lòng nhập đầy 10-25 ký tự.');
    }

    const profile = await userService.getUserProfile(ctx.from.id);

    try {
        const order = await orderService.submitOrder(profile.id, orderId);
        ctx.session.step = 'idle';

        await ctx.reply(
            `✅ *Gửi đơn hàng thành công!*\n\n📦 Mã đơn: \`${orderId}\`\nTrạng thái: Chờ duyệt\n\nAdmin sẽ kiểm tra và duyệt hoa hồng cho bạn trong 24-48h.`,
            { parse_mode: 'Markdown', ...mainMenu }
        );
    } catch (err) {
        logger.error('Order submission failed', { error: err.message, userId: profile.id });

        if (err.message === 'ORDER_EXISTS') {
            ctx.session.step = 'idle';
            return ctx.reply('❌ Mã đơn hàng này đã được gửi trước đó!', mainMenu);
        }

        await ctx.reply('❌ Không thể gửi đơn hàng. Vui lòng thử lại sau!', mainMenu);
        ctx.session.step = 'idle';
    }

    return true;
}

module.exports = { submitOrderHandler, processOrderInput };

