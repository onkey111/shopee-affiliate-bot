const userService = require('../../services/user-service');
const { mainMenu } = require('../keyboards');

async function referralCommand(ctx) {
    const profile = await userService.getUserProfile(ctx.from.id);
    if (!profile) {
        return ctx.reply('Vui long /start truoc!');
    }

    const botUsername = ctx.botInfo.username;
    const refLink = `https://t.me/${botUsername}?start=${profile.ref_code}`;

    const msg = `
👥 *Chuong trinh gioi thieu*

🔗 *Link gioi thieu cua ban:*
\`${refLink}\`

📋 *Ma gioi thieu:* \`${profile.ref_code}\`

👥 *So nguoi da gioi thieu:* ${profile.referral_count || 0}

💰 *Hoa hong gioi thieu:* 10% hoa hong tu moi don hang cua nguoi ban gioi thieu!

📌 *Cach chia se:*
1. Copy link gioi thieu phia tren
2. Gui cho ban be
3. Khi ho dang ky va co don hang, ban se nhan hoa hong!
`;

    await ctx.reply(msg, { parse_mode: 'Markdown', ...mainMenu });
}

module.exports = referralCommand;

