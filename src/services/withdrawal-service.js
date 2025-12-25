const withdrawalRepo = require('../db/repositories/withdrawal-repository');
const userRepo = require('../db/repositories/user-repository');
const config = require('../config');
const logger = require('../utils/logger');

const withdrawalService = {
    async canWithdraw(userId) {
        const user = await userRepo.findById(userId);
        if (!user) return { can: false, reason: 'USER_NOT_FOUND' };

        if (user.balance < config.limits.minWithdraw) {
            return { can: false, reason: 'INSUFFICIENT_BALANCE', minAmount: config.limits.minWithdraw };
        }

        const hasPending = await withdrawalRepo.hasPending(userId);
        if (hasPending) {
            return { can: false, reason: 'PENDING_EXISTS' };
        }

        const bankAccount = await userRepo.getBankAccount(userId);
        if (!bankAccount) {
            return { can: false, reason: 'NO_BANK_ACCOUNT' };
        }

        return { can: true, balance: user.balance, bankAccount };
    },

    async createWithdrawal(userId, amount) {
        const check = await this.canWithdraw(userId);
        if (!check.can) throw new Error(check.reason);

        const user = await userRepo.findById(userId);
        if (amount > user.balance) throw new Error('INSUFFICIENT_BALANCE');
        if (amount < config.limits.minWithdraw) throw new Error('BELOW_MINIMUM');

        const bankAccount = await userRepo.getBankAccount(userId);
        const withdrawal = await withdrawalRepo.create(userId, amount, bankAccount.id);
        await userRepo.deductBalance(userId, amount);

        logger.info('Withdrawal created', { userId, amount, withdrawalId: withdrawal.id });
        return withdrawal;
    },

    async approveWithdrawal(withdrawalId) {
        const withdrawal = await withdrawalRepo.findById(withdrawalId);
        if (!withdrawal) throw new Error('NOT_FOUND');
        if (withdrawal.status !== 'pending') throw new Error('NOT_PENDING');

        const approved = await withdrawalRepo.approve(withdrawalId);
        logger.info('Withdrawal approved', { withdrawalId });
        return approved;
    },

    async completeWithdrawal(withdrawalId) {
        const withdrawal = await withdrawalRepo.findById(withdrawalId);
        if (!withdrawal) throw new Error('NOT_FOUND');

        const completed = await withdrawalRepo.complete(withdrawalId);
        logger.info('Withdrawal completed', { withdrawalId });
        return completed;
    },

    async rejectWithdrawal(withdrawalId, adminNote = null) {
        const withdrawal = await withdrawalRepo.findById(withdrawalId);
        if (!withdrawal) throw new Error('NOT_FOUND');
        if (withdrawal.status !== 'pending') throw new Error('NOT_PENDING');

        // Refund balance
        await userRepo.addBalance(withdrawal.user_id, withdrawal.amount);
        const rejected = await withdrawalRepo.reject(withdrawalId, adminNote);
        
        logger.info('Withdrawal rejected', { withdrawalId, adminNote });
        return rejected;
    },

    async getUserWithdrawals(userId) {
        return withdrawalRepo.findByUserId(userId);
    },

    async getPendingWithdrawals() {
        return withdrawalRepo.findPending();
    }
};

module.exports = withdrawalService;

