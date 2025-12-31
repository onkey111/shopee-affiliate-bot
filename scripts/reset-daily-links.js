/**
 * Script reset số lần tạo link hàng ngày cho tất cả users
 * Chạy: node scripts/reset-daily-links.js
 *
 * LƯU Ý: Hệ thống đếm limit dựa trên số link trong bảng `links` được tạo trong ngày
 * Script này sẽ đổi ngày tạo của các link hôm nay sang ngày hôm qua
 */

require('dotenv').config();
const { Pool } = require('pg');
const config = require('../src/config');

async function resetDailyLinks() {
    const pool = new Pool(config.db);

    try {
        console.log('🔄 Đang kết nối database...');

        // Đếm số link tạo hôm nay trước khi reset
        const beforeCount = await pool.query(`
            SELECT COUNT(*) as count FROM links
            WHERE DATE(created_at) = CURRENT_DATE
        `);
        console.log(`📊 Số link tạo hôm nay trước reset: ${beforeCount.rows[0].count}`);

        // Đổi ngày tạo của các link hôm nay sang ngày hôm qua
        // Điều này sẽ khiến hệ thống không đếm chúng vào limit hôm nay
        const result = await pool.query(`
            UPDATE links
            SET created_at = created_at - INTERVAL '1 day'
            WHERE DATE(created_at) = CURRENT_DATE
        `);

        console.log(`✅ Đã reset ${result.rowCount} links (đổi ngày tạo sang hôm qua)`);

        // Reset cả trường daily_links trong bảng users (để đồng bộ)
        const userResult = await pool.query(`
            UPDATE users
            SET daily_links = 0,
                daily_links_date = CURRENT_DATE - INTERVAL '1 day',
                updated_at = NOW()
        `);
        console.log(`✅ Đã reset daily_links cho ${userResult.rowCount} users`);

        // Hiển thị thông tin sau khi reset
        const afterCount = await pool.query(`
            SELECT COUNT(*) as count FROM links
            WHERE DATE(created_at) = CURRENT_DATE
        `);
        console.log(`📊 Số link tạo hôm nay sau reset: ${afterCount.rows[0].count}`);

        const stats = await pool.query(`
            SELECT COUNT(*) as total_users FROM users
        `);
        console.log(`📊 Tổng users trong hệ thống: ${stats.rows[0].total_users}`);
        console.log(`🎉 Tất cả users giờ có thể tạo links mới (mặc định: ${config.limits.dailyLinks}, hoặc theo giới hạn riêng)!`);

    } catch (error) {
        console.error('❌ Lỗi:', error.message);
        process.exit(1);
    } finally {
        await pool.end();
        console.log('🔌 Đã đóng kết nối database');
    }
}

resetDailyLinks();

