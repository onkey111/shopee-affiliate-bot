# Telegram Bot Backend for Shopee Affiliate

**Created:** 2025-12-24  
**Status:** Planning  
**Tech Stack:** Node.js, Telegraf 4.x, Express 4.x, PostgreSQL, EJS+Bootstrap5

---

## Overview

Telegram bot for Shopee affiliate link conversion with 1-tier referral system, user balance management, withdrawal flow, and admin web panel.

**Key Specs:**
- Commission Split: 5:4:1 (owner 50% : user 40% : referrer 10%)
- Rate Limit: 5 links/day/user
- Min Withdraw: 100,000 VND

---

## Phase Overview

| Phase | Name | Status | Dependency | Est. |
|-------|------|--------|------------|------|
| 1 | [Core Infrastructure](./phase-01-core-infrastructure.md) | pending | - | 2h |
| 2 | [User Management](./phase-02-user-management.md) | pending | Phase 1 | 3h |
| 3 | [Affiliate Link Feature](./phase-03-affiliate-link-feature.md) | pending | Phase 2 | 2h |
| 4 | [Commission & Balance](./phase-04-commission-balance.md) | pending | Phase 3 | 2h |
| 5 | [Withdrawal](./phase-05-withdrawal.md) | pending | Phase 4 | 2h |
| 6 | [Admin Panel](./phase-06-admin-panel.md) | pending | Phase 4 | 4h |
| 7 | [Notifications](./phase-07-notifications.md) | pending | Phase 6 | 1h |

**Total Estimate:** ~16 hours

---

## Dependency Diagram

```
Phase 1 (Infrastructure)
    |
    v
Phase 2 (Users)
    |
    v
Phase 3 (Affiliate)
    |
    v
Phase 4 (Commission) ----+
    |                    |
    v                    v
Phase 5 (Withdraw)   Phase 6 (Admin)
                         |
                         v
                     Phase 7 (Notifications)
```

---

## Project Structure

```
src/
├── bot/
│   ├── index.js              # Bot init + launch
│   ├── commands/             # /start, /help
│   ├── callbacks/            # Menu actions
│   ├── keyboards/            # Inline keyboards
│   └── scenes/               # WizardScenes
├── admin/
│   ├── index.js              # Express app
│   ├── routes/
│   ├── controllers/
│   └── middleware/
├── services/                 # Business logic
├── db/
│   ├── connection.js
│   ├── migrations/
│   └── repositories/
├── utils/
└── config/
views/                        # EJS templates
├── layouts/
├── partials/
└── admin/
```

---

## Success Criteria

- [ ] Bot responds <2s for menu actions
- [ ] Affiliate conversion <30s
- [ ] Admin can approve order <30s
- [ ] Commission calculation accurate (5:4:1)
- [ ] Rate limiting enforced (5/day)
- [ ] Notifications delivered on order/withdraw approval

---

## Research References

- [Telegraf Patterns](./research/researcher-01-telegraf-patterns.md)
- [Express Admin Panel](./research/researcher-02-express-admin-panel.md)
- [Brainstorm Report](../reports/brainstorm-20251224-telegram-bot-backend.md)

---

## Existing Code to Reuse

- `shopee-affiliate-fast.js` - `convertToAffiliateLink()` function
