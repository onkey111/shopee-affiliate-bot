const express = require('express');
const router = express.Router();
const config = require('../../config');

router.get('/login', (req, res) => {
    if (req.session.user) {
        return res.redirect('/admin/dashboard');
    }
    res.render('admin/login', { layout: false });
});

router.post('/login', (req, res) => {
    const { username, password } = req.body;
    
    if (username === config.admin.user && password === config.admin.password) {
        req.session.user = { username };
        req.flash('success', 'Dang nhap thanh cong!');
        return res.redirect('/admin/dashboard');
    }
    
    req.flash('error', 'Sai ten dang nhap hoac mat khau!');
    res.redirect('/admin/login');
});

router.get('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/admin/login');
});

module.exports = router;

