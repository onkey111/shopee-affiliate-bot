# Phase 6: Admin Panel

**Parent Plan:** [plan.md](./plan.md)  
**Dependencies:** [Phase 4](./phase-04-commission-balance.md)  
**Status:** pending  
**Priority:** High  
**Estimate:** 4 hours

---

## Overview

Build Express.js admin panel with EJS templates and Bootstrap 5. Features: login authentication, dashboard with stats, order management (approve/reject), withdrawal management, user list.

---

## Requirements

- Session-based admin authentication
- Dashboard with key metrics
- Order list with approve/reject actions
- Withdrawal list with complete/reject actions
- User list view
- Flash messages for feedback
- Responsive Bootstrap 5 UI

---

## Architecture

### Code Structure
```
src/
└── admin/
    ├── index.js                    # Express app setup
    ├── routes/
    │   ├── auth-routes.js          # Login/logout
    │   ├── dashboard-routes.js     # Dashboard
    │   ├── order-routes.js         # Order management
    │   ├── withdraw-routes.js      # Withdrawal management
    │   └── user-routes.js          # User list
    ├── controllers/
    │   ├── dashboard-controller.js
    │   ├── order-controller.js
    │   ├── withdraw-controller.js
    │   └── user-controller.js
    └── middleware/
        └── auth.js                 # requireAuth middleware

views/
├── layouts/
│   └── admin.ejs                   # Main layout
├── partials/
│   ├── navbar.ejs
│   ├── sidebar.ejs
│   └── flash.ejs
└── admin/
    ├── login.ejs
    ├── dashboard.ejs
    ├── orders.ejs
    ├── withdrawals.ejs
    └── users.ejs

public/
└── css/
    └── admin.css                   # Custom styles
```

---

## Related Code Files

| File | Purpose |
|------|---------|
| `src/admin/index.js` | Express app setup |
| `src/admin/middleware/auth.js` | Auth middleware |
| `src/admin/routes/*.js` | Route handlers |
| `src/admin/controllers/*.js` | Request handlers |
| `views/layouts/admin.ejs` | Base layout |
| `views/admin/*.ejs` | Page templates |

---

## Implementation Steps

### Step 1: Create src/admin/middleware/auth.js
```javascript
function requireAuth(req, res, next) {
    if (req.session?.admin) {
        return next();
    }
    req.flash('error', 'Vui long dang nhap');
    res.redirect('/admin/login');
}

module.exports = { requireAuth };
```

### Step 2: Create src/admin/index.js
```javascript
const express = require('express');
const session = require('express-session');
const flash = require('connect-flash');
const expressLayouts = require('express-ejs-layouts');
const path = require('path');
const config = require('../config');

// Import routes
const authRoutes = require('./routes/auth-routes');
const dashboardRoutes = require('./routes/dashboard-routes');
const orderRoutes = require('./routes/order-routes');
const withdrawRoutes = require('./routes/withdraw-routes');
const userRoutes = require('./routes/user-routes');

function createAdminApp() {
    const app = express();

    // View engine
    app.set('view engine', 'ejs');
    app.set('views', path.join(__dirname, '../../views'));
    app.use(expressLayouts);
    app.set('layout', 'layouts/admin');

    // Static files
    app.use('/public', express.static(path.join(__dirname, '../../public')));

    // Body parser
    app.use(express.urlencoded({ extended: true }));
    app.use(express.json());

    // Session
    app.use(session({
        secret: config.admin.sessionSecret,
        resave: false,
        saveUninitialized: false,
        cookie: {
            secure: config.app.env === 'production',
            maxAge: 24 * 60 * 60 * 1000 // 24 hours
        }
    }));

    // Flash messages
    app.use(flash());

    // Make flash available in all views
    app.use((req, res, next) => {
        res.locals.success = req.flash('success');
        res.locals.error = req.flash('error');
        res.locals.admin = req.session?.admin;
        next();
    });

    // Routes
    app.use('/admin', authRoutes);
    app.use('/admin', dashboardRoutes);
    app.use('/admin/orders', orderRoutes);
    app.use('/admin/withdrawals', withdrawRoutes);
    app.use('/admin/users', userRoutes);

    // Redirect root to admin
    app.get('/', (req, res) => res.redirect('/admin'));

    // 404 handler
    app.use((req, res) => {
        res.status(404).render('admin/404', { title: 'Not Found', layout: false });
    });

    return app;
}

module.exports = { createAdminApp };
```

### Step 3: Create src/admin/routes/auth-routes.js
```javascript
const express = require('express');
const config = require('../../config');
const router = express.Router();

router.get('/login', (req, res) => {
    if (req.session?.admin) {
        return res.redirect('/admin/dashboard');
    }
    res.render('admin/login', { title: 'Dang nhap', layout: false });
});

router.post('/login', (req, res) => {
    const { username, password } = req.body;

    if (username === config.admin.user && password === config.admin.password) {
        req.session.admin = { username };
        req.flash('success', 'Dang nhap thanh cong!');
        return res.redirect('/admin/dashboard');
    }

    req.flash('error', 'Sai tai khoan hoac mat khau');
    res.redirect('/admin/login');
});

router.get('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/admin/login');
});

// Redirect /admin to /admin/dashboard
router.get('/', (req, res) => {
    res.redirect('/admin/dashboard');
});

module.exports = router;
```

### Step 4: Create src/admin/routes/dashboard-routes.js
```javascript
const express = require('express');
const { requireAuth } = require('../middleware/auth');
const dashboardController = require('../controllers/dashboard-controller');
const router = express.Router();

router.get('/dashboard', requireAuth, dashboardController.index);

module.exports = router;
```

### Step 5: Create src/admin/controllers/dashboard-controller.js
```javascript
const db = require('../../db/connection');
const orderRepo = require('../../db/repositories/order-repository');
const withdrawRepo = require('../../db/repositories/withdraw-repository');

const dashboardController = {
    async index(req, res) {
        try {
            // Get stats
            const [
                usersResult,
                pendingOrders,
                pendingWithdrawals,
                totalCommissionResult
            ] = await Promise.all([
                db.query('SELECT COUNT(*) as count FROM users'),
                orderRepo.countByStatus('pending'),
                withdrawRepo.countByStatus('pending'),
                db.query(`SELECT COALESCE(SUM(user_commission), 0) as total 
                          FROM orders WHERE status = 'approved'`)
            ]);

            const stats = {
                totalUsers: parseInt(usersResult.rows[0].count),
                pendingOrders,
                pendingWithdrawals,
                totalCommissionPaid: parseFloat(totalCommissionResult.rows[0].total)
            };

            res.render('admin/dashboard', {
                title: 'Dashboard',
                stats
            });
        } catch (err) {
            console.error('Dashboard error:', err);
            req.flash('error', 'Loi tai dashboard');
            res.render('admin/dashboard', { title: 'Dashboard', stats: {} });
        }
    }
};

module.exports = dashboardController;
```

### Step 6: Create src/admin/routes/order-routes.js
```javascript
const express = require('express');
const { requireAuth } = require('../middleware/auth');
const orderController = require('../controllers/order-controller');
const router = express.Router();

router.get('/', requireAuth, orderController.index);
router.post('/:id/approve', requireAuth, orderController.approve);
router.post('/:id/reject', requireAuth, orderController.reject);

module.exports = router;
```

### Step 7: Create src/admin/controllers/order-controller.js
```javascript
const orderRepo = require('../../db/repositories/order-repository');
const commissionService = require('../../services/commission-service');
const notificationService = require('../../services/notification-service');

const orderController = {
    async index(req, res) {
        try {
            const status = req.query.status || 'pending';
            let orders;

            if (status === 'all') {
                orders = await orderRepo.findPending(100); // Get more for all
            } else {
                orders = await orderRepo.findPending(50);
            }

            res.render('admin/orders', {
                title: 'Quan ly don hang',
                orders,
                currentStatus: status
            });
        } catch (err) {
            console.error('Orders error:', err);
            req.flash('error', 'Loi tai danh sach don hang');
            res.redirect('/admin/dashboard');
        }
    },

    async approve(req, res) {
        try {
            const { id } = req.params;
            const { commission_total } = req.body;

            if (!commission_total || parseFloat(commission_total) <= 0) {
                req.flash('error', 'Hoa hong khong hop le');
                return res.redirect('/admin/orders');
            }

            const result = await commissionService.processOrderApproval(
                parseInt(id),
                parseFloat(commission_total)
            );

            // Send notification to user
            await notificationService.notifyOrderApproved(
                result.user.telegram_id,
                result.order,
                result.userCommission
            );

            // Notify referrer if exists
            if (result.referrer && result.referrerCommission > 0) {
                await notificationService.notifyReferralCommission(
                    result.referrer.telegram_id,
                    result.user,
                    result.referrerCommission
                );
            }

            req.flash('success', `Don #${id} da duoc duyet. User nhan ${result.userCommission.toLocaleString()}d`);
        } catch (err) {
            console.error('Approve error:', err);
            req.flash('error', 'Loi khi duyet don: ' + err.message);
        }
        res.redirect('/admin/orders');
    },

    async reject(req, res) {
        try {
            const { id } = req.params;
            const { admin_note } = req.body;

            await orderRepo.reject(parseInt(id), admin_note);

            req.flash('success', `Don #${id} da bi tu choi`);
        } catch (err) {
            console.error('Reject error:', err);
            req.flash('error', 'Loi khi tu choi don');
        }
        res.redirect('/admin/orders');
    }
};

module.exports = orderController;
```

### Step 8: Create src/admin/routes/withdraw-routes.js
```javascript
const express = require('express');
const { requireAuth } = require('../middleware/auth');
const withdrawController = require('../controllers/withdraw-controller');
const router = express.Router();

router.get('/', requireAuth, withdrawController.index);
router.post('/:id/complete', requireAuth, withdrawController.complete);
router.post('/:id/reject', requireAuth, withdrawController.reject);

module.exports = router;
```

### Step 9: Create src/admin/controllers/withdraw-controller.js
```javascript
const withdrawRepo = require('../../db/repositories/withdraw-repository');
const withdrawService = require('../../services/withdraw-service');
const notificationService = require('../../services/notification-service');

const withdrawController = {
    async index(req, res) {
        try {
            const withdrawals = await withdrawRepo.findPending(50);

            res.render('admin/withdrawals', {
                title: 'Yeu cau rut tien',
                withdrawals
            });
        } catch (err) {
            console.error('Withdrawals error:', err);
            req.flash('error', 'Loi tai danh sach');
            res.redirect('/admin/dashboard');
        }
    },

    async complete(req, res) {
        try {
            const { id } = req.params;

            const result = await withdrawService.completeWithdrawal(parseInt(id));

            // Notify user
            await notificationService.notifyWithdrawCompleted(
                result.telegramId,
                result.withdrawal.amount
            );

            req.flash('success', `Yeu cau #${id} da hoan thanh`);
        } catch (err) {
            console.error('Complete error:', err);
            req.flash('error', 'Loi: ' + err.message);
        }
        res.redirect('/admin/withdrawals');
    },

    async reject(req, res) {
        try {
            const { id } = req.params;
            const { admin_note } = req.body;

            const result = await withdrawService.rejectWithdrawal(parseInt(id), admin_note);

            // Notify user
            await notificationService.notifyWithdrawRejected(
                result.telegramId,
                result.withdrawal.amount,
                admin_note
            );

            req.flash('success', `Yeu cau #${id} da bi tu choi`);
        } catch (err) {
            console.error('Reject error:', err);
            req.flash('error', 'Loi: ' + err.message);
        }
        res.redirect('/admin/withdrawals');
    }
};

module.exports = withdrawController;
```

### Step 10: Create src/admin/routes/user-routes.js
```javascript
const express = require('express');
const { requireAuth } = require('../middleware/auth');
const userController = require('../controllers/user-controller');
const router = express.Router();

router.get('/', requireAuth, userController.index);

module.exports = router;
```

### Step 11: Create src/admin/controllers/user-controller.js
```javascript
const db = require('../../db/connection');

const userController = {
    async index(req, res) {
        try {
            const result = await db.query(`
                SELECT u.*, 
                       (SELECT COUNT(*) FROM users WHERE referred_by = u.id) as referral_count,
                       (SELECT COUNT(*) FROM orders WHERE user_id = u.id AND status = 'approved') as order_count
                FROM users u
                ORDER BY u.created_at DESC
                LIMIT 100
            `);

            res.render('admin/users', {
                title: 'Danh sach users',
                users: result.rows
            });
        } catch (err) {
            console.error('Users error:', err);
            req.flash('error', 'Loi tai danh sach');
            res.redirect('/admin/dashboard');
        }
    }
};

module.exports = userController;
```

### Step 12: Create views/layouts/admin.ejs
```html
<!DOCTYPE html>
<html lang="vi">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title><%= typeof title !== 'undefined' ? title + ' - Admin' : 'Admin' %></title>
    <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/css/bootstrap.min.css" rel="stylesheet">
    <link href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.1/font/bootstrap-icons.css" rel="stylesheet">
    <style>
        .sidebar { min-height: 100vh; background: #212529; }
        .sidebar a { color: #adb5bd; }
        .sidebar a:hover, .sidebar a.active { color: #fff; background: #343a40; }
        .content { min-height: 100vh; }
    </style>
</head>
<body>
    <div class="container-fluid">
        <div class="row">
            <%- include('../partials/sidebar') %>
            <main class="col-md-9 ms-sm-auto col-lg-10 px-md-4 py-4 content">
                <%- include('../partials/flash') %>
                <%- body %>
            </main>
        </div>
    </div>
    <script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/js/bootstrap.bundle.min.js"></script>
</body>
</html>
```

### Step 13: Create views/partials/sidebar.ejs
```html
<nav class="col-md-3 col-lg-2 d-md-block sidebar collapse py-3">
    <div class="text-center mb-4">
        <h5 class="text-white">Shopee Affiliate</h5>
    </div>
    <ul class="nav flex-column">
        <li class="nav-item">
            <a class="nav-link" href="/admin/dashboard">
                <i class="bi bi-speedometer2 me-2"></i> Dashboard
            </a>
        </li>
        <li class="nav-item">
            <a class="nav-link" href="/admin/orders">
                <i class="bi bi-box me-2"></i> Don hang
            </a>
        </li>
        <li class="nav-item">
            <a class="nav-link" href="/admin/withdrawals">
                <i class="bi bi-cash me-2"></i> Rut tien
            </a>
        </li>
        <li class="nav-item">
            <a class="nav-link" href="/admin/users">
                <i class="bi bi-people me-2"></i> Users
            </a>
        </li>
        <li class="nav-item mt-4">
            <a class="nav-link text-danger" href="/admin/logout">
                <i class="bi bi-box-arrow-right me-2"></i> Dang xuat
            </a>
        </li>
    </ul>
</nav>
```

### Step 14: Create views/partials/flash.ejs
```html
<% if (typeof success !== 'undefined' && success.length) { %>
    <div class="alert alert-success alert-dismissible fade show" role="alert">
        <%= success %>
        <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
    </div>
<% } %>
<% if (typeof error !== 'undefined' && error.length) { %>
    <div class="alert alert-danger alert-dismissible fade show" role="alert">
        <%= error %>
        <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
    </div>
<% } %>
```

### Step 15: Create views/admin/login.ejs
```html
<!DOCTYPE html>
<html lang="vi">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Dang nhap - Admin</title>
    <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/css/bootstrap.min.css" rel="stylesheet">
</head>
<body class="bg-light">
    <div class="container">
        <div class="row justify-content-center mt-5">
            <div class="col-md-4">
                <div class="card shadow">
                    <div class="card-body p-4">
                        <h4 class="text-center mb-4">Admin Login</h4>
                        
                        <% if (typeof error !== 'undefined' && error.length) { %>
                            <div class="alert alert-danger"><%= error %></div>
                        <% } %>
                        
                        <form method="POST" action="/admin/login">
                            <div class="mb-3">
                                <label class="form-label">Username</label>
                                <input type="text" name="username" class="form-control" required>
                            </div>
                            <div class="mb-3">
                                <label class="form-label">Password</label>
                                <input type="password" name="password" class="form-control" required>
                            </div>
                            <button type="submit" class="btn btn-primary w-100">Dang nhap</button>
                        </form>
                    </div>
                </div>
            </div>
        </div>
    </div>
</body>
</html>
```

### Step 16: Create views/admin/dashboard.ejs
```html
<h2 class="mb-4">Dashboard</h2>

<div class="row">
    <div class="col-md-3 mb-4">
        <div class="card bg-primary text-white">
            <div class="card-body">
                <h5>Tong Users</h5>
                <h2><%= stats.totalUsers || 0 %></h2>
            </div>
        </div>
    </div>
    <div class="col-md-3 mb-4">
        <div class="card bg-warning text-dark">
            <div class="card-body">
                <h5>Don cho duyet</h5>
                <h2><%= stats.pendingOrders || 0 %></h2>
            </div>
        </div>
    </div>
    <div class="col-md-3 mb-4">
        <div class="card bg-info text-white">
            <div class="card-body">
                <h5>Rut tien cho xu ly</h5>
                <h2><%= stats.pendingWithdrawals || 0 %></h2>
            </div>
        </div>
    </div>
    <div class="col-md-3 mb-4">
        <div class="card bg-success text-white">
            <div class="card-body">
                <h5>Tong hoa hong da tra</h5>
                <h2><%= (stats.totalCommissionPaid || 0).toLocaleString() %>d</h2>
            </div>
        </div>
    </div>
</div>

<div class="row">
    <div class="col-md-6">
        <div class="card">
            <div class="card-header">
                <a href="/admin/orders" class="text-decoration-none">Don hang cho duyet →</a>
            </div>
            <div class="card-body">
                <p class="text-muted">Xem va duyet don hang tai trang Don hang</p>
            </div>
        </div>
    </div>
    <div class="col-md-6">
        <div class="card">
            <div class="card-header">
                <a href="/admin/withdrawals" class="text-decoration-none">Yeu cau rut tien →</a>
            </div>
            <div class="card-body">
                <p class="text-muted">Xu ly yeu cau rut tien tai trang Rut tien</p>
            </div>
        </div>
    </div>
</div>
```

### Step 17: Create views/admin/orders.ejs
```html
<h2 class="mb-4">Don hang cho duyet</h2>

<div class="table-responsive">
    <table class="table table-striped table-hover align-middle">
        <thead class="table-dark">
            <tr>
                <th>#</th>
                <th>User</th>
                <th>Order ID Shopee</th>
                <th>Ngay tao</th>
                <th>Trang thai</th>
                <th>Thao tac</th>
            </tr>
        </thead>
        <tbody>
            <% if (orders.length === 0) { %>
                <tr><td colspan="6" class="text-center text-muted">Khong co don hang nao</td></tr>
            <% } %>
            <% orders.forEach((order, i) => { %>
            <tr>
                <td><%= i + 1 %></td>
                <td>
                    <% if (order.telegram_username) { %>
                        @<%= order.telegram_username %>
                    <% } else { %>
                        <%= order.telegram_first_name %>
                    <% } %>
                </td>
                <td><code><%= order.shopee_order_id %></code></td>
                <td><%= new Date(order.created_at).toLocaleString('vi-VN') %></td>
                <td>
                    <% if (order.status === 'pending') { %>
                        <span class="badge bg-warning text-dark">Cho duyet</span>
                    <% } else if (order.status === 'approved') { %>
                        <span class="badge bg-success">Da duyet</span>
                    <% } else { %>
                        <span class="badge bg-danger">Tu choi</span>
                    <% } %>
                </td>
                <td>
                    <% if (order.status === 'pending') { %>
                    <button class="btn btn-success btn-sm" data-bs-toggle="modal" data-bs-target="#approveModal<%= order.id %>">
                        <i class="bi bi-check-lg"></i> Duyet
                    </button>
                    <form action="/admin/orders/<%= order.id %>/reject" method="POST" class="d-inline">
                        <button type="submit" class="btn btn-danger btn-sm" onclick="return confirm('Tu choi don nay?')">
                            <i class="bi bi-x-lg"></i> Tu choi
                        </button>
                    </form>
                    <% } %>
                </td>
            </tr>
            <% }) %>
        </tbody>
    </table>
</div>

<!-- Approve Modals -->
<% orders.filter(o => o.status === 'pending').forEach(order => { %>
<div class="modal fade" id="approveModal<%= order.id %>">
    <div class="modal-dialog">
        <div class="modal-content">
            <form action="/admin/orders/<%= order.id %>/approve" method="POST">
                <div class="modal-header">
                    <h5 class="modal-title">Duyet don #<%= order.shopee_order_id %></h5>
                    <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                </div>
                <div class="modal-body">
                    <div class="mb-3">
                        <label class="form-label">Hoa hong tu Shopee (VND)</label>
                        <input type="number" name="commission_total" class="form-control" required min="0" step="1">
                        <small class="text-muted">Nhap so tien hoa hong thuc te tu Shopee</small>
                    </div>
                    <div class="alert alert-info mb-0">
                        <small>
                            <strong>Chia hoa hong:</strong><br>
                            User nhan: 40% | Referrer nhan: 10% | Owner nhan: 50%
                        </small>
                    </div>
                </div>
                <div class="modal-footer">
                    <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Huy</button>
                    <button type="submit" class="btn btn-success">Xac nhan duyet</button>
                </div>
            </form>
        </div>
    </div>
</div>
<% }) %>
```

### Step 18: Create views/admin/withdrawals.ejs
```html
<h2 class="mb-4">Yeu cau rut tien</h2>

<div class="table-responsive">
    <table class="table table-striped table-hover align-middle">
        <thead class="table-dark">
            <tr>
                <th>#</th>
                <th>User</th>
                <th>So tien</th>
                <th>Ngan hang</th>
                <th>STK</th>
                <th>Chu TK</th>
                <th>Ngay tao</th>
                <th>Thao tac</th>
            </tr>
        </thead>
        <tbody>
            <% if (withdrawals.length === 0) { %>
                <tr><td colspan="8" class="text-center text-muted">Khong co yeu cau nao</td></tr>
            <% } %>
            <% withdrawals.forEach((w, i) => { %>
            <tr>
                <td><%= i + 1 %></td>
                <td>
                    <% if (w.telegram_username) { %>
                        @<%= w.telegram_username %>
                    <% } else { %>
                        <%= w.telegram_first_name %>
                    <% } %>
                    <br><small class="text-muted">So du: <%= w.balance?.toLocaleString() || 0 %>d</small>
                </td>
                <td><strong><%= w.amount.toLocaleString() %>d</strong></td>
                <td><%= w.bank_name %></td>
                <td><code><%= w.account_number %></code></td>
                <td><%= w.account_holder %></td>
                <td><%= new Date(w.created_at).toLocaleString('vi-VN') %></td>
                <td>
                    <form action="/admin/withdrawals/<%= w.id %>/complete" method="POST" class="d-inline">
                        <button type="submit" class="btn btn-success btn-sm" onclick="return confirm('Xac nhan da chuyen tien?')">
                            <i class="bi bi-check-lg"></i> Hoan thanh
                        </button>
                    </form>
                    <button class="btn btn-danger btn-sm" data-bs-toggle="modal" data-bs-target="#rejectModal<%= w.id %>">
                        <i class="bi bi-x-lg"></i> Tu choi
                    </button>
                </td>
            </tr>
            <% }) %>
        </tbody>
    </table>
</div>

<!-- Reject Modals -->
<% withdrawals.forEach(w => { %>
<div class="modal fade" id="rejectModal<%= w.id %>">
    <div class="modal-dialog">
        <div class="modal-content">
            <form action="/admin/withdrawals/<%= w.id %>/reject" method="POST">
                <div class="modal-header">
                    <h5 class="modal-title">Tu choi yeu cau #<%= w.id %></h5>
                    <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                </div>
                <div class="modal-body">
                    <div class="mb-3">
                        <label class="form-label">Ly do (tuy chon)</label>
                        <textarea name="admin_note" class="form-control" rows="3"></textarea>
                    </div>
                </div>
                <div class="modal-footer">
                    <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Huy</button>
                    <button type="submit" class="btn btn-danger">Xac nhan tu choi</button>
                </div>
            </form>
        </div>
    </div>
</div>
<% }) %>
```

### Step 19: Create views/admin/users.ejs
```html
<h2 class="mb-4">Danh sach Users</h2>

<div class="table-responsive">
    <table class="table table-striped table-hover align-middle">
        <thead class="table-dark">
            <tr>
                <th>ID</th>
                <th>Username</th>
                <th>Ten</th>
                <th>So du</th>
                <th>Links</th>
                <th>Don hang</th>
                <th>Referrals</th>
                <th>Ngay tao</th>
            </tr>
        </thead>
        <tbody>
            <% users.forEach(u => { %>
            <tr>
                <td><%= u.id %></td>
                <td>
                    <% if (u.telegram_username) { %>
                        @<%= u.telegram_username %>
                    <% } else { %>
                        <span class="text-muted">-</span>
                    <% } %>
                </td>
                <td><%= u.telegram_first_name %></td>
                <td><%= u.balance.toLocaleString() %>d</td>
                <td><%= u.total_links %></td>
                <td><%= u.order_count %></td>
                <td><%= u.referral_count %></td>
                <td><%= new Date(u.created_at).toLocaleDateString('vi-VN') %></td>
            </tr>
            <% }) %>
        </tbody>
    </table>
</div>
```

### Step 20: Update index.js to start admin server
```javascript
const { createBot } = require('./src/bot');
const { createAdminApp } = require('./src/admin');
const config = require('./src/config');
const logger = require('./src/utils/logger');

async function main() {
    logger.info('Starting Shopee Affiliate Bot...');

    // Create and launch bot
    const bot = createBot();
    
    // Graceful shutdown
    process.once('SIGINT', () => bot.stop('SIGINT'));
    process.once('SIGTERM', () => bot.stop('SIGTERM'));

    await bot.launch();
    logger.info('Bot started successfully');

    // Start admin server
    const adminApp = createAdminApp();
    adminApp.listen(config.app.port, () => {
        logger.info(`Admin panel running at http://localhost:${config.app.port}/admin`);
    });
}

main().catch(err => {
    logger.error('Startup failed', { error: err.message });
    process.exit(1);
});
```

---

## Todo List

- [ ] Create `src/admin/middleware/auth.js`
- [ ] Create `src/admin/index.js`
- [ ] Create `src/admin/routes/auth-routes.js`
- [ ] Create `src/admin/routes/dashboard-routes.js`
- [ ] Create `src/admin/routes/order-routes.js`
- [ ] Create `src/admin/routes/withdraw-routes.js`
- [ ] Create `src/admin/routes/user-routes.js`
- [ ] Create `src/admin/controllers/*.js`
- [ ] Create `views/layouts/admin.ejs`
- [ ] Create `views/partials/sidebar.ejs`
- [ ] Create `views/partials/flash.ejs`
- [ ] Create `views/admin/login.ejs`
- [ ] Create `views/admin/dashboard.ejs`
- [ ] Create `views/admin/orders.ejs`
- [ ] Create `views/admin/withdrawals.ejs`
- [ ] Create `views/admin/users.ejs`
- [ ] Update `index.js` to start admin server
- [ ] Test login/logout flow
- [ ] Test dashboard stats
- [ ] Test order approval with commission
- [ ] Test withdrawal completion
- [ ] Test user list display

---

## Success Criteria

- [ ] Admin login works with env credentials
- [ ] Dashboard shows accurate stats
- [ ] Order approval calculates commission correctly
- [ ] Withdrawal completion deducts balance
- [ ] Flash messages display properly
- [ ] UI responsive on mobile

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Session hijack | Low | High | Secure cookie, HTTPS in prod |
| CSRF attack | Medium | High | Add CSRF tokens (future) |
| Unauthorized access | Low | High | requireAuth on all routes |
