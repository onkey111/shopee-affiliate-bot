const userService = require('../../services/user-service');
const linkService = require('../../services/link-service');
const { mainMenu, cancelMenu } = require('../keyboards');
const { isShopeeUrl, extractShopeeUrl } = require('../../utils/validators');
const logger = require('../../utils/logger');

async function createLinkHandler(ctx) {
    const profile = await userService.getUserProfile(ctx.from.id);
    if (!profile) {
        return ctx.reply('Vui long /start truoc!');
    }

    const remaining = await linkService.getRemainingLinks(profile.id);
    if (remaining <= 0) {
        return ctx.reply('❌ Ban da het luot tao link hom nay! Vui long quay lai ngay mai.', mainMenu);
    }

    ctx.session.step = 'awaiting_link';
    await ctx.reply(
        `🔗 *Tao link affiliate*\n\nGui link san pham Shopee de chuyen doi.\n\n📌 Con lai: ${remaining} luot hom nay`,
        { parse_mode: 'Markdown', ...cancelMenu }
    );
}

async function processLinkInput(ctx) {
    if (ctx.session.step !== 'awaiting_link') return false;

    const text = ctx.message.text;
    if (text === '❌ Huy') {
        ctx.session.step = 'idle';
        return ctx.reply('Da huy.', mainMenu);
    }

    const url = extractShopeeUrl(text);
    if (!url || !isShopeeUrl(url)) {
        return ctx.reply('❌ Link khong hop le! Vui long gui link Shopee (shopee.vn hoac vn.shp.ee)');
    }

    const profile = await userService.getUserProfile(ctx.from.id);
    
    await ctx.reply('⏳ Dang xu ly...');

    try {
        const link = await linkService.createAffiliateLink(profile.id, url);
        ctx.session.step = 'idle';

        const remaining = await linkService.getRemainingLinks(profile.id);
        
        await ctx.reply(
            `✅ *Tao link thanh cong!*\n\n🔗 *Link affiliate:*\n\`${link.affiliate_url}\`\n\n📌 Con lai: ${remaining} luot hom nay`,
            { parse_mode: 'Markdown', ...mainMenu }
        );
    } catch (err) {
        logger.error('Link creation failed', { error: err.message, userId: profile.id });
        
        if (err.message === 'DAILY_LIMIT_REACHED') {
            ctx.session.step = 'idle';
            return ctx.reply('❌ Ban da het luot tao link hom nay!', mainMenu);
        }
        
        await ctx.reply('❌ Khong the tao link. Vui long thu lai sau!', mainMenu);
        ctx.session.step = 'idle';
    }

    return true;
}

module.exports = { createLinkHandler, processLinkInput };

