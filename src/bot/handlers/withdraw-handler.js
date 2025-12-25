const userService = require('../../services/user-service');
const withdrawalService = require('../../services/withdrawal-service');
const userRepo = require('../../db/repositories/user-repository');
const { mainMenu, cancelMenu, confirmWithdraw, bankSetupPrompt } = require('../keyboards');
const { currency } = require('../../utils/formatters');
const config = require('../../config');

async function withdrawHandler(ctx) {
    const profile = await userService.getUserProfile(ctx.from.id);
    if (!profile) {
        return ctx.reply('Vui long /start truoc!');
    }

    const check = await withdrawalService.canWithdraw(profile.id);
    
    if (!check.can) {
        if (check.reason === 'NO_BANK_ACCOUNT') {
            return ctx.reply(
                '❌ Ban chua thiet lap tai khoan ngan hang!\n\nVui long thiet lap truoc khi rut tien.',
                bankSetupPrompt
            );
        }
        if (check.reason === 'INSUFFICIENT_BALANCE') {
            return ctx.reply(`❌ So du khong du!\n\nSo du toi thieu de rut: ${currency(config.limits.minWithdraw)}`, mainMenu);
        }
        if (check.reason === 'PENDING_EXISTS') {
            return ctx.reply('❌ Ban dang co yeu cau rut tien cho xu ly!', mainMenu);
        }
        return ctx.reply('❌ Khong the rut tien luc nay.', mainMenu);
    }

    ctx.session.step = 'awaiting_withdraw_amount';
    ctx.session.withdrawData = { balance: check.balance };

    await ctx.reply(
        `💸 *Rut tien*\n\nSo du: ${currency(check.balance)}\nToi thieu: ${currency(config.limits.minWithdraw)}\n\nNhap so tien muon rut:`,
        { parse_mode: 'Markdown', ...cancelMenu }
    );
}

async function processWithdrawInput(ctx) {
    const step = ctx.session.step;
    const text = ctx.message.text;

    if (text === '❌ Huy') {
        ctx.session.step = 'idle';
        ctx.session.withdrawData = null;
        return ctx.reply('Da huy.', mainMenu);
    }

    if (step === 'awaiting_withdraw_amount') {
        const amount = parseInt(text.replace(/[^\d]/g, ''));
        if (isNaN(amount) || amount < config.limits.minWithdraw) {
            return ctx.reply(`❌ So tien khong hop le! Toi thieu: ${currency(config.limits.minWithdraw)}`);
        }
        if (amount > ctx.session.withdrawData.balance) {
            return ctx.reply(`❌ So du khong du! So du hien tai: ${currency(ctx.session.withdrawData.balance)}`);
        }

        ctx.session.withdrawData.amount = amount;
        ctx.session.step = 'confirm_withdraw';

        const profile = await userService.getUserProfile(ctx.from.id);
        const bank = profile.bank_account;

        await ctx.reply(
            `📋 *Xac nhan rut tien*\n\nSo tien: ${currency(amount)}\nNgan hang: ${bank.bank_name}\nSo TK: ${bank.account_number}\nChu TK: ${bank.account_holder}\n\nXac nhan rut tien?`,
            { parse_mode: 'Markdown', ...confirmWithdraw }
        );
        return true;
    }

    return false;
}

async function confirmWithdrawCallback(ctx) {
    const profile = await userService.getUserProfile(ctx.from.id);
    const amount = ctx.session.withdrawData?.amount;

    if (!amount) {
        await ctx.answerCbQuery('Phien da het han!');
        return ctx.reply('Vui long thu lai.', mainMenu);
    }

    try {
        await withdrawalService.createWithdrawal(profile.id, amount);
        ctx.session.step = 'idle';
        ctx.session.withdrawData = null;

        await ctx.answerCbQuery('Thanh cong!');
        await ctx.editMessageText(`✅ *Yeu cau rut tien thanh cong!*\n\nSo tien: ${currency(amount)}\nTrang thai: Dang xu ly\n\nChung toi se xu ly trong 24h.`, { parse_mode: 'Markdown' });
        await ctx.reply('Chon chuc nang tiep theo:', mainMenu);
    } catch (err) {
        await ctx.answerCbQuery('Loi!');
        await ctx.reply('❌ Khong the tao yeu cau rut tien. Vui long thu lai!', mainMenu);
    }
}

async function cancelWithdrawCallback(ctx) {
    ctx.session.step = 'idle';
    ctx.session.withdrawData = null;
    await ctx.answerCbQuery('Da huy');
    await ctx.editMessageText('❌ Da huy yeu cau rut tien.');
    await ctx.reply('Chon chuc nang:', mainMenu);
}

module.exports = { withdrawHandler, processWithdrawInput, confirmWithdrawCallback, cancelWithdrawCallback };

