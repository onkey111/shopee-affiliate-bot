const userService = require('../../services/user-service');
const { mainMenu } = require('../keyboards');

async function referralCommand(ctx) {
    const profile = await userService.getUserProfile(ctx.from.id);
    if (!profile) {
        return ctx.reply('Vui lòng /start trước!');
    }

    const botUsername = ctx.botInfo.username;
    const refLink = `https://t.me/${botUsername}?start=${profile.ref_code}`;

    const msg = `
👥 *Chương trình giới thiệu*

🔗 *Link giới thiệu của bạn:*
\`${refLink}\`

📋 *Mã giới thiệu:* \`${profile.ref_code}\`

👥 *Số người đã giới thiệu:* ${profile.referral_count || 0}

💰 *Hoa hồng giới thiệu:* 10% hoa hồng từ mỗi đơn hàng của người bạn giới thiệu!

📌 *Cách chia sẻ:*
1. Copy link giới thiệu phía trên
2. Gửi cho bạn bè
3. Khi họ đăng ký và có đơn hàng, bạn sẽ nhận hoa hồng!
`;

    await ctx.reply(msg, { parse_mode: 'Markdown', ...mainMenu });
}

module.exports = referralCommand;

