const linkRepo = require('../db/repositories/link-repository');
const userRepo = require('../db/repositories/user-repository');
const affiliateService = require('./affiliate-service');
const config = require('../config');
const logger = require('../utils/logger');

const linkService = {
    /**
     * Get the effective daily link limit for a user
     * @param {number} userId - User ID
     * @returns {Promise<{limit: number|null, isUnlimited: boolean}>} - limit is null if unlimited
     */
    async getUserDailyLimit(userId) {
        const user = await userRepo.findById(userId);
        if (!user) {
            return { limit: config.limits.dailyLinks, isUnlimited: false };
        }

        // Check user's custom daily_link_limit
        if (user.daily_link_limit === null || user.daily_link_limit === undefined) {
            // NULL = use global config
            return { limit: config.limits.dailyLinks, isUnlimited: false };
        } else if (user.daily_link_limit === 0) {
            // 0 = unlimited
            return { limit: null, isUnlimited: true };
        } else {
            // Positive number = custom limit
            return { limit: user.daily_link_limit, isUnlimited: false };
        }
    },

    async canCreateLink(userId) {
        const { limit, isUnlimited } = await this.getUserDailyLimit(userId);

        // Unlimited users can always create links
        if (isUnlimited) {
            return true;
        }

        const todayCount = await linkRepo.countByUserToday(userId);
        return todayCount < limit;
    },

    async getRemainingLinks(userId) {
        const { limit, isUnlimited } = await this.getUserDailyLimit(userId);

        // Return -1 for unlimited users (special indicator)
        if (isUnlimited) {
            return -1;
        }

        const todayCount = await linkRepo.countByUserToday(userId);
        return Math.max(0, limit - todayCount);
    },

    async createAffiliateLink(userId, originalUrl) {
        const canCreate = await this.canCreateLink(userId);
        if (!canCreate) {
            throw new Error('DAILY_LIMIT_REACHED');
        }

        logger.info('Converting link', { userId, originalUrl });
        
        const affiliateUrl = await affiliateService.convertLink(originalUrl);
        if (!affiliateUrl) {
            throw new Error('CONVERSION_FAILED');
        }

        const link = await linkRepo.create(userId, originalUrl, affiliateUrl);
        await userRepo.incrementTotalLinks(userId);

        logger.info('Link created', { userId, linkId: link.id });
        return link;
    },

    async getUserLinks(userId, limit = 10) {
        return linkRepo.findByUserId(userId, limit);
    }
};

module.exports = linkService;

