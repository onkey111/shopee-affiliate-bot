const userService = require('../../services/user-service');
const withdrawalService = require('../../services/withdrawal-service');
const userRepo = require('../../db/repositories/user-repository');
const { mainMenu, cancelMenu, confirmWithdraw, bankSetupPrompt } = require('../keyboards');
const { currency } = require('../../utils/formatters');
const config = require('../../config');

async function withdrawHandler(ctx) {
    const profile = await userService.getUserProfile(ctx.from.id);
    if (!profile) {
        return ctx.reply('Vui lòng /start trước!');
    }

    const check = await withdrawalService.canWithdraw(profile.id);

    if (!check.can) {
        if (check.reason === 'NO_BANK_ACCOUNT') {
            return ctx.reply(
                '❌ Bạn chưa thiết lập tài khoản ngân hàng!\n\nVui lòng thiết lập trước khi rút tiền.',
                bankSetupPrompt
            );
        }
        if (check.reason === 'INSUFFICIENT_BALANCE') {
            return ctx.reply(`❌ Số dư không đủ!\n\nSố dư tối thiểu để rút: ${currency(config.limits.minWithdraw)}`, mainMenu);
        }
        if (check.reason === 'PENDING_EXISTS') {
            return ctx.reply('❌ Bạn đang có yêu cầu rút tiền chờ xử lý!', mainMenu);
        }
        return ctx.reply('❌ Không thể rút tiền lúc này.', mainMenu);
    }

    ctx.session.step = 'awaiting_withdraw_amount';
    ctx.session.withdrawData = { balance: check.balance };

    await ctx.reply(
        `💸 *Rút tiền*\n\nSố dư: ${currency(check.balance)}\nTối thiểu: ${currency(config.limits.minWithdraw)}\n\nNhập số tiền muốn rút:`,
        { parse_mode: 'Markdown', ...cancelMenu }
    );
}

async function processWithdrawInput(ctx) {
    const step = ctx.session.step;
    const text = ctx.message.text;

    if (text === '❌ Hủy') {
        ctx.session.step = 'idle';
        ctx.session.withdrawData = null;
        return ctx.reply('Đã hủy.', mainMenu);
    }

    if (step === 'awaiting_withdraw_amount') {
        const amount = parseInt(text.replace(/[^\d]/g, ''));
        if (isNaN(amount) || amount < config.limits.minWithdraw) {
            return ctx.reply(`❌ Số tiền không hợp lệ! Tối thiểu: ${currency(config.limits.minWithdraw)}`);
        }
        if (amount > ctx.session.withdrawData.balance) {
            return ctx.reply(`❌ Số dư không đủ! Số dư hiện tại: ${currency(ctx.session.withdrawData.balance)}`);
        }

        ctx.session.withdrawData.amount = amount;
        ctx.session.step = 'confirm_withdraw';

        const profile = await userService.getUserProfile(ctx.from.id);
        const bank = profile.bank_account;

        await ctx.reply(
            `📋 *Xác nhận rút tiền*\n\nSố tiền: ${currency(amount)}\nNgân hàng: ${bank.bank_name}\nSố TK: ${bank.account_number}\nChủ TK: ${bank.account_holder}\n\nXác nhận rút tiền?`,
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
        await ctx.answerCbQuery('Phiên đã hết hạn!');
        return ctx.reply('Vui lòng thử lại.', mainMenu);
    }

    try {
        await withdrawalService.createWithdrawal(profile.id, amount);
        ctx.session.step = 'idle';
        ctx.session.withdrawData = null;

        await ctx.answerCbQuery('Thành công!');
        await ctx.editMessageText(`✅ *Yêu cầu rút tiền thành công!*\n\nSố tiền: ${currency(amount)}\nTrạng thái: Đang xử lý\n\nChúng tôi sẽ xử lý trong 24h.`, { parse_mode: 'Markdown' });
        await ctx.reply('Chọn chức năng tiếp theo:', mainMenu);
    } catch (err) {
        await ctx.answerCbQuery('Lỗi!');
        await ctx.reply('❌ Không thể tạo yêu cầu rút tiền. Vui lòng thử lại!', mainMenu);
    }
}

async function cancelWithdrawCallback(ctx) {
    ctx.session.step = 'idle';
    ctx.session.withdrawData = null;
    await ctx.answerCbQuery('Đã hủy');
    await ctx.editMessageText('❌ Đã hủy yêu cầu rút tiền.');
    await ctx.reply('Chọn chức năng:', mainMenu);
}

module.exports = { withdrawHandler, processWithdrawInput, confirmWithdrawCallback, cancelWithdrawCallback };

