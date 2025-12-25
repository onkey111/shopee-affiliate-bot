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
        `🏦 *Thiet lap tai khoan ngan hang*\n\nChon ngan hang (nhap so hoac ten):\n\n${bankList}`,
        { parse_mode: 'Markdown', ...cancelMenu }
    );
}

async function processBankInput(ctx) {
    const step = ctx.session.step;
    const text = ctx.message.text;

    if (text === '❌ Huy') {
        ctx.session.step = 'idle';
        ctx.session.bankData = null;
        return ctx.reply('Da huy.', mainMenu);
    }

    if (step === 'awaiting_bank_name') {
        let bankName = text;
        const num = parseInt(text);
        if (!isNaN(num) && num >= 1 && num <= BANKS.length) {
            bankName = BANKS[num - 1];
        }

        ctx.session.bankData.bankName = bankName;
        ctx.session.step = 'awaiting_account_number';
        await ctx.reply('Nhap so tai khoan:', cancelMenu);
        return true;
    }

    if (step === 'awaiting_account_number') {
        if (!/^\d{6,20}$/.test(text.replace(/\s/g, ''))) {
            return ctx.reply('❌ So tai khoan khong hop le! Vui long nhap lai:');
        }

        ctx.session.bankData.accountNumber = text.replace(/\s/g, '');
        ctx.session.step = 'awaiting_account_holder';
        await ctx.reply('Nhap ten chu tai khoan (khong dau):', cancelMenu);
        return true;
    }

    if (step === 'awaiting_account_holder') {
        if (text.length < 3) {
            return ctx.reply('❌ Ten khong hop le! Vui long nhap lai:');
        }

        const profile = await userService.getUserProfile(ctx.from.id);
        const { bankName, accountNumber } = ctx.session.bankData;

        await userRepo.saveBankAccount(profile.id, bankName, accountNumber, text.toUpperCase());

        ctx.session.step = 'idle';
        ctx.session.bankData = null;

        await ctx.reply(
            `✅ *Thiet lap thanh cong!*\n\n🏦 Ngan hang: ${bankName}\n💳 So TK: ${accountNumber}\n👤 Chu TK: ${text.toUpperCase()}`,
            { parse_mode: 'Markdown', ...mainMenu }
        );
        return true;
    }

    return false;
}

module.exports = { setupBankCallback, processBankInput };

