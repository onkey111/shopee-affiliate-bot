const express = require('express');
const router = express.Router();
const multer = require('multer');
const fs = require('fs');
const path = require('path');

// Configure multer for memory storage (we'll validate before saving)
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 1024 * 1024 }, // 1MB limit
    fileFilter: (req, file, cb) => {
        if (file.mimetype === 'application/json' || file.originalname.endsWith('.json')) {
            cb(null, true);
        } else {
            cb(new Error('Chi chap nhan file .json'), false);
        }
    }
});

// Path to cookies file
const COOKIES_FILE = path.join(__dirname, '../../../.cookies.json');

/**
 * Get cookies file status
 */
function getCookiesStatus() {
    try {
        if (fs.existsSync(COOKIES_FILE)) {
            const stats = fs.statSync(COOKIES_FILE);
            const content = fs.readFileSync(COOKIES_FILE, 'utf8');
            const cookies = JSON.parse(content);
            return {
                exists: true,
                lastModified: stats.mtime,
                cookieCount: Array.isArray(cookies) ? cookies.length : 0,
                fileSize: stats.size
            };
        }
    } catch (err) {
        return { exists: false, error: err.message };
    }
    return { exists: false };
}

/**
 * Validate cookies JSON format
 */
function validateCookiesFormat(data) {
    if (!Array.isArray(data)) {
        return { valid: false, error: 'Cookies phai la mot mang (array)' };
    }
    if (data.length === 0) {
        return { valid: false, error: 'Mang cookies khong duoc rong' };
    }
    // Check each cookie has required fields
    for (let i = 0; i < data.length; i++) {
        const cookie = data[i];
        if (typeof cookie !== 'object' || cookie === null) {
            return { valid: false, error: `Cookie #${i + 1} khong phai la object` };
        }
        if (!cookie.name || typeof cookie.name !== 'string') {
            return { valid: false, error: `Cookie #${i + 1} thieu truong "name"` };
        }
        if (!cookie.value || typeof cookie.value !== 'string') {
            return { valid: false, error: `Cookie #${i + 1} thieu truong "value"` };
        }
        if (!cookie.domain || typeof cookie.domain !== 'string') {
            return { valid: false, error: `Cookie #${i + 1} thieu truong "domain"` };
        }
    }
    return { valid: true };
}

// GET /admin/cookies - Show cookies management page
router.get('/', (req, res) => {
    const status = getCookiesStatus();
    res.render('admin/cookies', { status });
});

// POST /admin/cookies/upload - Handle file upload
router.post('/upload', upload.single('cookiesFile'), (req, res) => {
    try {
        if (!req.file) {
            req.flash('error', 'Vui long chon file de upload');
            return res.redirect('/admin/cookies');
        }

        // Parse JSON content
        let cookiesData;
        try {
            cookiesData = JSON.parse(req.file.buffer.toString('utf8'));
        } catch (parseErr) {
            req.flash('error', 'File khong phai JSON hop le: ' + parseErr.message);
            return res.redirect('/admin/cookies');
        }

        // Validate format
        const validation = validateCookiesFormat(cookiesData);
        if (!validation.valid) {
            req.flash('error', 'Dinh dang cookies khong hop le: ' + validation.error);
            return res.redirect('/admin/cookies');
        }

        // Save to file
        fs.writeFileSync(COOKIES_FILE, JSON.stringify(cookiesData, null, 2), 'utf8');

        req.flash('success', `Upload thanh cong! Da luu ${cookiesData.length} cookies.`);
        res.redirect('/admin/cookies');
    } catch (err) {
        req.flash('error', 'Loi upload: ' + err.message);
        res.redirect('/admin/cookies');
    }
});

// Handle multer errors
router.use((err, req, res, next) => {
    if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
            req.flash('error', 'File qua lon (toi da 1MB)');
        } else {
            req.flash('error', 'Loi upload: ' + err.message);
        }
        return res.redirect('/admin/cookies');
    }
    if (err) {
        req.flash('error', err.message);
        return res.redirect('/admin/cookies');
    }
    next();
});

module.exports = router;

