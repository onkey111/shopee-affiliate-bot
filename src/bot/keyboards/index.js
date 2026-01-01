const { Markup } = require('telegraf');

const mainMenu = Markup.keyboard([
    ['🔗 Tạo link', '📦 Gửi đơn'],
    ['📊 Thống kê', '💰 Số dư'],
    ['🏦 Rút tiền', '👥 Giới thiệu'],
    ['📋 Lịch sử']
]).resize();

const cancelMenu = Markup.keyboard([
    ['❌ Hủy']
]).resize();

const confirmWithdraw = Markup.inlineKeyboard([
    [Markup.button.callback('✅ Xác nhận', 'confirm_withdraw')],
    [Markup.button.callback('❌ Hủy', 'cancel_withdraw')]
]);

const bankSetupPrompt = Markup.inlineKeyboard([
    [Markup.button.callback('🏦 Thiết lập ngân hàng', 'setup_bank')]
]);

module.exports = {
    mainMenu,
    cancelMenu,
    confirmWithdraw,
    bankSetupPrompt
};

