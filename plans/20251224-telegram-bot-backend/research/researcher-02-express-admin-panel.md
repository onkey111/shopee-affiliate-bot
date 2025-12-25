# Express.js + EJS Admin Panel Patterns

**Date:** 2025-12-24  
**Focus:** Session auth, EJS layouts, Bootstrap 5 tables, form handling, flash messages

---

## 1. Express Session Authentication

### Setup
```javascript
const express = require('express');
const session = require('express-session');

const app = express();

app.use(session({
  secret: process.env.SESSION_SECRET || 'change-me',
  resave: false,
  saveUninitialized: false,
  cookie: { 
    secure: process.env.NODE_ENV === 'production',
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
  }
}));
```

### Auth Middleware
```javascript
// middleware/auth.js
function requireAuth(req, res, next) {
  if (req.session?.admin) return next();
  req.flash('error', 'Vui lòng đăng nhập');
  res.redirect('/admin/login');
}
module.exports = { requireAuth };
```

### Login Route
```javascript
router.post('/login', (req, res) => {
  const { username, password } = req.body;
  if (username === process.env.ADMIN_USER && password === process.env.ADMIN_PASS) {
    req.session.admin = { username };
    req.flash('success', 'Đăng nhập thành công!');
    return res.redirect('/admin/dashboard');
  }
  req.flash('error', 'Sai tài khoản hoặc mật khẩu');
  res.redirect('/admin/login');
});
```

---

## 2. EJS Layout/Partials

### Directory Structure
```
views/
├── layouts/
│   └── admin.ejs
├── partials/
│   ├── navbar.ejs
│   ├── sidebar.ejs
│   └── flash.ejs
└── admin/
    ├── login.ejs
    ├── dashboard.ejs
    ├── orders.ejs
    └── withdrawals.ejs
```

### Setup
```javascript
const expressLayouts = require('express-ejs-layouts');

app.set('view engine', 'ejs');
app.set('views', './views');
app.use(expressLayouts);
app.set('layout', 'layouts/admin');
```

### Layout (views/layouts/admin.ejs)
```html
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title><%= typeof title !== 'undefined' ? title : 'Admin' %></title>
  <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/css/bootstrap.min.css" rel="stylesheet">
  <link href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.1/font/bootstrap-icons.css" rel="stylesheet">
</head>
<body>
  <%- include('../partials/navbar') %>
  <div class="container-fluid">
    <div class="row">
      <%- include('../partials/sidebar') %>
      <main class="col-md-9 ms-sm-auto col-lg-10 px-md-4">
        <%- include('../partials/flash') %>
        <%- body %>
      </main>
    </div>
  </div>
  <script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/js/bootstrap.bundle.min.js"></script>
</body>
</html>
```

### Flash Partial (views/partials/flash.ejs)
```html
<% if (success?.length) { %>
  <div class="alert alert-success alert-dismissible fade show" role="alert">
    <%= success %>
    <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
  </div>
<% } %>
<% if (error?.length) { %>
  <div class="alert alert-danger alert-dismissible fade show" role="alert">
    <%= error %>
    <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
  </div>
<% } %>
```

---

## 3. Bootstrap 5 Table with Actions

```html
<div class="table-responsive">
  <table class="table table-striped table-hover align-middle">
    <thead class="table-dark">
      <tr>
        <th>#</th>
        <th>User</th>
        <th>Order ID</th>
        <th>Status</th>
        <th>Actions</th>
      </tr>
    </thead>
    <tbody>
      <% orders.forEach((order, i) => { %>
      <tr>
        <td><%= i + 1 %></td>
        <td><%= order.telegram_username %></td>
        <td><%= order.shopee_order_id %></td>
        <td>
          <% if (order.status === 'pending') { %>
            <span class="badge bg-warning text-dark">Chờ duyệt</span>
          <% } else if (order.status === 'approved') { %>
            <span class="badge bg-success">Đã duyệt</span>
          <% } else { %>
            <span class="badge bg-danger">Từ chối</span>
          <% } %>
        </td>
        <td>
          <% if (order.status === 'pending') { %>
          <button class="btn btn-success btn-sm" data-bs-toggle="modal" data-bs-target="#approveModal<%= order.id %>">
            <i class="bi bi-check-lg"></i> Duyệt
          </button>
          <form action="/admin/orders/<%= order.id %>/reject" method="POST" class="d-inline">
            <button type="submit" class="btn btn-danger btn-sm">
              <i class="bi bi-x-lg"></i> Từ chối
            </button>
          </form>
          <% } %>
        </td>
      </tr>
      <% }) %>
    </tbody>
  </table>
</div>
```

---

## 4. Approve Modal with Commission Input

```html
<!-- Modal for each order -->
<% orders.filter(o => o.status === 'pending').forEach(order => { %>
<div class="modal fade" id="approveModal<%= order.id %>">
  <div class="modal-dialog">
    <div class="modal-content">
      <form action="/admin/orders/<%= order.id %>/approve" method="POST">
        <div class="modal-header">
          <h5>Duyệt đơn #<%= order.shopee_order_id %></h5>
          <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
        </div>
        <div class="modal-body">
          <div class="mb-3">
            <label class="form-label">Hoa hồng từ Shopee (VND)</label>
            <input type="number" name="commission_total" class="form-control" required min="0">
          </div>
          <small class="text-muted">
            User nhận 40% | Referrer nhận 10% | Owner nhận 50%
          </small>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Hủy</button>
          <button type="submit" class="btn btn-success">Xác nhận duyệt</button>
        </div>
      </form>
    </div>
  </div>
</div>
<% }) %>
```

---

## 5. Form POST Handling with Redirect

```javascript
router.post('/orders/:id/approve', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { commission_total } = req.body;
    
    // Call commission service
    await orderService.approveOrder(id, parseFloat(commission_total));
    
    req.flash('success', `Đơn #${id} đã được duyệt`);
  } catch (err) {
    req.flash('error', 'Lỗi khi duyệt đơn: ' + err.message);
  }
  res.redirect('/admin/orders');
});
```

---

## 6. Flash Messages Setup

```javascript
const flash = require('connect-flash');

// After session middleware
app.use(flash());

// Make flash available in all views
app.use((req, res, next) => {
  res.locals.success = req.flash('success');
  res.locals.error = req.flash('error');
  res.locals.admin = req.session?.admin;
  next();
});
```

---

## Dependencies

```json
{
  "express": "^4.18.2",
  "express-session": "^1.17.3",
  "express-ejs-layouts": "^2.5.1",
  "ejs": "^3.1.9",
  "connect-flash": "^0.1.1"
}
```

---

## Pattern Summary

| Pattern | Implementation |
|---------|---------------|
| Session Auth | `express-session` + middleware |
| Layouts | `express-ejs-layouts` + `<%- body %>` |
| Partials | `<%- include('path') %>` |
| Flash | `connect-flash` + `res.locals` |
| Actions | Modal form with POST |
| Redirect | PRG pattern after mutations |

---

## Unresolved Questions

None - patterns well-established.
