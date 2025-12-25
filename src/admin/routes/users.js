const express = require('express');
const router = express.Router();
const db = require('../../db/connection');

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
        res.render('admin/users', { users: result.rows });
    } catch (err) {
        req.flash('error', 'Loi tai du lieu');
        res.render('admin/users', { users: [] });
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
            bankAccount: bankResult.rows[0]
        });
    } catch (err) {
        req.flash('error', 'Loi tai du lieu');
        res.redirect('/admin/users');
    }
});

module.exports = router;

