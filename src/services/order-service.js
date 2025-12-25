const orderRepo = require('../db/repositories/order-repository');
const userRepo = require('../db/repositories/user-repository');
const commissionRepo = require('../db/repositories/commission-repository');
const userService = require('./user-service');
const config = require('../config');
const logger = require('../utils/logger');

const orderService = {
    async submitOrder(userId, shopeeOrderId) {
        const existing = await orderRepo.findByShopeeOrderId(shopeeOrderId);
        if (existing) {
            throw new Error('ORDER_EXISTS');
        }

        const order = await orderRepo.create(userId, shopeeOrderId);
        logger.info('Order submitted', { userId, orderId: order.id, shopeeOrderId });
        return order;
    },

    async approveOrder(orderId, commissionTotal) {
        const order = await orderRepo.findById(orderId);
        if (!order) throw new Error('ORDER_NOT_FOUND');
        if (order.status !== 'pending') throw new Error('ORDER_NOT_PENDING');

        const user = await userRepo.findById(order.user_id);
        const referrer = await userService.getReferrer(order.user_id);

        const userCommission = commissionTotal * config.commission.user;
        const ownerCommission = commissionTotal * config.commission.owner;
        let referrerCommission = 0;

        if (referrer) {
            referrerCommission = commissionTotal * config.commission.referrer;
        } else {
            // No referrer, owner gets referrer share too
        }

        const commissionData = {
            commission_total: commissionTotal,
            user_commission: userCommission,
            referrer_commission: referrerCommission,
            owner_commission: ownerCommission + (referrer ? 0 : commissionTotal * config.commission.referrer)
        };

        const approved = await orderRepo.approve(orderId, commissionData);
        await userRepo.addBalance(order.user_id, userCommission);

        if (referrer && referrerCommission > 0) {
            await userRepo.addBalance(referrer.id, referrerCommission);
            await commissionRepo.create(referrer.id, order.user_id, orderId, referrerCommission);
        }

        logger.info('Order approved', { orderId, commissionTotal, userCommission });
        return approved;
    },

    async rejectOrder(orderId, adminNote = null) {
        const order = await orderRepo.findById(orderId);
        if (!order) throw new Error('ORDER_NOT_FOUND');
        if (order.status !== 'pending') throw new Error('ORDER_NOT_PENDING');

        const rejected = await orderRepo.reject(orderId, adminNote);
        logger.info('Order rejected', { orderId, adminNote });
        return rejected;
    },

    async getUserOrders(userId, status = null) {
        return orderRepo.findByUserId(userId, status);
    },

    async getPendingOrders() {
        return orderRepo.findPending();
    },

    async getUserStats(userId) {
        return orderRepo.getStats(userId);
    }
};

module.exports = orderService;

