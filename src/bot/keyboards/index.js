const { Markup } = require('telegraf');

const mainMenu = Markup.keyboard([
    ['🔗 Tao link', '📦 Gui don'],
    ['📊 Thong ke', '💰 So du'],
    ['🏦 Rut tien', '👥 Gioi thieu'],
    ['📋 Lich su']
]).resize();

const cancelMenu = Markup.keyboard([
    ['❌ Huy']
]).resize();

const confirmWithdraw = Markup.inlineKeyboard([
    [Markup.button.callback('✅ Xac nhan', 'confirm_withdraw')],
    [Markup.button.callback('❌ Huy', 'cancel_withdraw')]
]);

const bankSetupPrompt = Markup.inlineKeyboard([
    [Markup.button.callback('🏦 Thiet lap ngan hang', 'setup_bank')]
]);

module.exports = {
    mainMenu,
    cancelMenu,
    confirmWithdraw,
    bankSetupPrompt
};

