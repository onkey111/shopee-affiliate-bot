const userRepo = require('../db/repositories/user-repository');
const { generateRefCode } = require('../utils/ref-code-generator');

const userService = {
    async getOrCreateUser(telegramUser, referrerCode = null) {
        let user = await userRepo.findByTelegramId(telegramUser.id);
        
        if (user) return user;

        let referredBy = null;
        if (referrerCode) {
            const referrer = await userRepo.findByRefCode(referrerCode);
            if (referrer && referrer.telegram_id !== telegramUser.id) {
                referredBy = referrer.id;
            }
        }

        let refCode;
        let attempts = 0;
        do {
            refCode = generateRefCode();
            const existing = await userRepo.findByRefCode(refCode);
            if (!existing) break;
            attempts++;
        } while (attempts < 10);

        user = await userRepo.create({
            telegramId: telegramUser.id,
            username: telegramUser.username || null,
            firstName: telegramUser.first_name || 'User',
            refCode,
            referredBy
        });

        return user;
    },

    async getUserProfile(telegramId) {
        const user = await userRepo.findByTelegramId(telegramId);
        if (!user) return null;

        const referralCount = await userRepo.countReferrals(user.id);
        const bankAccount = await userRepo.getBankAccount(user.id);

        return {
            ...user,
            referral_count: referralCount,
            bank_account: bankAccount
        };
    },

    async getReferrer(userId) {
        const user = await userRepo.findById(userId);
        if (!user || !user.referred_by) return null;
        return userRepo.findById(user.referred_by);
    }
};

module.exports = userService;

