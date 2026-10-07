# FreshFold Laundry Management System

Multi-branch laundry POS & back-office. **Backend:** Laravel 12 REST API · **Frontend:** React 19 + TypeScript + Tailwind v4.

## Quick start (development)

```bash
# Backend
cd backend
composer install
cp .env.example .env && php artisan key:generate   # (already done in this repo)
php artisan migrate:fresh --seed
php artisan serve --host=127.0.0.1 --port=8000

# Frontend (new terminal)
cd frontend
npm install
npm run dev          # http://localhost:5173  (proxies /api and /sanctum to :8000)
```

Seeded dev logins (each must change password on first sign-in) are listed in
`backend/database/seeders/DatabaseSeeder.php`. Set `SEED_ADMIN_PASSWORD` in `.env` before seeding any shared environment.

### Database (XAMPP MySQL / MariaDB)
`backend/.env` is configured for XAMPP MySQL:
```
DB_CONNECTION=mysql
DB_HOST=127.0.0.1
DB_PORT=3306
DB_DATABASE=laundry_system
DB_USERNAME=root
DB_PASSWORD=
```
1. Start MySQL from the XAMPP Control Panel.
2. Create the database (phpMyAdmin → New → `laundry_system`, collation `utf8mb4_unicode_ci`).
3. Either run `php artisan migrate:fresh --seed`, **or** import one of the SQL files in [`database/`](database/):
   - `database/schema.sql` — structure only (60 tables, with foreign keys). Run `php artisan db:seed` afterwards if you want sample data.
   - `database/laundry_system_with_seed_data.sql` — structure + sample branches, users, services and prices.

Automated tests use an in-memory SQLite database, so they never touch your MySQL data.

### Tests
```bash
cd backend && php artisan test
```

## Modules (all 59 requirements)

| Area | Modules |
|---|---|
| Catalog | Service master, categories, variants (weight-range / per-piece / per-item), variant × service price list, bulk price update, promotions (percentage / fixed / package) |
| Sales | POS (weight & piece billing, editable cart, quick/temporary items, hold & recall), receipt + daily queue numbers, order list & search, status tracking + production board, delivery scheduling, pickup / home delivery, item & order notes, advance & balance, split payments (cash/card/bank/cheque), quotations → orders, sales returns, re-wash/complaints, damage & lost register, weight/price calculator |
| Customers | Customer master (search/export), ledger, credit limit, opening balance, on-account settlement, billing plans & subscriptions, SMS (ready / delivered / reminder / e-bill), public e-bill link |
| Inventory | Consumable items, GRN with invoice no, supplier return notes, adjustments, transfers, opening stock, stock count (variance posting), stock records, levels, branch stock |
| Finance | Supplier payments & ledger, cash book, incomes & expenses + categories, cashier shift open/close with cash reconciliation, cheque print register, tax & service-charge rates |
| Admin | Branches, users, user types with permission matrix, branch-wise password policy, receipt preferences, garment barcode tags, receipt reprint, dashboard (date + branch filter), reports (service / branch / cashier / outstanding / profit), Excel export, activity logs |

Weight-range prices are **per kg** for the weight band (e.g. "Up to 5 kg @ 300/kg").

## Security

- **Session auth via Sanctum SPA cookies** — HttpOnly, encrypted, SameSite=Lax; no tokens in localStorage. CSRF (XSRF-TOKEN) on every state-changing request.
- **Login hardening** — rate limited per user+IP and per IP, account lockout after 5 failures (15 min), timing-safe unknown-user handling, session regeneration on login, invalidation on logout.
- **Strong passwords** — 8+ chars, mixed case, number, symbol (breach check via `uncompromised()` in production); forced change on first login / after admin reset; other devices signed out on change.
- **RBAC** — every endpoint is guarded by a `module.action` permission; super-admin role is protected; users can't assign roles above their own permissions or modify themselves.
- **Branch isolation** — single-branch users only ever see their branch's orders, stock, cash and logs (enforced server-side).
- **Server-side pricing** — totals are recalculated on the server; price edits, discounts and quick items require explicit permissions.
- **Validation everywhere** — whitelisted sort/filter columns, length caps, enum checks, row locks for money/stock/number sequences.
- **Security headers** — CSP for API, X-Frame-Options DENY, nosniff, Referrer-Policy, Permissions-Policy, HSTS over HTTPS; restricted CORS.
- **Audit trail** — creates/updates/deletes, logins, failed logins, password changes and price changes are logged with user + IP (passwords never logged).
- **Safe output** — printed receipts escape all data; Excel export neutralises formula injection; e-bill links use 48-char random tokens and expose no internal data.

## Production checklist
- `APP_ENV=production`, `APP_DEBUG=false`, serve over HTTPS, `SESSION_SECURE_COOKIE=true`
- Set `FRONTEND_URL`, `SANCTUM_STATEFUL_DOMAINS`, `SESSION_DOMAIN` to your real domain
- Use MySQL, run `php artisan config:cache route:cache`, build the frontend with `npm run build`
- Put SMS gateway credentials only in `.env` (`SMS_API_URL`, `SMS_API_KEY`)
