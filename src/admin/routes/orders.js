const express = require('express');
const router = express.Router();
const orderService = require('../../services/order-service');
const { getBotInstance } = require('../../bot');
const { currency } = require('../../utils/formatters');

router.get('/', async (req, res) => {
    try {
        const orders = await orderService.getPendingOrders();
        res.render('admin/orders', { orders });
    } catch (err) {
        req.flash('error', 'Loi tai du lieu');
        res.render('admin/orders', { orders: [] });
    }
});

router.post('/:id/approve', async (req, res) => {
    try {
        const { commission } = req.body;
        const commissionTotal = parseFloat(commission);
        
        if (isNaN(commissionTotal) || commissionTotal <= 0) {
            req.flash('error', 'So tien hoa hong khong hop le!');
            return res.redirect('/admin/orders');
        }

        const order = await orderService.approveOrder(req.params.id, commissionTotal);
        
        // Notify user via bot
        const bot = getBotInstance();
        if (bot && order) {
            try {
                const userResult = await require('../../db/connection').query(
                    'SELECT telegram_id FROM users WHERE id = $1',
                    [order.user_id]
                );
                if (userResult.rows[0]) {
                    await bot.telegram.sendMessage(
                        userResult.rows[0].telegram_id,
                        `✅ Don hang #${order.shopee_order_id.slice(-6)} da duoc duyet!\n\nHoa hong: ${currency(order.user_commission)}`
                    );
                }
            } catch (e) {}
        }

        req.flash('success', 'Da duyet don hang!');
    } catch (err) {
        req.flash('error', 'Loi: ' + err.message);
    }
    res.redirect('/admin/orders');
});

router.post('/:id/reject', async (req, res) => {
    try {
        const { note } = req.body;
        await orderService.rejectOrder(req.params.id, note);
        req.flash('success', 'Da tu choi don hang!');
    } catch (err) {
        req.flash('error', 'Loi: ' + err.message);
    }
    res.redirect('/admin/orders');
});

module.exports = router;

