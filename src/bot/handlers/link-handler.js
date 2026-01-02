const { Markup } = require('telegraf');
const userService = require('../../services/user-service');
const linkService = require('../../services/link-service');
const { mainMenu, cancelMenu } = require('../keyboards');
const { isShopeeUrl, extractShopeeUrl } = require('../../utils/validators');
const logger = require('../../utils/logger');

/**
 * Format rate limit status for display to user
 * @param {{burstRemaining: number, cooldownSecondsLeft: number, isUnlimited: boolean}} status
 * @returns {string}
 */
function formatRateLimitStatus(status) {
    if (status.isUnlimited) {
        return 'Không giới hạn';
    }

    if (status.burstRemaining > 0) {
        return `${status.burstRemaining} lượt (trong 1 giờ)`;
    }

    if (status.cooldownSecondsLeft > 0) {
        return `Chờ ${linkService.formatCooldownTime(status.cooldownSecondsLeft)}`;
    }

    return '1 lượt (cooldown)';
}

async function createLinkHandler(ctx) {
    const profile = await userService.getUserProfile(ctx.from.id);
    if (!profile) {
        return ctx.reply('Vui lòng /start trước!');
    }

    const status = await linkService.getRemainingLinks(profile.id);

    // Check if rate limited
    if (!status.isUnlimited && status.burstRemaining === 0 && status.cooldownSecondsLeft > 0) {
        const cooldownText = linkService.formatCooldownTime(status.cooldownSecondsLeft);
        return ctx.reply(
            `⏳ *Đang trong thời gian chờ*\n\nBạn đã dùng hết lượt burst. Vui lòng chờ ${cooldownText} để tạo link tiếp.`,
            { parse_mode: 'Markdown', ...mainMenu }
        );
    }

    ctx.session.step = 'awaiting_link';
    const remainingText = formatRateLimitStatus(status);
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

        const status = await linkService.getRemainingLinks(profile.id);
        const remainingText = formatRateLimitStatus(status);

        // Create inline keyboard with Submit Order ID button only (affiliate link sent as plain text)
        const keyboard = Markup.inlineKeyboard([
            [Markup.button.callback('📦 Gửi Order ID', 'submit_order')]
        ]);

        await ctx.reply(
            `✅ *Tạo link thành công!*\n\n🔗 *Link affiliate:*\n\`${link.affiliate_url}\`\n\nCác bác copy link và dán vào trình duyệt chính (Chrome, Safari) hoặc mở trực tiếp trong app Shopee để không bị mất cashback hộ em nhé.\n\n📌 Còn lại: ${remainingText}\n\n📝 Sau khi mua hàng, nhấn nút bên dưới để gửi Order ID.`,
            { parse_mode: 'Markdown', ...mainMenu, ...keyboard }
        );
    } catch (err) {
        logger.error('Link creation failed', { error: err.message, userId: profile.id });

        if (err.message === 'RATE_LIMIT_REACHED') {
            ctx.session.step = 'idle';
            const cooldownText = err.cooldownSecondsLeft > 0
                ? `Vui lòng chờ ${linkService.formatCooldownTime(err.cooldownSecondsLeft)}.`
                : 'Vui lòng thử lại sau.';
            return ctx.reply(`⏳ Bạn đã hết lượt tạo link! ${cooldownText}`, mainMenu);
        }

        await ctx.reply('❌ Không thể tạo link. Vui lòng thử lại sau!', mainMenu);
        ctx.session.step = 'idle';
    }

    return true;
}

module.exports = { createLinkHandler, processLinkInput };

