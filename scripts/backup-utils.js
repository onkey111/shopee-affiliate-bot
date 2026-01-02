/**
 * Backup Utilities - Tiện ích dùng chung cho backup/restore database
 * 
 * Bao gồm:
 * - Wrapper cho pg_dump và psql
 * - Nén/giải nén file
 * - Progress bar
 * - Logging
 * - Upload/download file qua Telegram
 */

require('dotenv').config();
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { Telegram } = require('telegraf');
const config = require('../src/config');

// Cấu hình Telegram cho backup
const BACKUP_CONFIG = {
    botToken: process.env.BACKUP_BOT_TOKEN || process.env.BOT_TOKEN,
    chatId: process.env.BACKUP_CHAT_ID,
    maxFileSize: 50 * 1024 * 1024 // Telegram giới hạn 50MB cho file
};

// Khởi tạo Telegram client
let telegramClient = null;

/**
 * Lấy Telegram client
 * @returns {Telegram|null}
 */
function getTelegramClient() {
    if (!telegramClient && BACKUP_CONFIG.botToken) {
        telegramClient = new Telegram(BACKUP_CONFIG.botToken);
    }
    return telegramClient;
}

/**
 * Logger với timestamp và level
 * @param {string} level - info, error, warn, debug
 * @param {string} msg - Thông điệp
 * @param {Object} data - Dữ liệu bổ sung
 */
function log(level, msg, data = {}) {
    const ts = new Date().toISOString();
    const emoji = { info: 'ℹ️', error: '❌', warn: '⚠️', debug: '🔍', success: '✅' };
    console.log(`${emoji[level] || '📝'} [${ts}] [${level.toUpperCase()}] ${msg}`, Object.keys(data).length ? JSON.stringify(data) : '');
}

const logger = {
    info: (msg, data) => log('info', msg, data),
    error: (msg, data) => log('error', msg, data),
    warn: (msg, data) => log('warn', msg, data),
    debug: (msg, data) => log('debug', msg, data),
    success: (msg, data) => log('success', msg, data)
};

/**
 * Hiển thị progress bar trong console
 * @param {number} current - Giá trị hiện tại
 * @param {number} total - Tổng giá trị
 * @param {string} label - Nhãn hiển thị
 */
function showProgress(current, total, label = 'Progress') {
    const percent = Math.round((current / total) * 100);
    const barLength = 30;
    const filled = Math.round((percent / 100) * barLength);
    const empty = barLength - filled;
    const bar = '█'.repeat(filled) + '░'.repeat(empty);
    const size = formatBytes(current);
    const totalSize = formatBytes(total);
    
    process.stdout.write(`\r${label}: [${bar}] ${percent}% (${size}/${totalSize})`);
    
    if (current >= total) {
        process.stdout.write('\n');
    }
}

/**
 * Format bytes thành đơn vị dễ đọc
 * @param {number} bytes - Số bytes
 * @returns {string}
 */
function formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * Lấy cấu hình database từ config hoặc DATABASE_URL
 * @returns {Object} - { host, port, database, user, password }
 */
function getDbConfig() {
    // Ưu tiên DATABASE_URL nếu có
    if (config.db.connectionString) {
        const url = new URL(config.db.connectionString);
        return {
            host: url.hostname,
            port: url.port || 5432,
            database: url.pathname.slice(1),
            user: url.username,
            password: url.password
        };
    }
    
    return {
        host: config.db.host,
        port: config.db.port,
        database: config.db.database,
        user: config.db.user,
        password: config.db.password
    };
}

/**
 * Tạo tên file backup với timestamp
 * @param {string} dbName - Tên database
 * @returns {string}
 */
function generateBackupFilename(dbName) {
    const now = new Date();
    const timestamp = now.toISOString().replace(/[:.]/g, '-').slice(0, 19);
    return `backup_${dbName}_${timestamp}.sql.gz`;
}

/**
 * Lấy thư mục temp
 * @returns {string}
 */
function getTempDir() {
    const tempDir = path.join(process.cwd(), 'temp');
    if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
    }
    return tempDir;
}

/**
 * Dọn dẹp file tạm
 * @param {string} filePath - Đường dẫn file cần xóa
 */
function cleanupTempFile(filePath) {
    try {
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
            logger.debug('Đã xóa file tạm', { file: filePath });
        }
    } catch (err) {
        logger.warn('Không thể xóa file tạm', { file: filePath, error: err.message });
    }
}

/**
 * Chạy pg_dump để export database
 * @param {Object} options - { tables: string[], outputFile: string }
 * @returns {Promise<string>} - Đường dẫn file output
 */
async function runPgDump(options = {}) {
    const dbConfig = getDbConfig();
    const { tables = [], outputFile } = options;

    const tempDir = getTempDir();
    const sqlFile = outputFile || path.join(tempDir, `dump_${Date.now()}.sql`);

    return new Promise((resolve, reject) => {
        const args = [
            '-h', dbConfig.host,
            '-p', String(dbConfig.port),
            '-U', dbConfig.user,
            '-d', dbConfig.database,
            '-F', 'p', // Plain text format
            '--no-owner',
            '--no-acl',
            '-f', sqlFile
        ];

        // Nếu chỉ backup một số bảng
        if (tables.length > 0) {
            tables.forEach(table => {
                args.push('-t', table);
            });
        }

        logger.info('Đang chạy pg_dump...', { database: dbConfig.database, tables: tables.length ? tables : 'all' });

        const env = { ...process.env, PGPASSWORD: dbConfig.password };
        const pgDump = spawn('pg_dump', args, { env });

        let stderr = '';

        pgDump.stderr.on('data', (data) => {
            stderr += data.toString();
        });

        pgDump.on('close', (code) => {
            if (code === 0) {
                logger.success('pg_dump hoàn thành', { file: sqlFile });
                resolve(sqlFile);
            } else {
                reject(new Error(`pg_dump thất bại với code ${code}: ${stderr}`));
            }
        });

        pgDump.on('error', (err) => {
            reject(new Error(`Không thể chạy pg_dump: ${err.message}. Đảm bảo PostgreSQL client đã được cài đặt.`));
        });
    });
}

/**
 * Chạy psql để restore database
 * @param {string} sqlFile - Đường dẫn file SQL
 * @param {Object} options - { dropExisting: boolean }
 * @returns {Promise<void>}
 */
async function runPsql(sqlFile, options = {}) {
    const dbConfig = getDbConfig();
    const { dropExisting = false } = options;

    return new Promise((resolve, reject) => {
        const args = [
            '-h', dbConfig.host,
            '-p', String(dbConfig.port),
            '-U', dbConfig.user,
            '-d', dbConfig.database,
            '-f', sqlFile
        ];

        // Nếu muốn xóa dữ liệu cũ trước khi restore
        if (dropExisting) {
            args.push('--single-transaction');
        }

        logger.info('Đang chạy psql restore...', { database: dbConfig.database, file: sqlFile });

        const env = { ...process.env, PGPASSWORD: dbConfig.password };
        const psql = spawn('psql', args, { env });

        let stderr = '';
        let stdout = '';

        psql.stdout.on('data', (data) => {
            stdout += data.toString();
        });

        psql.stderr.on('data', (data) => {
            stderr += data.toString();
        });

        psql.on('close', (code) => {
            if (code === 0) {
                logger.success('psql restore hoàn thành');
                resolve();
            } else {
                // psql có thể trả về warning trong stderr nhưng vẫn thành công
                if (stderr.includes('ERROR')) {
                    reject(new Error(`psql thất bại: ${stderr}`));
                } else {
                    logger.warn('psql hoàn thành với warning', { stderr });
                    resolve();
                }
            }
        });

        psql.on('error', (err) => {
            reject(new Error(`Không thể chạy psql: ${err.message}. Đảm bảo PostgreSQL client đã được cài đặt.`));
        });
    });
}

/**
 * Nén file bằng gzip
 * @param {string} inputFile - File cần nén
 * @param {string} outputFile - File output (.gz)
 * @returns {Promise<string>} - Đường dẫn file đã nén
 */
async function compressFile(inputFile, outputFile) {
    return new Promise((resolve, reject) => {
        const inputSize = fs.statSync(inputFile).size;
        let processedBytes = 0;

        logger.info('Đang nén file...', { input: inputFile });

        const readStream = fs.createReadStream(inputFile);
        const writeStream = fs.createWriteStream(outputFile);
        const gzip = zlib.createGzip({ level: 9 });

        readStream.on('data', (chunk) => {
            processedBytes += chunk.length;
            showProgress(processedBytes, inputSize, 'Nén');
        });

        readStream.on('error', reject);
        writeStream.on('error', reject);
        gzip.on('error', reject);

        writeStream.on('finish', () => {
            const outputSize = fs.statSync(outputFile).size;
            logger.success('Nén hoàn thành', {
                inputSize: formatBytes(inputSize),
                outputSize: formatBytes(outputSize),
                ratio: ((1 - outputSize / inputSize) * 100).toFixed(1) + '%'
            });
            resolve(outputFile);
        });

        readStream.pipe(gzip).pipe(writeStream);
    });
}

/**
 * Giải nén file gzip
 * @param {string} inputFile - File .gz cần giải nén
 * @param {string} outputFile - File output
 * @returns {Promise<string>} - Đường dẫn file đã giải nén
 */
async function decompressFile(inputFile, outputFile) {
    return new Promise((resolve, reject) => {
        const inputSize = fs.statSync(inputFile).size;
        let processedBytes = 0;

        logger.info('Đang giải nén file...', { input: inputFile });

        const readStream = fs.createReadStream(inputFile);
        const writeStream = fs.createWriteStream(outputFile);
        const gunzip = zlib.createGunzip();

        readStream.on('data', (chunk) => {
            processedBytes += chunk.length;
            showProgress(processedBytes, inputSize, 'Giải nén');
        });

        readStream.on('error', reject);
        writeStream.on('error', reject);
        gunzip.on('error', reject);

        writeStream.on('finish', () => {
            const outputSize = fs.statSync(outputFile).size;
            logger.success('Giải nén hoàn thành', {
                inputSize: formatBytes(inputSize),
                outputSize: formatBytes(outputSize)
            });
            resolve(outputFile);
        });

        readStream.pipe(gunzip).pipe(writeStream);
    });
}

/**
 * Upload file lên Telegram
 * @param {string} filePath - Đường dẫn file cần upload
 * @param {string} caption - Mô tả file
 * @returns {Promise<Object>} - { fileId, messageId }
 */
async function uploadToTelegram(filePath, caption = '') {
    const telegram = getTelegramClient();
    if (!telegram) {
        throw new Error('Telegram client chưa được cấu hình. Kiểm tra BACKUP_BOT_TOKEN.');
    }

    if (!BACKUP_CONFIG.chatId) {
        throw new Error('BACKUP_CHAT_ID chưa được cấu hình.');
    }

    const fileSize = fs.statSync(filePath).size;

    // Kiểm tra giới hạn file size của Telegram
    if (fileSize > BACKUP_CONFIG.maxFileSize) {
        throw new Error(`File quá lớn (${formatBytes(fileSize)}). Telegram giới hạn ${formatBytes(BACKUP_CONFIG.maxFileSize)}.`);
    }

    logger.info('Đang upload file lên Telegram...', {
        file: path.basename(filePath),
        size: formatBytes(fileSize)
    });

    // Tạo stream để theo dõi progress
    const fileStream = fs.createReadStream(filePath);
    let uploadedBytes = 0;

    fileStream.on('data', (chunk) => {
        uploadedBytes += chunk.length;
        showProgress(uploadedBytes, fileSize, 'Upload');
    });

    try {
        const result = await telegram.sendDocument(
            BACKUP_CONFIG.chatId,
            { source: filePath, filename: path.basename(filePath) },
            { caption: caption || `📦 Database Backup\n📅 ${new Date().toISOString()}` }
        );

        const fileId = result.document.file_id;
        const messageId = result.message_id;

        logger.success('Upload thành công!', { fileId, messageId });

        return { fileId, messageId };
    } catch (err) {
        if (err.message.includes('file is too big')) {
            throw new Error(`File quá lớn cho Telegram. Hãy thử nén thêm hoặc chia nhỏ backup.`);
        }
        throw new Error(`Upload thất bại: ${err.message}`);
    }
}

/**
 * Download file từ Telegram bằng file_id
 * @param {string} fileId - Telegram file_id
 * @param {string} outputPath - Đường dẫn lưu file
 * @returns {Promise<string>} - Đường dẫn file đã download
 */
async function downloadFromTelegram(fileId, outputPath) {
    const telegram = getTelegramClient();
    if (!telegram) {
        throw new Error('Telegram client chưa được cấu hình. Kiểm tra BACKUP_BOT_TOKEN.');
    }

    logger.info('Đang lấy thông tin file từ Telegram...', { fileId });

    try {
        // Lấy file path từ Telegram
        const file = await telegram.getFile(fileId);
        const fileUrl = `https://api.telegram.org/file/bot${BACKUP_CONFIG.botToken}/${file.file_path}`;

        logger.info('Đang download file...', { size: formatBytes(file.file_size || 0) });

        // Download file
        const https = require('https');
        const http = require('http');
        const protocol = fileUrl.startsWith('https') ? https : http;

        return new Promise((resolve, reject) => {
            const fileStream = fs.createWriteStream(outputPath);
            let downloadedBytes = 0;
            const totalSize = file.file_size || 0;

            protocol.get(fileUrl, (response) => {
                if (response.statusCode !== 200) {
                    reject(new Error(`Download thất bại với status ${response.statusCode}`));
                    return;
                }

                response.on('data', (chunk) => {
                    downloadedBytes += chunk.length;
                    if (totalSize > 0) {
                        showProgress(downloadedBytes, totalSize, 'Download');
                    }
                });

                response.pipe(fileStream);

                fileStream.on('finish', () => {
                    fileStream.close();
                    logger.success('Download hoàn thành', { file: outputPath });
                    resolve(outputPath);
                });
            }).on('error', (err) => {
                fs.unlink(outputPath, () => {}); // Xóa file lỗi
                reject(new Error(`Download thất bại: ${err.message}`));
            });
        });
    } catch (err) {
        throw new Error(`Không thể download file: ${err.message}`);
    }
}

/**
 * Lấy backup mới nhất từ Telegram chat
 * @returns {Promise<Object|null>} - { fileId, fileName, date } hoặc null
 */
async function getLatestBackupFromTelegram() {
    const telegram = getTelegramClient();
    if (!telegram) {
        throw new Error('Telegram client chưa được cấu hình.');
    }

    logger.info('Đang tìm backup mới nhất...');

    // Lưu ý: Telegram Bot API không hỗ trợ lấy lịch sử tin nhắn
    // Cần lưu file_id vào database hoặc file local
    logger.warn('Không thể tự động tìm backup mới nhất. Vui lòng cung cấp file_id.');
    return null;
}

/**
 * Prompt xác nhận từ user (cho CLI)
 * @param {string} question - Câu hỏi
 * @returns {Promise<boolean>}
 */
async function confirmPrompt(question) {
    const readline = require('readline');
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });

    return new Promise((resolve) => {
        rl.question(`${question} (y/N): `, (answer) => {
            rl.close();
            resolve(answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes');
        });
    });
}

module.exports = {
    BACKUP_CONFIG,
    getTelegramClient,
    logger,
    showProgress,
    formatBytes,
    getDbConfig,
    generateBackupFilename,
    getTempDir,
    cleanupTempFile,
    runPgDump,
    runPsql,
    compressFile,
    decompressFile,
    uploadToTelegram,
    downloadFromTelegram,
    getLatestBackupFromTelegram,
    confirmPrompt
};

