const log = (level, msg, data = {}) => {
    const ts = new Date().toISOString();
    console.log(JSON.stringify({ ts, level, msg, ...data }));
};

module.exports = {
    info: (msg, data) => log('info', msg, data),
    error: (msg, data) => log('error', msg, data),
    warn: (msg, data) => log('warn', msg, data),
    debug: (msg, data) => process.env.NODE_ENV !== 'production' && log('debug', msg, data)
};

