#!/usr/bin/env node
/**
 * Database Restore Script - Khôi phục database từ backup trên Telegram
 * 
 * Chức năng:
 * - Download backup từ Telegram bằng file_id
 * - Giải nén file .gz
 * - Restore database bằng psql
 * - Hỗ trợ xóa dữ liệu cũ hoặc merge
 * 
 * Cách chạy:
 *   node scripts/restore-db.js --file-id "ABC123..."   # Restore từ file_id
 *   node scripts/restore-db.js --file-id "ABC123..." --drop  # Xóa dữ liệu cũ trước
 *   node scripts/restore-db.js --help                  # Xem hướng dẫn
 * 
 * Biến môi trường cần thiết:
 *   - BACKUP_BOT_TOKEN hoặc BOT_TOKEN
 *   - DATABASE_URL hoặc DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD
 */

const path = require('path');
const {
    logger,
    getDbConfig,
    getTempDir,
    cleanupTempFile,
    runPsql,
    decompressFile,
    downloadFromTelegram,
    confirmPrompt,
    BACKUP_CONFIG
} = require('./backup-utils');

/**
 * Parse command line arguments
 * @returns {Object} - { fileId: string, drop: boolean, force: boolean, help: boolean }
 */
function parseArgs() {
    const args = process.argv.slice(2);
    const result = { fileId: null, drop: false, force: false, help: false };
    
    for (let i = 0; i < args.length; i++) {
        const arg = args[i];
        
        if (arg === '--help' || arg === '-h') {
            result.help = true;
        } else if (arg === '--file-id' || arg === '-f') {
            result.fileId = args[++i];
        } else if (arg === '--drop' || arg === '-d') {
            result.drop = true;
        } else if (arg === '--force' || arg === '-y') {
            result.force = true;
        }
    }
    
    return result;
}

/**
 * Hiển thị hướng dẫn sử dụng
 */
function showHelp() {
    console.log(`
🔄 Database Restore Script - Khôi phục PostgreSQL từ Telegram

Cách sử dụng:
  node scripts/restore-db.js --file-id <file_id> [options]

Options:
  --file-id, -f <id>   File ID từ Telegram (bắt buộc)
                       Lấy từ output của backup-db.js
  --drop, -d           Xóa dữ liệu cũ trước khi restore
                       ⚠️ CẢNH BÁO: Sẽ mất dữ liệu hiện tại!
  --force, -y          Bỏ qua xác nhận (dùng cho automation)
  --help, -h           Hiển thị hướng dẫn này

Ví dụ:
  node scripts/restore-db.js --file-id "BQACAgIAAxk..."
  node scripts/restore-db.js -f "BQACAgIAAxk..." --drop
  node scripts/restore-db.js -f "BQACAgIAAxk..." --drop --force

Biến môi trường cần thiết:
  BACKUP_BOT_TOKEN    Token của Telegram bot (hoặc dùng BOT_TOKEN)
  DATABASE_URL        Connection string PostgreSQL
                      (hoặc DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD)

Lưu ý:
  - Luôn backup database hiện tại trước khi restore
  - Option --drop sẽ xóa toàn bộ dữ liệu trong các bảng được restore
  - Không dùng --force trong môi trường production
`);
}

/**
 * Kiểm tra cấu hình trước khi restore
 */
function validateConfig(args) {
    const errors = [];
    
    if (!args.fileId) {
        errors.push('Thiếu --file-id. Chạy với --help để xem hướng dẫn.');
    }
    
    if (!BACKUP_CONFIG.botToken) {
        errors.push('Thiếu BACKUP_BOT_TOKEN hoặc BOT_TOKEN');
    }
    
    const dbConfig = getDbConfig();
    if (!dbConfig.host || !dbConfig.database || !dbConfig.user) {
        errors.push('Thiếu cấu hình database (DATABASE_URL hoặc DB_HOST, DB_NAME, DB_USER)');
    }
    
    if (errors.length > 0) {
        logger.error('Cấu hình không hợp lệ:');
        errors.forEach(e => console.log(`  ❌ ${e}`));
        process.exit(1);
    }
}

/**
 * Hàm chính thực hiện restore
 */
async function main() {
    const args = parseArgs();
    
    // Hiển thị help nếu được yêu cầu
    if (args.help) {
        showHelp();
        process.exit(0);
    }
    
    console.log('\n🔄 BẮT ĐẦU RESTORE DATABASE\n');
    console.log('='.repeat(50));
    
    // Kiểm tra cấu hình
    validateConfig(args);
    
    const dbConfig = getDbConfig();
    const tempDir = getTempDir();
    
    logger.info('Thông tin restore:', {
        database: dbConfig.database,
        host: dbConfig.host,
        fileId: args.fileId.substring(0, 20) + '...',
        dropExisting: args.drop
    });
    
    console.log('');
    
    // Cảnh báo và xác nhận
    if (!args.force) {
        console.log('⚠️  CẢNH BÁO: Restore sẽ ghi đè dữ liệu trong database!');
        if (args.drop) {
            console.log('⚠️  Option --drop được bật: Dữ liệu cũ sẽ bị XÓA!');
        }
        console.log('');
        
        const confirmed = await confirmPrompt('Bạn có chắc chắn muốn tiếp tục?');
        if (!confirmed) {
            console.log('\n❌ Đã hủy restore.');
            process.exit(0);
        }
        console.log('');
    }
    
    // Các file tạm
    const gzFile = path.join(tempDir, `restore_${Date.now()}.sql.gz`);
    const sqlFile = gzFile.replace('.gz', '');
    
    try {
        // Bước 1: Download từ Telegram
        logger.info('📥 Bước 1/3: Download backup từ Telegram...');
        await downloadFromTelegram(args.fileId, gzFile);
        
        // Bước 2: Giải nén
        logger.info('📦 Bước 2/3: Giải nén file backup...');
        await decompressFile(gzFile, sqlFile);
        
        // Xóa file .gz sau khi giải nén
        cleanupTempFile(gzFile);
        
        // Bước 3: Restore database
        logger.info('🔄 Bước 3/3: Restore database...');
        await runPsql(sqlFile, { dropExisting: args.drop });
        
        // Dọn dẹp
        cleanupTempFile(sqlFile);
        
        // Hiển thị kết quả
        console.log('\n' + '='.repeat(50));
        console.log('✅ RESTORE THÀNH CÔNG!\n');
        console.log('📋 Thông tin:');
        console.log(`   Database: ${dbConfig.database}`);
        console.log(`   Host: ${dbConfig.host}`);
        console.log(`   Drop existing: ${args.drop ? 'Có' : 'Không'}`);
        console.log('='.repeat(50) + '\n');
        
    } catch (err) {
        // Dọn dẹp file tạm khi có lỗi
        cleanupTempFile(gzFile);
        cleanupTempFile(sqlFile);
        
        logger.error('Restore thất bại!', { error: err.message });
        console.log('\n❌ RESTORE THẤT BẠI');
        console.log(`   Lỗi: ${err.message}`);
        
        // Gợi ý khắc phục
        if (err.message.includes('psql')) {
            console.log('\n💡 Gợi ý: Đảm bảo PostgreSQL client đã được cài đặt');
        } else if (err.message.includes('download') || err.message.includes('Telegram')) {
            console.log('\n💡 Gợi ý: Kiểm tra file_id có đúng không');
        } else if (err.message.includes('database') || err.message.includes('connection')) {
            console.log('\n💡 Gợi ý: Kiểm tra database có đang chạy và cấu hình đúng không');
        }
        
        process.exit(1);
    }
}

// Chạy script
main().catch(err => {
    logger.error('Lỗi không xác định', { error: err.message });
    process.exit(1);
});

