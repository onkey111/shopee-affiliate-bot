const userService = require('../../services/user-service');
const orderService = require('../../services/order-service');
const { mainMenu } = require('../keyboards');
const { currency } = require('../../utils/formatters');

async function statsCommand(ctx) {
    const profile = await userService.getUserProfile(ctx.from.id);
    if (!profile) {
        return ctx.reply('Vui long /start truoc!');
    }

    const stats = await orderService.getUserStats(profile.id);

    const msg = `
📊 *Thong ke cua ban*

📦 *Don hang:*
• Da duyet: ${stats.approved_count || 0}
• Dang cho: ${stats.pending_count || 0}

💰 *Hoa hong:*
• Tong hoa hong: ${currency(stats.total_commission || 0)}
• So du hien tai: ${currency(profile.balance)}

🔗 *Link da tao:* ${profile.total_links || 0}
👥 *Nguoi gioi thieu:* ${profile.referral_count || 0}
`;

    await ctx.reply(msg, { parse_mode: 'Markdown', ...mainMenu });
}

module.exports = statsCommand;

