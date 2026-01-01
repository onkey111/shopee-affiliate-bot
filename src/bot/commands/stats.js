const userService = require('../../services/user-service');
const orderService = require('../../services/order-service');
const { mainMenu } = require('../keyboards');
const { currency } = require('../../utils/formatters');

async function statsCommand(ctx) {
    const profile = await userService.getUserProfile(ctx.from.id);
    if (!profile) {
        return ctx.reply('Vui lòng /start trước!');
    }

    const stats = await orderService.getUserStats(profile.id);

    const msg = `
📊 *Thống kê của bạn*

📦 *Đơn hàng:*
• Đã duyệt: ${stats.approved_count || 0}
• Đang chờ: ${stats.pending_count || 0}

💰 *Hoa hồng:*
• Tổng hoa hồng: ${currency(stats.total_commission || 0)}
• Số dư hiện tại: ${currency(profile.balance)}

🔗 *Link đã tạo:* ${profile.total_links || 0}
👥 *Người giới thiệu:* ${profile.referral_count || 0}
`;

    await ctx.reply(msg, { parse_mode: 'Markdown', ...mainMenu });
}

module.exports = statsCommand;

