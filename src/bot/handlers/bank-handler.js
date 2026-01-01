const userService = require('../../services/user-service');
const userRepo = require('../../db/repositories/user-repository');
const { mainMenu, cancelMenu } = require('../keyboards');

const BANKS = [
    'Vietcombank', 'Techcombank', 'BIDV', 'Agribank', 'VPBank',
    'MB Bank', 'ACB', 'Sacombank', 'TPBank', 'VIB', 'OCB', 'MSB'
];

async function setupBankCallback(ctx) {
    ctx.session.step = 'awaiting_bank_name';
    ctx.session.bankData = {};

    const bankList = BANKS.map((b, i) => `${i + 1}. ${b}`).join('\n');
    await ctx.answerCbQuery();
    await ctx.reply(
        `🏦 *Thiết lập tài khoản ngân hàng*\n\nChọn ngân hàng (nhập số hoặc tên):\n\n${bankList}`,
        { parse_mode: 'Markdown', ...cancelMenu }
    );
}

async function processBankInput(ctx) {
    const step = ctx.session.step;
    const text = ctx.message.text;

    if (text === '❌ Hủy') {
        ctx.session.step = 'idle';
        ctx.session.bankData = null;
        return ctx.reply('Đã hủy.', mainMenu);
    }

    if (step === 'awaiting_bank_name') {
        let bankName = text;
        const num = parseInt(text);
        if (!isNaN(num) && num >= 1 && num <= BANKS.length) {
            bankName = BANKS[num - 1];
        }

        ctx.session.bankData.bankName = bankName;
        ctx.session.step = 'awaiting_account_number';
        await ctx.reply('Nhập số tài khoản:', cancelMenu);
        return true;
    }

    if (step === 'awaiting_account_number') {
        if (!/^\d{6,20}$/.test(text.replace(/\s/g, ''))) {
            return ctx.reply('❌ Số tài khoản không hợp lệ! Vui lòng nhập lại:');
        }

        ctx.session.bankData.accountNumber = text.replace(/\s/g, '');
        ctx.session.step = 'awaiting_account_holder';
        await ctx.reply('Nhập tên chủ tài khoản (không dấu):', cancelMenu);
        return true;
    }

    if (step === 'awaiting_account_holder') {
        if (text.length < 3) {
            return ctx.reply('❌ Tên không hợp lệ! Vui lòng nhập lại:');
        }

        const profile = await userService.getUserProfile(ctx.from.id);
        const { bankName, accountNumber } = ctx.session.bankData;

        await userRepo.saveBankAccount(profile.id, bankName, accountNumber, text.toUpperCase());

        ctx.session.step = 'idle';
        ctx.session.bankData = null;

        await ctx.reply(
            `✅ *Thiết lập thành công!*\n\n🏦 Ngân hàng: ${bankName}\n💳 Số TK: ${accountNumber}\n👤 Chủ TK: ${text.toUpperCase()}`,
            { parse_mode: 'Markdown', ...mainMenu }
        );
        return true;
    }

    return false;
}

module.exports = { setupBankCallback, processBankInput };

