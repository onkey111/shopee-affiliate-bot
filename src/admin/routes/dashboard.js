const express = require('express');
const router = express.Router();
const db = require('../../db/connection');
const orderRepo = require('../../db/repositories/order-repository');
const withdrawalRepo = require('../../db/repositories/withdrawal-repository');

router.get('/', async (req, res) => {
    try {
        const [usersResult, ordersResult, withdrawalsResult] = await Promise.all([
            db.query('SELECT COUNT(*) as count FROM users'),
            db.query(`SELECT 
                COUNT(*) FILTER (WHERE status = 'pending') as pending,
                COUNT(*) FILTER (WHERE status = 'approved') as approved,
                COALESCE(SUM(commission_total) FILTER (WHERE status = 'approved'), 0) as total_commission
                FROM orders`),
            db.query(`SELECT 
                COUNT(*) FILTER (WHERE status = 'pending') as pending,
                COALESCE(SUM(amount) FILTER (WHERE status = 'completed'), 0) as total_paid
                FROM withdrawals`)
        ]);

        const stats = {
            totalUsers: usersResult.rows[0].count,
            pendingOrders: ordersResult.rows[0].pending,
            approvedOrders: ordersResult.rows[0].approved,
            totalCommission: ordersResult.rows[0].total_commission,
            pendingWithdrawals: withdrawalsResult.rows[0].pending,
            totalPaid: withdrawalsResult.rows[0].total_paid
        };

        res.render('admin/dashboard', { stats });
    } catch (err) {
        req.flash('error', 'Loi tai du lieu');
        res.render('admin/dashboard', { stats: {} });
    }
});

module.exports = router;

