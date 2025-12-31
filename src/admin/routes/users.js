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
            globalDailyLimit: config.limits.dailyLinks
        });
    } catch (err) {
        req.flash('error', 'Loi tai du lieu');
        res.render('admin/users', { users: [], globalDailyLimit: config.limits.dailyLinks });
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
            globalDailyLimit: config.limits.dailyLinks
        });
    } catch (err) {
        req.flash('error', 'Loi tai du lieu');
        res.redirect('/admin/users');
    }
});

// Update user's daily link limit
router.post('/:id/daily-limit', async (req, res) => {
    try {
        const userId = req.params.id;
        const { daily_link_limit } = req.body;

        // Validate input
        let limitValue = null;
        if (daily_link_limit === '' || daily_link_limit === 'null') {
            // Use global config (NULL)
            limitValue = null;
        } else if (daily_link_limit === '0' || daily_link_limit === 'unlimited') {
            // Unlimited
            limitValue = 0;
        } else {
            const parsed = parseInt(daily_link_limit, 10);
            if (isNaN(parsed) || parsed < 0) {
                req.flash('error', 'Gia tri khong hop le');
                return res.redirect(`/admin/users/${userId}`);
            }
            limitValue = parsed;
        }

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

