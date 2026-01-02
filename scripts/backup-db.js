#!/usr/bin/env node
/**
 * Database Backup Script - Sao lưu database PostgreSQL lên Telegram
 * 
 * Chức năng:
 * - Export database bằng pg_dump
 * - Nén file backup bằng gzip
 * - Upload lên Telegram channel/chat
 * - Hỗ trợ backup toàn bộ hoặc chỉ một số bảng
 * 
 * Cách chạy:
 *   node scripts/backup-db.js                    # Backup toàn bộ database
 *   node scripts/backup-db.js --tables users,links  # Backup chỉ bảng users và links
 *   node scripts/backup-db.js --help             # Xem hướng dẫn
 * 
 * Biến môi trường cần thiết:
 *   - BACKUP_BOT_TOKEN hoặc BOT_TOKEN
 *   - BACKUP_CHAT_ID
 *   - DATABASE_URL hoặc DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD
 */

const path = require('path');
const {
    logger,
    getDbConfig,
    generateBackupFilename,
    getTempDir,
    cleanupTempFile,
    runPgDump,
    compressFile,
    uploadToTelegram,
    BACKUP_CONFIG
} = require('./backup-utils');

/**
 * Parse command line arguments
 * @returns {Object} - { tables: string[], help: boolean }
 */
function parseArgs() {
    const args = process.argv.slice(2);
    const result = { tables: [], help: false };
    
    for (let i = 0; i < args.length; i++) {
        const arg = args[i];
        
        if (arg === '--help' || arg === '-h') {
            result.help = true;
        } else if (arg === '--tables' || arg === '-t') {
            const tablesArg = args[++i];
            if (tablesArg) {
                result.tables = tablesArg.split(',').map(t => t.trim()).filter(Boolean);
            }
        }
    }
    
    return result;
}

/**
 * Hiển thị hướng dẫn sử dụng
 */
function showHelp() {
    console.log(`
📦 Database Backup Script - Sao lưu PostgreSQL lên Telegram

Cách sử dụng:
  node scripts/backup-db.js [options]

Options:
  --tables, -t <tables>   Danh sách bảng cần backup (phân cách bằng dấu phẩy)
                          Ví dụ: --tables users,links,orders
  --help, -h              Hiển thị hướng dẫn này

Ví dụ:
  node scripts/backup-db.js                       # Backup toàn bộ database
  node scripts/backup-db.js --tables users        # Backup chỉ bảng users
  node scripts/backup-db.js -t users,links,orders # Backup nhiều bảng

Biến môi trường cần thiết:
  BACKUP_BOT_TOKEN    Token của Telegram bot (hoặc dùng BOT_TOKEN)
  BACKUP_CHAT_ID      ID của chat/channel để lưu backup
  DATABASE_URL        Connection string PostgreSQL
                      (hoặc DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD)

Lưu ý:
  - File backup sẽ được nén bằng gzip
  - Telegram giới hạn file tối đa 50MB
  - Ghi lại file_id để dùng cho restore sau này
`);
}

/**
 * Kiểm tra cấu hình trước khi backup
 */
function validateConfig() {
    const errors = [];
    
    if (!BACKUP_CONFIG.botToken) {
        errors.push('Thiếu BACKUP_BOT_TOKEN hoặc BOT_TOKEN');
    }
    
    if (!BACKUP_CONFIG.chatId) {
        errors.push('Thiếu BACKUP_CHAT_ID');
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
 * Hàm chính thực hiện backup
 */
async function main() {
    const args = parseArgs();
    
    // Hiển thị help nếu được yêu cầu
    if (args.help) {
        showHelp();
        process.exit(0);
    }
    
    console.log('\n🚀 BẮT ĐẦU BACKUP DATABASE\n');
    console.log('='.repeat(50));
    
    // Kiểm tra cấu hình
    validateConfig();
    
    const dbConfig = getDbConfig();
    const tempDir = getTempDir();
    const backupFilename = generateBackupFilename(dbConfig.database);
    
    // Các file tạm
    const sqlFile = path.join(tempDir, backupFilename.replace('.gz', ''));
    const gzFile = path.join(tempDir, backupFilename);
    
    logger.info('Thông tin backup:', {
        database: dbConfig.database,
        host: dbConfig.host,
        tables: args.tables.length ? args.tables.join(', ') : 'Tất cả',
        output: backupFilename
    });
    
    console.log('');
    
    try {
        // Bước 1: Chạy pg_dump
        logger.info('📤 Bước 1/3: Export database...');
        await runPgDump({ tables: args.tables, outputFile: sqlFile });
        
        // Bước 2: Nén file
        logger.info('🗜️ Bước 2/3: Nén file backup...');
        await compressFile(sqlFile, gzFile);
        
        // Xóa file SQL sau khi nén
        cleanupTempFile(sqlFile);
        
        // Bước 3: Upload lên Telegram
        logger.info('📱 Bước 3/3: Upload lên Telegram...');
        const caption = [
            `📦 *Database Backup*`,
            `📅 Thời gian: ${new Date().toLocaleString('vi-VN')}`,
            `🗄️ Database: ${dbConfig.database}`,
            `📋 Bảng: ${args.tables.length ? args.tables.join(', ') : 'Tất cả'}`,
            `📁 File: \`${backupFilename}\``
        ].join('\n');
        
        const { fileId, messageId } = await uploadToTelegram(gzFile, caption);
        
        // Dọn dẹp file tạm
        cleanupTempFile(gzFile);
        
        // Hiển thị kết quả
        console.log('\n' + '='.repeat(50));
        console.log('✅ BACKUP THÀNH CÔNG!\n');
        console.log('📋 Thông tin để restore:');
        console.log(`   File ID: ${fileId}`);
        console.log(`   Message ID: ${messageId}`);
        console.log(`   File: ${backupFilename}`);
        console.log('\n💡 Để restore, chạy:');
        console.log(`   node scripts/restore-db.js --file-id "${fileId}"`);
        console.log('='.repeat(50) + '\n');
        
    } catch (err) {
        // Dọn dẹp file tạm khi có lỗi
        cleanupTempFile(sqlFile);
        cleanupTempFile(gzFile);
        
        logger.error('Backup thất bại!', { error: err.message });
        console.log('\n❌ BACKUP THẤT BẠI');
        console.log(`   Lỗi: ${err.message}`);
        
        // Gợi ý khắc phục
        if (err.message.includes('pg_dump')) {
            console.log('\n💡 Gợi ý: Đảm bảo PostgreSQL client đã được cài đặt');
            console.log('   Windows: Cài PostgreSQL hoặc thêm bin folder vào PATH');
            console.log('   Linux: apt-get install postgresql-client');
        } else if (err.message.includes('Telegram')) {
            console.log('\n💡 Gợi ý: Kiểm tra BACKUP_BOT_TOKEN và BACKUP_CHAT_ID');
        } else if (err.message.includes('quá lớn')) {
            console.log('\n💡 Gợi ý: Backup từng bảng riêng với --tables');
        }
        
        process.exit(1);
    }
}

// Chạy script
main().catch(err => {
    logger.error('Lỗi không xác định', { error: err.message });
    process.exit(1);
});

