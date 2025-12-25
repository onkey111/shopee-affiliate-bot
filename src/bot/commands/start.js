const userService = require('../../services/user-service');
const { mainMenu } = require('../keyboards');

async function startCommand(ctx) {
    const telegramUser = ctx.from;
    let referrerCode = null;

    // Check for referral code in /start payload
    const startPayload = ctx.message.text.split(' ')[1];
    if (startPayload) {
        referrerCode = startPayload;
    }

    const user = await userService.getOrCreateUser(telegramUser, referrerCode);

    const welcomeMsg = `
🎉 *Chao mung ban den voi Shopee Affiliate Bot!*

👤 *Thong tin cua ban:*
• Ten: ${user.telegram_first_name}
• Ma gioi thieu: \`${user.ref_code}\`
• So du: ${user.balance}d

📌 *Huong dan su dung:*
1. 🔗 *Tao link* - Chuyen doi link Shopee thanh link affiliate
2. 📊 *Thong ke* - Xem thong ke don hang va hoa hong
3. 💰 *So du* - Xem so du hien tai
4. 🏦 *Rut tien* - Rut tien ve tai khoan ngan hang
5. 👥 *Gioi thieu* - Lay link gioi thieu ban be
6. 📋 *Lich su* - Xem lich su giao dich

Chon chuc nang ben duoi de bat dau! 👇
`;

    await ctx.reply(welcomeMsg, { parse_mode: 'Markdown', ...mainMenu });
}

module.exports = startCommand;

