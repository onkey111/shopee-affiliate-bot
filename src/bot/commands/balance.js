const userService = require('../../services/user-service');
const { mainMenu } = require('../keyboards');
const { currency } = require('../../utils/formatters');

async function balanceCommand(ctx) {
    const profile = await userService.getUserProfile(ctx.from.id);
    if (!profile) {
        return ctx.reply('Vui lòng /start trước!');
    }

    const msg = `
💰 *Số dư tài khoản*

Số dư hiện tại: *${currency(profile.balance)}*

📌 Rút tiền tối thiểu: 100,000đ
🏦 Ngân hàng: ${profile.bank_account ? `${profile.bank_account.bank_name} - ${profile.bank_account.account_number}` : 'Chưa thiết lập'}

Bấm "🏦 Rút tiền" để rút tiền về tài khoản!
`;

    await ctx.reply(msg, { parse_mode: 'Markdown', ...mainMenu });
}

module.exports = balanceCommand;

