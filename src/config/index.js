require('dotenv').config();

module.exports = {
    bot: {
        token: process.env.BOT_TOKEN
    },
    db: {
        connectionString: process.env.DATABASE_URL,
        host: process.env.DB_HOST || 'localhost',
        port: parseInt(process.env.DB_PORT) || 5432,
        database: process.env.DB_NAME || 'shopee_bot',
        user: process.env.DB_USER || 'postgres',
        password: process.env.DB_PASSWORD || 'postgres',
        max: 20,
        idleTimeoutMillis: 30000
    },
    admin: {
        user: process.env.ADMIN_USER || 'admin',
        password: process.env.ADMIN_PASSWORD || 'admin123',
        sessionSecret: process.env.SESSION_SECRET || 'change-me-in-production'
    },
    app: {
        env: process.env.NODE_ENV || 'development',
        port: parseInt(process.env.PORT) || 3000
    },
    ngrok: {
        authtoken: process.env.NGROK_AUTHTOKEN
    },
    limits: {
        dailyLinks: 5,
        minWithdraw: 100000
    },
    commission: {
        owner: 0.5,
        user: 0.4,
        referrer: 0.1
    }
};

