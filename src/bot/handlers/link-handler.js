const { Markup } = require('telegraf');
const userService = require('../../services/user-service');
const linkService = require('../../services/link-service');
const { mainMenu, cancelMenu } = require('../keyboards');
const { isShopeeUrl, extractShopeeUrl } = require('../../utils/validators');
const logger = require('../../utils/logger');

async function createLinkHandler(ctx) {
    const profile = await userService.getUserProfile(ctx.from.id);
    if (!profile) {
        return ctx.reply('Vui lòng /start trước!');
    }

    const remaining = await linkService.getRemainingLinks(profile.id);
    // remaining = -1 means unlimited, remaining = 0 means limit reached
    if (remaining === 0) {
        return ctx.reply('❌ Bạn đã hết lượt tạo link hôm nay! Vui lòng quay lại ngày mai.', mainMenu);
    }

    ctx.session.step = 'awaiting_link';
    const remainingText = remaining === -1 ? 'Không giới hạn' : `${remaining} lượt hôm nay`;
    await ctx.reply(
        `🔗 *Tạo link affiliate*\n\nGửi link sản phẩm Shopee để chuyển đổi.\n\n📌 Còn lại: ${remainingText}`,
        { parse_mode: 'Markdown', ...cancelMenu }
    );
}

async function processLinkInput(ctx) {
    if (ctx.session.step !== 'awaiting_link') return false;

    const text = ctx.message.text;
    if (text === '❌ Hủy') {
        ctx.session.step = 'idle';
        return ctx.reply('Đã hủy.', mainMenu);
    }

    const url = extractShopeeUrl(text);
    if (!url || !isShopeeUrl(url)) {
        return ctx.reply('❌ Link không hợp lệ! Vui lòng gửi link Shopee (shopee.vn hoặc vn.shp.ee)');
    }

    const profile = await userService.getUserProfile(ctx.from.id);

    await ctx.reply('⏳ Đang xử lý...');

    try {
        const link = await linkService.createAffiliateLink(profile.id, url);
        ctx.session.step = 'idle';

        const remaining = await linkService.getRemainingLinks(profile.id);
        const remainingText = remaining === -1 ? 'Không giới hạn' : `${remaining} lượt hôm nay`;

        // Create inline keyboard with clickable URL button and Submit Order ID button
        const keyboard = Markup.inlineKeyboard([
            [Markup.button.url('🔗 Mở link affiliate', link.affiliate_url)],
            [Markup.button.callback('📦 Gửi Order ID', 'submit_order')]
        ]);

        await ctx.reply(
            `✅ *Tạo link thành công!*\n\n📌 Còn lại: ${remainingText}\n\n📝 Sau khi mua hàng, nhấn nút bên dưới để gửi Order ID.`,
            { parse_mode: 'Markdown', ...mainMenu, ...keyboard }
        );
    } catch (err) {
        logger.error('Link creation failed', { error: err.message, userId: profile.id });

        if (err.message === 'DAILY_LIMIT_REACHED') {
            ctx.session.step = 'idle';
            return ctx.reply('❌ Bạn đã hết lượt tạo link hôm nay!', mainMenu);
        }

        await ctx.reply('❌ Không thể tạo link. Vui lòng thử lại sau!', mainMenu);
        ctx.session.step = 'idle';
    }

    return true;
}

module.exports = { createLinkHandler, processLinkInput };

