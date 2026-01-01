/**
 * Script to reset rate limits for all users (emergency use only)
 * This shifts link creation timestamps back to allow immediate link creation
 * Run: node scripts/reset-daily-links.js
 *
 * NOTE: The new rate limit system uses burst + cooldown based on link timestamps
 * - Burst: 10 links within 1 hour window
 * - Cooldown: 1 link per 30 minutes after burst exhausted
 * This script shifts recent link timestamps to bypass rate limits
 */

require('dotenv').config();
const { Pool } = require('pg');
const config = require('../src/config');

async function resetRateLimits() {
    const pool = new Pool(config.db);
    const { burstWindowMinutes, cooldownMinutes } = config.limits;

    // Shift links back by the larger of burst window or cooldown to fully reset
    const shiftMinutes = Math.max(burstWindowMinutes, cooldownMinutes) + 5;

    try {
        console.log('🔄 Connecting to database...');
        console.log(`📊 Rate limit config: ${config.limits.burstLimit} links/${burstWindowMinutes}min burst, ${cooldownMinutes}min cooldown`);

        // Count links in current rate limit window before reset
        const beforeCount = await pool.query(`
            SELECT COUNT(*) as count FROM links
            WHERE created_at > NOW() - INTERVAL '${burstWindowMinutes} minutes'
        `);
        console.log(`📊 Links in burst window before reset: ${beforeCount.rows[0].count}`);

        // Shift recent link timestamps back to bypass rate limits
        const result = await pool.query(`
            UPDATE links
            SET created_at = created_at - INTERVAL '${shiftMinutes} minutes'
            WHERE created_at > NOW() - INTERVAL '${shiftMinutes} minutes'
        `);

        console.log(`✅ Shifted ${result.rowCount} link timestamps back by ${shiftMinutes} minutes`);

        // Show stats after reset
        const afterCount = await pool.query(`
            SELECT COUNT(*) as count FROM links
            WHERE created_at > NOW() - INTERVAL '${burstWindowMinutes} minutes'
        `);
        console.log(`📊 Links in burst window after reset: ${afterCount.rows[0].count}`);

        const stats = await pool.query(`
            SELECT COUNT(*) as total_users FROM users
        `);
        console.log(`📊 Total users in system: ${stats.rows[0].total_users}`);
        console.log(`🎉 All users can now create links (burst: ${config.limits.burstLimit} links)!`);

    } catch (error) {
        console.error('❌ Error:', error.message);
        process.exit(1);
    } finally {
        await pool.end();
        console.log('🔌 Database connection closed');
    }
}

resetRateLimits();

