const linkRepo = require('../db/repositories/link-repository');
const userRepo = require('../db/repositories/user-repository');
const affiliateService = require('./affiliate-service');
const config = require('../config');
const logger = require('../utils/logger');

const linkService = {
    /**
     * Check if user has unlimited link creation (daily_link_limit = 0)
     * @param {number} userId - User ID
     * @returns {Promise<boolean>} True if user has unlimited access
     */
    async isUnlimitedUser(userId) {
        const user = await userRepo.findById(userId);
        return user && user.daily_link_limit === 0;
    },

    /**
     * Get rate limit status for a user using burst + cooldown system
     * @param {number} userId - User ID
     * @returns {Promise<{canCreate: boolean, burstRemaining: number, cooldownSecondsLeft: number, isUnlimited: boolean}>}
     */
    async getRateLimitStatus(userId) {
        // Check if user has unlimited access
        if (await this.isUnlimitedUser(userId)) {
            return {
                canCreate: true,
                burstRemaining: -1,
                cooldownSecondsLeft: 0,
                isUnlimited: true
            };
        }

        const { burstLimit, burstWindowMinutes, cooldownMinutes } = config.limits;

        // Get links created in burst window
        const linksInWindow = await linkRepo.countInWindow(userId, burstWindowMinutes);
        const burstRemaining = Math.max(0, burstLimit - linksInWindow);

        // If burst is available, user can create
        if (burstRemaining > 0) {
            return {
                canCreate: true,
                burstRemaining,
                cooldownSecondsLeft: 0,
                isUnlimited: false
            };
        }

        // Burst exhausted - check cooldown from last link
        const lastCreationTime = await linkRepo.getLastCreationTime(userId);
        if (!lastCreationTime) {
            // No links ever created, can create
            return {
                canCreate: true,
                burstRemaining: burstLimit,
                cooldownSecondsLeft: 0,
                isUnlimited: false
            };
        }

        const now = new Date();
        const cooldownMs = cooldownMinutes * 60 * 1000;
        const timeSinceLastLink = now.getTime() - lastCreationTime.getTime();
        const cooldownSecondsLeft = Math.max(0, Math.ceil((cooldownMs - timeSinceLastLink) / 1000));

        return {
            canCreate: cooldownSecondsLeft === 0,
            burstRemaining: 0,
            cooldownSecondsLeft,
            isUnlimited: false
        };
    },

    /**
     * Check if user can create a new link
     * @param {number} userId - User ID
     * @returns {Promise<boolean>}
     */
    async canCreateLink(userId) {
        const status = await this.getRateLimitStatus(userId);
        return status.canCreate;
    },

    /**
     * Get remaining links info for display to user
     * Returns object with burst remaining and cooldown info
     * @param {number} userId - User ID
     * @returns {Promise<{burstRemaining: number, cooldownSecondsLeft: number, isUnlimited: boolean}>}
     */
    async getRemainingLinks(userId) {
        const status = await this.getRateLimitStatus(userId);
        return {
            burstRemaining: status.burstRemaining,
            cooldownSecondsLeft: status.cooldownSecondsLeft,
            isUnlimited: status.isUnlimited
        };
    },

    /**
     * Format cooldown time for display
     * @param {number} seconds - Cooldown seconds remaining
     * @returns {string} Formatted time string
     */
    formatCooldownTime(seconds) {
        if (seconds <= 0) return '0 giây';

        const minutes = Math.floor(seconds / 60);
        const remainingSeconds = seconds % 60;

        if (minutes > 0) {
            return remainingSeconds > 0
                ? `${minutes} phút ${remainingSeconds} giây`
                : `${minutes} phút`;
        }
        return `${remainingSeconds} giây`;
    },

    async createAffiliateLink(userId, originalUrl) {
        const status = await this.getRateLimitStatus(userId);
        if (!status.canCreate) {
            const error = new Error('RATE_LIMIT_REACHED');
            error.cooldownSecondsLeft = status.cooldownSecondsLeft;
            throw error;
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

