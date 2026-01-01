const express = require('express');
const router = express.Router();
const db = require('../../db/connection');
const config = require('../../config');

router.get('/', async (req, res) => {
    try {
        const result = await db.query(`
            SELECT u.*,
                   (SELECT COUNT(*) FROM users WHERE referred_by = u.id) as referral_count,
                   (SELECT COUNT(*) FROM orders WHERE user_id = u.id AND status = 'approved') as order_count
            FROM users u
            ORDER BY u.created_at DESC
            LIMIT 100
        `);
        res.render('admin/users', {
            users: result.rows,
            burstLimit: config.limits.burstLimit,
            burstWindowMinutes: config.limits.burstWindowMinutes,
            cooldownMinutes: config.limits.cooldownMinutes
        });
    } catch (err) {
        req.flash('error', 'Loi tai du lieu');
        res.render('admin/users', {
            users: [],
            burstLimit: config.limits.burstLimit,
            burstWindowMinutes: config.limits.burstWindowMinutes,
            cooldownMinutes: config.limits.cooldownMinutes
        });
    }
});

router.get('/:id', async (req, res) => {
    try {
        const userResult = await db.query('SELECT * FROM users WHERE id = $1', [req.params.id]);
        if (!userResult.rows[0]) {
            req.flash('error', 'Khong tim thay user');
            return res.redirect('/admin/users');
        }

        const [ordersResult, withdrawalsResult, bankResult] = await Promise.all([
            db.query('SELECT * FROM orders WHERE user_id = $1 ORDER BY created_at DESC LIMIT 20', [req.params.id]),
            db.query('SELECT * FROM withdrawals WHERE user_id = $1 ORDER BY created_at DESC LIMIT 20', [req.params.id]),
            db.query('SELECT * FROM bank_accounts WHERE user_id = $1', [req.params.id])
        ]);

        res.render('admin/user-detail', {
            user: userResult.rows[0],
            orders: ordersResult.rows,
            withdrawals: withdrawalsResult.rows,
            bankAccount: bankResult.rows[0],
            burstLimit: config.limits.burstLimit,
            burstWindowMinutes: config.limits.burstWindowMinutes,
            cooldownMinutes: config.limits.cooldownMinutes
        });
    } catch (err) {
        req.flash('error', 'Loi tai du lieu');
        res.redirect('/admin/users');
    }
});

// Update user's rate limit setting (unlimited or default)
router.post('/:id/rate-limit', async (req, res) => {
    try {
        const userId = req.params.id;
        const { rate_limit_setting } = req.body;

        // Validate input: only 'default' (NULL) or 'unlimited' (0) allowed
        let limitValue = null;
        if (rate_limit_setting === 'unlimited') {
            limitValue = 0;
        }
        // else keep NULL for default burst+cooldown behavior

        await db.query(
            'UPDATE users SET daily_link_limit = $1, updated_at = NOW() WHERE id = $2',
            [limitValue, userId]
        );

        req.flash('success', 'Cap nhat gioi han thanh cong');
        res.redirect(`/admin/users/${userId}`);
    } catch (err) {
        req.flash('error', 'Loi cap nhat gioi han');
        res.redirect(`/admin/users/${req.params.id}`);
    }
});

module.exports = router;

