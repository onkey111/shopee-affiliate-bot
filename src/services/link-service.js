const linkRepo = require('../db/repositories/link-repository');
const userRepo = require('../db/repositories/user-repository');
const affiliateService = require('./affiliate-service');
const config = require('../config');
const logger = require('../utils/logger');

const linkService = {
    async canCreateLink(userId) {
        const todayCount = await linkRepo.countByUserToday(userId);
        return todayCount < config.limits.dailyLinks;
    },

    async getRemainingLinks(userId) {
        const todayCount = await linkRepo.countByUserToday(userId);
        return Math.max(0, config.limits.dailyLinks - todayCount);
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

