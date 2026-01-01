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
🎉 *Chào mừng bạn đến với Shopee Affiliate Bot!*

👤 *Thông tin của bạn:*
• Tên: ${user.telegram_first_name}
• Mã giới thiệu: \`${user.ref_code}\`
• Số dư: ${user.balance}đ

📌 *Hướng dẫn sử dụng:*
1. 🔗 *Tạo link* - Chuyển đổi link Shopee thành link affiliate
2. 📊 *Thống kê* - Xem thống kê đơn hàng và hoa hồng
3. 💰 *Số dư* - Xem số dư hiện tại
4. 🏦 *Rút tiền* - Rút tiền về tài khoản ngân hàng
5. 👥 *Giới thiệu* - Lấy link giới thiệu bạn bè
6. 📋 *Lịch sử* - Xem lịch sử giao dịch

Chọn chức năng bên dưới để bắt đầu! 👇
`;

    await ctx.reply(welcomeMsg, { parse_mode: 'Markdown', ...mainMenu });
}

module.exports = startCommand;

