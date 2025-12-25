const express = require('express');
const session = require('express-session');
const flash = require('connect-flash');
const expressLayouts = require('express-ejs-layouts');
const path = require('path');
const config = require('../config');

// Routes
const authRoutes = require('./routes/auth');
const dashboardRoutes = require('./routes/dashboard');
const ordersRoutes = require('./routes/orders');
const withdrawalsRoutes = require('./routes/withdrawals');
const usersRoutes = require('./routes/users');

function createAdminApp() {
    const app = express();

    app.set('view engine', 'ejs');
    app.set('views', path.join(__dirname, '../../views'));
    app.use(expressLayouts);
    app.set('layout', 'layouts/main');

    app.use(express.urlencoded({ extended: true }));
    app.use(express.json());
    app.use(express.static(path.join(__dirname, '../../public')));

    app.use(session({
        secret: config.admin.sessionSecret,
        resave: false,
        saveUninitialized: false,
        cookie: { maxAge: 24 * 60 * 60 * 1000 }
    }));

    app.use(flash());

    app.use((req, res, next) => {
        res.locals.user = req.session.user;
        res.locals.success = req.flash('success');
        res.locals.error = req.flash('error');
        next();
    });

    // Auth middleware
    const requireAuth = (req, res, next) => {
        if (!req.session.user) {
            return res.redirect('/admin/login');
        }
        next();
    };

    app.use('/admin', authRoutes);
    app.use('/admin/dashboard', requireAuth, dashboardRoutes);
    app.use('/admin/orders', requireAuth, ordersRoutes);
    app.use('/admin/withdrawals', requireAuth, withdrawalsRoutes);
    app.use('/admin/users', requireAuth, usersRoutes);

    app.get('/admin', (req, res) => {
        if (req.session.user) {
            return res.redirect('/admin/dashboard');
        }
        res.redirect('/admin/login');
    });

    return app;
}

module.exports = { createAdminApp };

