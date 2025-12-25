const crypto = require('crypto');

function generateRefCode() {
    return crypto.randomBytes(4).toString('hex').toUpperCase();
}

module.exports = { generateRefCode };

