const userService = require('../../services/user-service');
const orderService = require('../../services/order-service');
const withdrawalService = require('../../services/withdrawal-service');
const { mainMenu } = require('../keyboards');
const { currency, datetime } = require('../../utils/formatters');

async function historyCommand(ctx) {
    const profile = await userService.getUserProfile(ctx.from.id);
    if (!profile) {
        return ctx.reply('Vui lòng /start trước!');
    }

    const orders = await orderService.getUserOrders(profile.id);
    const withdrawals = await withdrawalService.getUserWithdrawals(profile.id);

    let msg = '📋 *Lịch sử giao dịch*\n\n';

    msg += '📦 *Đơn hàng gần đây:*\n';
    if (orders.length === 0) {
        msg += '_Chưa có đơn hàng nào_\n';
    } else {
        orders.slice(0, 5).forEach((o, i) => {
            const statusIcon = o.status === 'approved' ? '✅' : o.status === 'rejected' ? '❌' : '⏳';
            msg += `${i + 1}. ${statusIcon} #${o.shopee_order_id.slice(-6)} - ${o.status === 'approved' ? currency(o.user_commission) : o.status}\n`;
        });
    }

    msg += '\n💸 *Rút tiền gần đây:*\n';
    if (withdrawals.length === 0) {
        msg += '_Chưa có yêu cầu rút tiền nào_\n';
    } else {
        withdrawals.slice(0, 5).forEach((w, i) => {
            const statusIcon = w.status === 'completed' ? '✅' : w.status === 'rejected' ? '❌' : '⏳';
            msg += `${i + 1}. ${statusIcon} ${currency(w.amount)} - ${w.status}\n`;
        });
    }

    await ctx.reply(msg, { parse_mode: 'Markdown', ...mainMenu });
}

module.exports = historyCommand;

