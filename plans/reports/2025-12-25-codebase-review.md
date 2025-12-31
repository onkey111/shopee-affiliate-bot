# Codebase Review Report: Shopee Affiliate Telegram Bot

**Date:** 2025-12-25  
**Reviewer:** Claude Code  
**Scope:** Full codebase analysis

---

## Executive Summary

This is a Telegram bot for Shopee affiliate link conversion. Users send Shopee product links, bot converts them to affiliate links via browser automation (Puppeteer), tracks orders/commissions, and supports withdrawals. Architecture is well-structured with worker separation, queue system, and resilience patterns.

**Overall Assessment:** Good foundation with professional patterns. Some security and code quality issues need attention.

---

## 1. Project Overview

### Tech Stack
- **Runtime:** Node.js
- **Bot Framework:** Telegraf (Telegram Bot API)
- **Web Server:** Express.js
- **Database:** PostgreSQL
- **Queue:** BullMQ + Redis
- **Browser Automation:** Puppeteer-extra + Stealth plugin
- **Views:** EJS templates

### Architecture
```
┌─────────────────┐     ┌─────────────────┐
│   Main Process  │     │  Worker Process │
│   (index.js)    │     │   (worker.js)   │
├─────────────────┤     ├─────────────────┤
│ - Telegram Bot  │     │ - BullMQ Worker │
│ - Admin Panel   │     │ - Browser Pool  │
│ - Webhook/ngrok │     │ - Link Convert  │
└────────┬────────┘     └────────┬────────┘
         │                       │
         └───────────┬───────────┘
                     │
              ┌──────┴──────┐
              │   Redis     │
              │  (BullMQ)   │
              └──────┬──────┘
                     │
              ┌──────┴──────┐
              │  PostgreSQL │
              └─────────────┘
```

### File Structure (65 source files)
```
├── index.js              # Main entry (webhook + admin)
├── worker.js             # Worker entry (queue processor)
├── src/
│   ├── admin/            # Admin panel (Express routes)
│   ├── bot/              # Telegram bot handlers
│   │   ├── commands/     # /start, /stats, /balance, etc.
│   │   ├── handlers/     # Link, order, withdraw handlers
│   │   ├── callbacks/    # Inline button callbacks
│   │   └── keyboards/    # Menu keyboards
│   ├── config/           # Config from env vars
│   ├── db/
│   │   ├── migrations/   # SQL schema (2 files)
│   │   └── repositories/ # Data access layer
│   ├── queues/           # BullMQ queue definitions
│   ├── services/         # Business logic layer
│   ├── utils/            # Helpers (logger, validators, etc.)
│   └── workers/          # Queue processors
└── views/                # EJS admin templates
```

---

## 2. Strengths

### 2.1 Architecture Patterns
- **Worker Separation:** Main process handles webhooks (fast response), worker handles slow browser automation
- **Queue-based Processing:** BullMQ with retries, dead-letter queue, rate limiting
- **Repository Pattern:** Clean data access layer with parameterized queries
- **Service Layer:** Business logic separated from handlers
- **Circuit Breaker:** Protects against Shopee API failures
- **Browser Pool:** generic-pool for efficient browser reuse (2-5 instances)

### 2.2 Resilience Features
- **Retry with Exponential Backoff:** Configurable retry strategy
- **Dead Letter Queue:** Failed jobs tracked for manual review
- **Alert Service:** Admin notifications with cooldown (prevents spam)
- **Graceful Shutdown:** Both processes handle SIGINT/SIGTERM properly
- **Queue Metrics:** Processing time, failure rate tracking

### 2.3 Code Organization
- Consistent file naming
- Good separation of concerns
- Config externalized to environment variables
- Docker Compose for dev dependencies (PostgreSQL, Redis)

---

## 3. Security Issues

### 3.1 CRITICAL: SQL Injection in `getFailureRate`
**File:** `src/db/repositories/job-repository.js:232`
```javascript
const result = await db.query(`
    SELECT ... FROM conversion_jobs
    WHERE created_at > NOW() - INTERVAL '${hours} hours'  // ← String interpolation!
`);
```
**Risk:** If `hours` is user-controlled, SQL injection possible.  
**Fix:** Use parameterized query: `NOW() - $1 * INTERVAL '1 hour'`

### 3.2 HIGH: Weak Default Credentials
**File:** `src/config/index.js`
```javascript
admin: {
    user: process.env.ADMIN_USER || 'admin',
    password: process.env.ADMIN_PASSWORD || 'admin123',  // ← Weak default
    sessionSecret: process.env.SESSION_SECRET || 'change-me-in-production'
}
```
**Risk:** If env vars not set, default credentials used in production.  
**Fix:** Remove defaults or fail startup if not set.

### 3.3 MEDIUM: Plain-text Password Comparison
**File:** `src/admin/routes/auth.js`
```javascript
if (username === config.admin.user && password === config.admin.password) {
```
**Risk:** No rate limiting, no password hashing.  
**Recommendation:** Add bcrypt hashing, login rate limiting.

### 3.4 MEDIUM: Session Cookie Security
**File:** `src/admin/index.js`
```javascript
cookie: { maxAge: 24 * 60 * 60 * 1000 }  // Missing: secure, httpOnly, sameSite
```
**Fix:** Add `secure: true` (in prod), `httpOnly: true`, `sameSite: 'strict'`

### 3.5 LOW: Cookies File Handling
**File:** `src/services/affiliate-service.js`
- `.cookies.json` read from disk synchronously
- No validation of cookie data structure
- Potential path traversal if `cookiesFile` path modified

---

## 4. Code Quality Issues

### 4.1 Error Handling

**DB Connection Fatal Exit:**
```javascript
// src/db/connection.js
pool.on('error', (err) => {
    console.error('Unexpected DB error:', err);
    process.exit(-1);  // ← Abrupt exit, no cleanup
});
```
**Fix:** Use logger, trigger graceful shutdown.

**Bot Error Swallowing:**
```javascript
ctx.reply('...').catch(() => {});  // ← Silent failure
```
**Fix:** Log the error at minimum.

### 4.2 Logger Implementation
Current logger is minimal (console.log JSON). Missing:
- Log levels filtering
- File output option
- Log rotation
- Structured error stack traces

### 4.3 Hardcoded Vietnamese Text
All user messages hardcoded in handlers:
```javascript
await ctx.reply('❌ Ban da het luot tao link hom nay!');
```
**Recommendation:** Extract to i18n constants for maintainability.

### 4.4 Dashboard SQL in Route
**File:** `src/admin/routes/dashboard.js`
Raw SQL queries in route handler instead of using repositories.

### 4.5 Missing Input Validation
- `hours` parameter in `getFailureRate` not validated as integer
- No maximum limit check on pagination parameters

---

## 5. Database Analysis

### 5.1 Schema Design
- **Tables:** users, bank_accounts, links, orders, commissions, withdrawals, conversion_jobs, dead_letter_jobs
- **Proper FK constraints** with ON DELETE rules
- **Indexes** on frequently queried columns (telegram_id, ref_code, status)
- **ENUM types** for statuses (order_status, withdraw_status, job_status)

### 5.2 Recommendations
1. Add `updated_at` to `conversion_jobs` table
2. Consider `created_at` index on `links` for daily limit check performance
3. Add composite index on `(user_id, created_at)` for user job queries

---

## 6. Performance Considerations

### 6.1 Good Practices
- Browser pool (2-5 instances) prevents resource exhaustion
- Request interception blocks images/fonts/analytics (faster page loads)
- Queue rate limiting (10 jobs per second)
- Connection pooling for PostgreSQL (max 20)

### 6.2 Potential Issues
- **Synchronous File Reads:** `loadCookies()` uses `fs.readFileSync`
- **No Caching:** User profile fetched on every request
- **Daily Link Count:** Queries DB each time instead of caching

---

## 7. Missing Features / Tech Debt

| Item | Priority | Description |
|------|----------|-------------|
| Tests | High | No test files in codebase |
| README.md | High | Empty, needs setup instructions |
| Documentation | Medium | Missing `docs/` content |
| Input Sanitization | Medium | URL validation exists but limited |
| Rate Limiting | Medium | No rate limiting on Telegram commands |
| Logging | Low | Upgrade to winston/pino |
| i18n | Low | Extract hardcoded Vietnamese strings |

---

## 8. Recommendations Summary

### Immediate (Security)
1. Fix SQL injection in `getFailureRate` - use parameterized query
2. Remove default admin credentials or fail on missing env vars
3. Add cookie security flags (httpOnly, secure, sameSite)
4. Add login rate limiting

### Short-term (Quality)
5. Add error logging instead of swallowing
6. Validate pagination/numeric parameters
7. Move dashboard SQL to repository layer
8. Add basic test suite

### Medium-term (Maintenance)
9. Create README with setup instructions
10. Document API/architecture in `docs/`
11. Extract messages to i18n constants
12. Upgrade logger with levels and file output

---

## 9. Metrics

| Metric | Value |
|--------|-------|
| Total Source Files | 65 |
| JavaScript Files | 53 |
| SQL Migrations | 2 |
| EJS Views | 8 |
| Lines of Code (est.) | ~4,500 |
| Dependencies | 13 runtime, 1 dev |

---

## 10. Conclusion

The codebase demonstrates solid software engineering practices:
- Clean architecture with worker separation
- Proper use of queues for async processing
- Resilience patterns (circuit breaker, retry, alerts)
- Repository pattern for data access

**Priority fixes needed:**
1. SQL injection vulnerability
2. Weak default credentials
3. Session security configuration
4. Add test coverage

The foundation is production-ready once security issues are addressed.

---

## Unresolved Questions

1. Why is `README.md` empty? Was documentation planned?
2. Are `.cookies.json` credentials refreshed automatically or manually?
3. Is there a deployment strategy (Dockerfile, CI/CD)?
4. What's the expected scale (users/day, links/day)?
