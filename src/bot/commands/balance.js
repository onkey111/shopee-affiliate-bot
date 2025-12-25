const userService = require('../../services/user-service');
const { mainMenu } = require('../keyboards');
const { currency } = require('../../utils/formatters');

async function balanceCommand(ctx) {
    const profile = await userService.getUserProfile(ctx.from.id);
    if (!profile) {
        return ctx.reply('Vui long /start truoc!');
    }

    const msg = `
💰 *So du tai khoan*

So du hien tai: *${currency(profile.balance)}*

📌 Rut tien toi thieu: 100,000d
🏦 Ngan hang: ${profile.bank_account ? `${profile.bank_account.bank_name} - ${profile.bank_account.account_number}` : 'Chua thiet lap'}

Bam "🏦 Rut tien" de rut tien ve tai khoan!
`;

    await ctx.reply(msg, { parse_mode: 'Markdown', ...mainMenu });
}

module.exports = balanceCommand;

