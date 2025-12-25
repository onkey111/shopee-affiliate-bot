const express = require('express');
const router = express.Router();
const withdrawalService = require('../../services/withdrawal-service');
const { getBotInstance } = require('../../bot');
const { currency } = require('../../utils/formatters');

router.get('/', async (req, res) => {
    try {
        const withdrawals = await withdrawalService.getPendingWithdrawals();
        res.render('admin/withdrawals', { withdrawals });
    } catch (err) {
        req.flash('error', 'Loi tai du lieu');
        res.render('admin/withdrawals', { withdrawals: [] });
    }
});

router.post('/:id/complete', async (req, res) => {
    try {
        const withdrawal = await withdrawalService.completeWithdrawal(req.params.id);
        
        // Notify user
        const bot = getBotInstance();
        if (bot && withdrawal) {
            try {
                const userResult = await require('../../db/connection').query(
                    'SELECT telegram_id FROM users WHERE id = $1',
                    [withdrawal.user_id]
                );
                if (userResult.rows[0]) {
                    await bot.telegram.sendMessage(
                        userResult.rows[0].telegram_id,
                        `✅ Yeu cau rut tien ${currency(withdrawal.amount)} da duoc xu ly!\n\nVui long kiem tra tai khoan ngan hang.`
                    );
                }
            } catch (e) {}
        }

        req.flash('success', 'Da hoan thanh!');
    } catch (err) {
        req.flash('error', 'Loi: ' + err.message);
    }
    res.redirect('/admin/withdrawals');
});

router.post('/:id/reject', async (req, res) => {
    try {
        const { note } = req.body;
        const withdrawal = await withdrawalService.rejectWithdrawal(req.params.id, note);
        
        // Notify user
        const bot = getBotInstance();
        if (bot && withdrawal) {
            try {
                const userResult = await require('../../db/connection').query(
                    'SELECT telegram_id FROM users WHERE id = $1',
                    [withdrawal.user_id]
                );
                if (userResult.rows[0]) {
                    await bot.telegram.sendMessage(
                        userResult.rows[0].telegram_id,
                        `❌ Yeu cau rut tien ${currency(withdrawal.amount)} bi tu choi.\n\nLy do: ${note || 'Khong ro'}\n\nSo du da duoc hoan lai.`
                    );
                }
            } catch (e) {}
        }

        req.flash('success', 'Da tu choi!');
    } catch (err) {
        req.flash('error', 'Loi: ' + err.message);
    }
    res.redirect('/admin/withdrawals');
});

module.exports = router;

