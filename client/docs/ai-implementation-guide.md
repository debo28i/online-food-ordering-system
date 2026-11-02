# AI Implementation Guide — Online Food Ordering System

> Companion to [`architecture.md`](./architecture.md). The architecture document is the **source of truth**;
> this guide tells an AI coding agent **how to build, test, and verify** the system, in what order,
> and with which guardrails.
>
> SRS: [`../guide/Online_Food_Ordering_System_SRS_Debopriya_Dey_Final.pdf`](../guide/Online_Food_Ordering_System_SRS_Debopriya_Dey_Final.pdf) (v2.1)
> Project root: `D:\Online-food-ordering-system\client`

---

## 0. How to use this guide

1. Read this guide fully, then read `architecture.md` sections 3–10 before writing code.
2. Work **one phase at a time** (§7). Do not start a phase until the previous phase's exit checks pass.
3. For each task: inspect existing files → plan the change → implement → run tests/lint → report.
4. Keep a short progress log (§14). Update the log after every phase.
5. If the SRS and this guide disagree, follow the SRS. If the SRS is silent, follow `architecture.md`.
   If both are silent, choose the simplest secure option, note it in the progress log, and continue.

**Do not** rewrite the architecture, rename public API routes, change status/role constants,
or introduce a new framework without an explicit user decision.

---

## 1. Non-negotiable invariants

These rules are never optional. A task is not complete if any is violated.

| # | Invariant |
|---|---|
| I1 | The server is the only authority for prices, fees, taxes, discounts, totals, availability, and status transitions (BR-3). |
| I2 | Money is stored and computed as **integers in minor units** (`priceMinor`, `totalMinor`, …). No floats. |
| I3 | Passwords are bcrypt-hashed (cost 12). Hashes, tokens, and secrets never appear in responses or logs. |
| I4 | Every protected endpoint enforces authentication, role, and **ownership** server-side. |
| I5 | Customers can read/modify only their own addresses, cart, profile, and orders. |
| I6 | Orders store **purchase-time snapshots** of item name, unit price, quantity, subtotal (FR-4.4). |
| I7 | Checkout requires `Idempotency-Key`; the same key returns the same order, never a duplicate. |
| I8 | Status changes follow the transition matrix and use atomic compare-and-set; history is append-only. |
| I9 | Failed requests return the standard error envelope; no success is reported before persistence succeeds. |
| I10 | All list endpoints paginate (`page`, `limit`, max 100) and use the standard `meta`. |
| I11 | No secrets or credentials in source files; configuration comes from environment variables. |
| I12 | Menu items are soft-deactivated (`isActive=false`), never hard-deleted when referenced. |

---

## 2. Stack and versions

| Area | Choice |
|---|---|
| Runtime | Node.js 20 LTS (use `>=20` in `engines`) |
| Backend | Express 4, ES modules (`"type": "module"`) |
| Database | MongoDB 7 + Mongoose 8 |
| Validation | Zod |
| Auth | `jsonwebtoken`, `bcrypt` (or `bcryptjs` if native build fails), `cookie-parser` |
| Security | `helmet`, `cors`, `express-rate-limit` |
| Logging | `pino`, `pino-http` |
| Backend tests | `vitest`, `supertest`, `mongodb-memory-server` |
| Frontend | React 18 + Vite 5, React Router 6, TanStack Query 5 |
| Frontend tests | `vitest`, `@testing-library/react`, `@testing-library/user-event`, `jsdom` |
| Lint/format | ESLint (flat config) + Prettier |
| Deployment | Docker + Docker Compose (optional but documented) |

If a dependency fails to install on Windows, use the pure-JS alternative (`bcryptjs`) and record it.

---

## 3. Target repository layout

Create this structure as phases require it. Do not create empty placeholder modules "for later".

```
D:\Online-food-ordering-system\client\
├── docs/
│   ├── architecture.md
│   └── ai-implementation-guide.md
├── README.md
├── .gitignore
├── docker-compose.yml
├── guide\
│   └── Online_Food_Ordering_System_SRS_Debopriya_Dey_Final.pdf
├── client\
│   ├── package.json
│   ├── vite.config.js
│   ├── eslint.config.js
│   ├── .env.example
│   ├── index.html
│   └── src\
│       ├── main.jsx
│       ├── App.jsx
│       ├── api\            # client.js + per-domain api modules
│       ├── features\       # auth, menu, cart, checkout, orders, profile, admin, delivery
│       ├── components\     # layout + ui primitives
│       ├── context\        # AuthContext, ToastContext
│       ├── hooks\
│       ├── lib\            # constants, formatMoney, queryKeys, validators
│       ├── routes\         # ProtectedRoute, RoleRoute
│       └── styles\
└── server\
    ├── package.json
    ├── .env.example
    ├── eslint.config.js
    ├── src\
    │   ├── server.js
    │   ├── app.js
    │   ├── config\         # env, db, constants
    │   ├── routes\
    │   ├── controllers\
    │   ├── services\       # + providers/
    │   ├── repositories\
    │   ├── models\
    │   ├── validators\
    │   ├── middleware\
    │   ├── utils\
    │   └── tests\          # unit/, integration/, helpers/
    └── scripts\
        └── seed.js
```

Root `package.json` is optional. If added, use npm workspaces (`client`, `server`) and root scripts:
`dev`, `test`, `lint`, `build`. Otherwise document separate commands.

---

## 4. Commands

All commands must be runnable from a clean checkout. Record any deviation in `README.md`.

```powershell
# Database (local)
docker compose up -d mongo

# Server
cd server
copy .env.example .env
npm install
npm run dev            # http://localhost:5000
npm run seed           # demo admin, delivery user, menu items
npm test               # unit + integration
npm run lint

# Client
cd client
copy .env.example .env
npm install
npm run dev            # http://localhost:5173
npm test
npm run lint
npm run build
```

Required scripts:
- server: `dev`, `start`, `test`, `test:watch`, `lint`, `seed`
- client: `dev`, `build`, `preview`, `test`, `lint`

**Verification rule:** after every phase run `npm test` and `npm run lint` in the touched package.
Never claim a phase is done with failing tests.

---

## 5. Coding conventions

### 5.1 General
- JavaScript ES modules; `camelCase` variables/functions, `PascalCase` React components/models-by-name.
- Files: `kebab-case` for server (`order.service.js`), `PascalCase.jsx` for components, `camelCase.js` for libs.
- Prefer small pure functions for business rules (pricing, transitions) so they are unit-testable.
- No comments that restate code. Comments only for non-obvious rules or SRS references (e.g. `// BR-4`).
- Handle every promise; use `asyncHandler` for controllers.
- Never `console.log` in server code; use the configured logger.

### 5.2 Server layering
```
route -> authenticate/authorize -> validate -> controller -> service -> repository -> model
```
- A **controller** only: reads `req`, calls one service, sends the envelope. No DB access, no business logic.
- A **service** receives plain arguments (ids, DTOs), throws `ApiError`, returns domain objects. No `req`/`res`.
- A **repository** contains Mongoose queries only.
- A **model** contains schema, indexes, and minimal hooks. No business workflows.
- Never import a controller from a service or a model from a controller.

### 5.3 Response envelope
Success: `{ success: true, data, meta? }` — lists include `meta {page, limit, total, totalPages}`.
Error: `{ success: false, error: { code, message, details? } }`.
Use `res.status(code).json(...)`; 204 has no body.

### 5.4 Errors
- Throw `new ApiError(status, code, message, details?)` from services.
- Central error handler maps `ApiError`, Zod errors (`VALIDATION_ERROR`), Mongoose duplicate key (`CONFLICT`),
  invalid ObjectId (`VALIDATION_ERROR`), and unknown errors (`INTERNAL_ERROR`, no stack in production).
- Never send raw DB errors or stacks to clients.

### 5.5 Money and dates
- Use `money.js` helpers (`toMinor`, `multiply`, `sum`, `applyBps`) for all arithmetic.
- API field names end in `Minor`. Client uses `formatMoney(minor, currency)`.
- Dates are ISO-8601 UTC strings in JSON; store as `Date` in Mongo.
- Order numbers: `ORD-YYYYMMDD-NNNN` via atomic counter; never reuse.

### 5.6 Constants (single source per side)
```js
export const ROLES = Object.freeze({ CUSTOMER: 'CUSTOMER', ADMIN: 'ADMIN', DELIVERY: 'DELIVERY' });
export const ORDER_STATUS = Object.freeze({
  PLACED: 'PLACED', CONFIRMED: 'CONFIRMED', PREPARING: 'PREPARING',
  READY_FOR_PICKUP: 'READY_FOR_PICKUP', OUT_FOR_DELIVERY: 'OUT_FOR_DELIVERY',
  DELIVERED: 'DELIVERED', CANCELLED: 'CANCELLED',
});
export const PAYMENT_STATUS = Object.freeze({
  PENDING: 'PENDING', PAID: 'PAID', FAILED: 'FAILED', REFUNDED: 'REFUNDED', CANCELLED: 'CANCELLED',
});
export const PAYMENT_METHOD = Object.freeze({ COD: 'COD', ONLINE: 'ONLINE' });
```
Server constants drive the transition matrix. Client constants only drive display; never trust them server-side.

### 5.7 Naming for API fields
Use the field names defined in `architecture.md` §7–8 exactly (`orderNumber`, `priceMinor`, `orderStatus`,
`paymentStatus`, `idempotencyKey`, etc.). Do not introduce aliases.

---

## 6. Security checklist (apply to every endpoint)

- [ ] `authenticate` on all non-public routes.
- [ ] `authorize(ROLES.X)` for role-restricted routes.
- [ ] Ownership check in the service/repository for customer resources.
- [ ] Zod validation for body, query, and params; strips unknown keys.
- [ ] No secret/hash/token in the response DTO.
- [ ] Rate limit class applied (auth vs write vs read).
- [ ] Errors use `ApiError` and the standard envelope.
- [ ] No user input interpolated into queries; escape regex search terms.
- [ ] Logs redact `authorization`, `cookie`, `password`, `passwordHash`, payment payloads.
- [ ] `/auth/*` uses the httpOnly refresh cookie; access token is short-lived.

---

## 7. Implementation phases

Work in order. Each phase has: goal, tasks, files, API, tests, and **exit checks**.
Mark the phase complete only when all exit checks pass.

---

### Phase 0 — Project scaffold and foundation

**Goal:** Both apps run; DB connects; health endpoint works; lint/tests are configured.

**Tasks**
1. Initialize `server/` (`npm init`, ESM, scripts, dependencies).
2. `config/env.js`: load `.env`, validate required vars (`MONGODB_URI`, JWT secrets, `CORS_ORIGINS`),
   export typed config; fail fast on missing values.
3. `config/db.js`: `connectDB()` / `disconnectDB()` with clear log messages.
4. `config/constants.js`: roles, statuses, methods, transition matrix placeholder.
5. `app.js`: helmet, cors allowlist, json limit 100kb, cookie-parser, request-id, pino-http,
   `/api/v1` router mount, `not-found`, `error-handler`.
6. `server.js`: connect DB → listen; graceful `SIGINT`/`SIGTERM` shutdown.
7. `utils/`: `ApiError`, `asyncHandler`, `logger`, `money`, `pagination`.
8. `GET /health` and `GET /health/ready`.
9. Initialize `client/` with Vite React, ESLint, Prettier, `VITE_API_BASE_URL`.
10. `.gitignore` (node_modules, .env, dist, coverage), `.env.example` for both apps.
11. `README.md` with setup commands.
12. Root `docker-compose.yml` with `mongo` service and healthcheck.

**Exit checks**
- `server: npm run dev` boots and logs the port; `/api/v1/health` → `{success:true,...}`.
- `server: npm run lint` passes; `npm test` runs (even if 0 tests, config is valid).
- `client: npm run dev` renders a placeholder; `npm run build` succeeds.
- Missing env var produces a clear startup error (verify once, then restore).

---

### Phase 1 — Authentication, users, and RBAC

**Goal:** Register/login/refresh/logout work; protected routes reject unauthenticated/wrong roles.

**Tasks**
1. `user.model.js`: fields + unique email/phone indexes; `toJSON` removes `passwordHash`.
2. `refresh-token.model.js`: hashed token, TTL index.
3. `auth.validator.js`: register/login schemas (name 2–80, valid email, phone pattern, password ≥ 8
   with letter+digit).
4. `tokens.js`: sign/verify access; generate opaque refresh; SHA-256 hash helper.
5. `auth.service.js`: register (normalize email, uniqueness, bcrypt hash), login (compare, issue tokens,
   store refresh hash), refresh (verify + rotate + revoke old), logout (revoke).
6. `authenticate.js`: parse Bearer, verify, attach `req.user = { id, role }`; 401 on failure.
7. `authorize.js`: role guard middleware.
8. `auth.controller.js` + `auth.routes.js` + `authenticate` on `/auth/me`, `/auth/logout`.
9. `user.service/controller/repo/routes`: `GET/PATCH /users/me`.
10. Seed script: admin + delivery + a few customers (passwords from env or documented defaults).
11. Client: `AuthContext`, login/register pages, `ProtectedRoute`, `RoleRoute`, API client with
    401 → refresh-once → retry, logout.

**API**
`POST /auth/register`, `POST /auth/login`, `POST /auth/refresh`, `POST /auth/logout`,
`GET /auth/me`, `GET /users/me`, `PATCH /users/me`.

**Tests**
- Register success; duplicate email → 409; weak password → 400.
- Login success returns access token + refresh cookie; wrong password → 401.
- Refresh rotates and old token cannot be reused.
- `/auth/me` without token → 401; with token → profile without `passwordHash`.
- Customer hitting admin-only probe → 403.

**Exit checks**
- Manual: register → login → refresh → me → logout via HTTP client.
- `passwordHash` never appears in any response.
- All auth tests pass.

**SRS:** FR-1.1–1.4, FR-8.2 (profile), BR-1.

---

### Phase 2 — Menu browsing and admin menu management

**Goal:** Public menu with search/filter/pagination; admins manage items and availability.

**Tasks**
1. `menu-item.model.js`: fields, text index, category/availability index.
2. `menu.validator.js`: create/update, query (page/limit/category/q/available), price integer ≥ 0.
3. `menu.repo.js`: list with filters/pagination, categories distinct, findById, create/update.
4. `menu.service.js`: public list (only `isActive=true`), search with escaped regex, categories,
     admin create/update/soft-delete/toggle availability.
5. `menu.controller/routes`: public GETs; admin POST/PATCH/DELETE/toggle.
6. Seed: categories and ~10 items across categories with images.
7. Client: `MenuPage` with category tabs, search (debounced), item cards, disabled state for
     unavailable items, add-to-cart hook (cart arrives in Phase 3; stub the handler).
8. Client admin: `MenuManager` table + create/edit form + availability toggle.

**API**
`GET /menu`, `GET /menu/categories`, `GET /menu/:id`,
`POST /menu`, `PATCH /menu/:id`, `DELETE /menu/:id`, `PATCH /menu/:id/availability` (admin).

**Tests**
- Pagination `meta` correct; filters by category; search matches name/description; inactive hidden.
- Non-admin create/update → 403.
- Soft-delete hides item from public list but keeps it in DB.
- Unavailable flag returned and cannot be ordered (cart test in Phase 3).

**Exit checks**
- Public menu renders seeded items; search/filter work; admin toggles availability and it reflects publicly.
- No internal field leaks.

**SRS:** FR-2.1–2.3, FR-7.1–7.2.

---

### Phase 3 — Cart

**Goal:** Server-backed cart with quantity rules and live pricing.

**Tasks**
1. `cart.model.js`: one per user, embedded items, unique user index.
2. `cart.validator.js`: add/set quantity `[1,99]`, ObjectId params.
3. `cart.repo.js`: find by user, upsert/add line, set quantity, remove line, clear.
4. `cart.service.js`:
   - On add: verify item exists, active, available → else `409 ITEM_UNAVAILABLE`.
   - Merge existing lines (cap 99); reject invalid quantity.
   - `getCart`: join live menu items, compute `subtotalMinor`, `itemCount`, flag unavailable lines.
5. `cart.controller/routes` (customer only).
6. Client: `CartPage`, line quantity controls, remove/clear, subtotal; cart badge in header;
   TanStack Query keys `['cart']`, invalidate after mutations; optimistic quantity with rollback.

**API**
`GET /cart`, `POST /cart/items`, `PATCH /cart/items/:menuItemId`,
`DELETE /cart/items/:menuItemId`, `DELETE /cart`.

**Tests**
- Add merges quantity; add unavailable → 409; quantity 0/100 → 400.
- Remove line; clear cart; cart persists across requests.
- Subtotals computed from DB price, not client input.
- One user cannot see another user's cart.

**Exit checks**
- Manual add/update/remove/clear; totals correct; unavailable item blocked.
- Cart persists after logout/login for the same user.

**SRS:** FR-3.1–3.4, FR-2.3, BR-2.

---

### Phase 4 — Checkout, order placement, and order history

**Goal:** Idempotent order creation with server-calculated bill and snapshots.

**Tasks**
1. `pricing.service.js` + `money.js`: subtotal, delivery fee (threshold waived), tax bps, discount hook,
     total; integer math; unit-tested.
2. `counter.model/repo.js`: atomic `$inc` per day; `order-number.js`.
3. `order.model.js`: all fields/indexes from `architecture.md` §8.2, embedded items/history.
4. `order.validator.js`: create (addressId or address, paymentMethod, notes), status, assign, list query.
5. `order.service.create`:
   - Load existing order by `(userId, idempotencyKey)` → return it (200).
   - Cart non-empty → else `409 CART_EMPTY`.
   - Load current items; any inactive/unavailable → `409 ITEM_UNAVAILABLE`.
   - Compute pricing server-side; ignore any client totals.
   - Verify address ownership; snapshot address.
   - Generate order number; insert order (PLACED + history + item snapshots).
   - Create payment record (`method`, `amountMinor = total`, `PENDING`).
   - Clear cart.
   - Use a Mongo transaction when the deployment supports replica sets; otherwise keep the
     order write authoritative and make payment creation idempotent (see `architecture.md` §10.4).
6. `idempotency` middleware or service-level handling; unique partial index.
7. `order.service.list` (own, paginated) and `getByNumber` (owner/role guard).
8. Client: `CheckoutPage` (select address, payment method, summary), `OrdersPage`, `OrderDetailPage`
   with status timeline; generate idempotency key per checkout session.

**API**
`POST /orders` (Idempotency-Key), `GET /orders`, `GET /orders/:orderNumber`.

**Tests**
- Pricing: zero tax, free-delivery threshold, rounding, snapshots equal DB prices.
- Empty cart → 409; unavailable item → 409; unowned address → 404/403.
- Same idempotency key twice → one order; different payload/key → conflict or new order as specified.
- Client-sent `totalMinor` ignored (send one, assert server value).
- History isolation: customer B cannot read customer A's order.
- Order retains old price after admin changes menu price.

**Exit checks**
- Manual COD checkout end-to-end; order number generated; cart cleared; order visible in history.
- Double-click checkout creates exactly one order.

**SRS:** FR-4.1–4.4, FR-6.3, FR-8.1, BR-1–BR-3.

---

### Phase 5 — Payments

**Goal:** COD and simulated online payment with server-side verification.

**Tasks**
1. `payment.model.js` + indexes (transactionReference unique sparse).
2. `PaymentProvider` contract; `SimulatedProvider` (`createIntent`, `verifyWebhook`/`verify`, `refund`);
   `gateway.provider.js` stub that throws "not configured".
3. `payment.service`:
   - Reuse/create payment for an order (amount must equal order total).
   - `initiate`: owner, unpaid, non-cancelled; `PENDING` + `providerRef`.
   - `confirm` (simulated only, `PAYMENT_MODE=simulated`): mark `PAID`, `verifiedAt`, order `paymentStatus=PAID`.
   - `webhook`: verify signature + amount; idempotent update; reject unverified.
   - `refund` (simulated): mark `REFUNDED` with reference.
4. Wire statuses: COD → `PAID` when order becomes `DELIVERED`; cancellation → `CANCELLED`/`REFUNDED`.
5. Client: payment selector, simulated pay/confirm screen, payment status display; never trust redirect alone.

**API**
`POST /payments/:orderNumber/initiate`, `POST /payments/:orderNumber/confirm`,
`POST /payments/webhook`, `GET /payments/:orderNumber`.

**Tests**
- COD payment starts `PENDING`, becomes `PAID` on delivered.
- Simulated online: initiate → confirm → `PAID`; failure path records `FAILED` and order stays unpaid.
- `confirm` disabled when `PAYMENT_MODE=gateway`.
- Webhook with bad signature → 401/400, no status change.
- Amount mismatch → rejected.
- Non-owner initiate → 403.

**Exit checks**
- Manual: pay online in simulated mode; order shows paid; duplicate confirm is idempotent.
- No endpoint other than the server can set `PAID`.

**SRS:** FR-5.1–5.4, NFR §5.2, §5.3.

---

### Phase 6 — Order status workflow, cancellation, delivery

**Goal:** Controlled transitions, customer cancellation, admin assignment, delivery updates.

**Tasks**
1. `order-status.service.js`: `canTransition(from, to, actorRole)`, cancellation window guard,
   append history; atomic `findOneAndUpdate({_id, orderStatus: from}, ...)`.
2. `PATCH /orders/:orderNumber/status`: admin, or assigned delivery for delivery transitions.
3. `POST /orders/:orderNumber/cancel`: customer (owner, window/state) or admin (pre-dispatch);
   update payment on cancel.
4. `PATCH /orders/:orderNumber/assign`: admin; target must be active `DELIVERY`.
5. `GET /admin/orders` with status/date filters; `GET /delivery/orders` (assigned only).
6. Client: admin order board (status columns/filter, transition buttons, assign dialog);
   delivery board and detail; customer cancel button with policy messaging; status timeline refresh.

**API**
`PATCH /orders/:orderNumber/status`, `POST /orders/:orderNumber/cancel`,
`PATCH /orders/:orderNumber/assign`, `GET /admin/orders`, `GET /delivery/orders`.

**Tests**
- Every allowed transition succeeds for the right actor; every forbidden one → 409/403.
- `OUT_FOR_DELIVERY → DELIVERED` only after dispatch; `PLACED → DELIVERED` rejected (BR-4).
- Delivery user cannot update unassigned or others' orders.
- Customer cancel within window works; outside window → 409; after dispatch → forbidden.
- History appends with actor/timestamp; concurrent transitions: only one wins.
- COD paid on delivered; paid order cancelled → refunded.

**Exit checks**
- Manual: admin confirms → prepares → ready → assigns delivery → delivery picks up → delivered.
- Cancel flows behave per policy; history is complete.

**SRS:** FR-6.1–6.3, FR-7.3–7.4, BR-4–BR-6.

---

### Phase 7 — Addresses, profile, and admin reports

**Goal:** Complete customer profile/address book and basic admin reporting.

**Tasks**
1. `address` model/validator/repo/service/routes with ownership; one default per user.
2. Client profile page + address book (create/edit/delete/set default), integrated with checkout.
3. `report.service`: order counts by status, revenue (sum `totalMinor` of `PAID`/`DELIVERED`), top items
   by quantity, optional date range; admin-only.
4. `GET /admin/reports/summary`; client admin dashboard cards + simple table.

**API**
`GET/POST /addresses`, `PATCH/DELETE /addresses/:id`, `GET /admin/reports/summary`.

**Tests**
- Address CRUD ownership; cannot access another user's address.
- Reports only include the admin's data set and respect date range.
- Default address behavior.

**Exit checks**
- Manual: save address during checkout, reuse later; profile updates persist.
- Reports numbers match seeded/created orders.

**SRS:** FR-8.1–8.3, FR-7.3 (reports), §6.4 privacy.

---

### Phase 8 — Frontend completion and polish

**Goal:** Every SRS screen is functional, responsive, accessible, and consistent.

**Tasks**
1. Shared UI primitives: Button, Input, Select, Modal, Toast, Spinner, EmptyState, ErrorState,
   Pagination, Badge, Money, StatusBadge.
2. Layout: header with role-aware nav, cart badge, user menu, footer.
3. All pages from `architecture.md` §5.2 with loading/error/empty states.
4. API client: centralized error mapping, 401 refresh-once, request cancellation for search.
5. Design tokens + responsive CSS; focus states; keyboard-accessible modals.
6. `ErrorBoundary` + 404/403 pages.
7. Confirm destructive actions (remove item, cancel order).
8. Format currency, dates, and statuses consistently.

**Exit checks**
- Customer, admin, and delivery journeys complete in the browser.
- No unhandled console errors; no `any`-style defensive hacks; no hard-coded API URLs.
- `npm run build` succeeds; bundle has no dev-only secrets.

**SRS:** §3.1, §5.4, §6.1.

---

### Phase 9 — Hardening and quality

**Goal:** Security, reliability, and performance checks from `architecture.md` §11–12.

**Tasks**
1. Verify rate limits, CORS allowlist, helmet, body limit, regex escaping.
2. Verify all indexes exist and query plans use them for menu/order lists.
3. Ensure errors are masked in production; logs redact secrets.
4. Add pagination everywhere; cap limits.
5. Add request IDs and audit fields for status/payment changes.
6. Add health checks and graceful shutdown; document backup/restore.
7. Run `npm audit`; record accepted risks.
8. Accessibility pass: labels, contrast, focus, keyboard.
9. Performance smoke: seed 200+ orders/menu items; menu and history p95 under target.

**Exit checks**
- Security checklist (§6) fully ticked.
- No secret appears in `git grep` of source (excluding `.env.example` placeholders).
- Load smoke shows reasonable latency and pagination.

**SRS:** §5.1–5.5.

---

### Phase 10 — Tests, docs, and deployment

**Goal:** Reproducible build and complete documentation.

**Tasks**
1. Ensure the test matrix in §11 is covered; coverage ≥ 70% on services.
2. Add one E2E happy path (Playwright optional but recommended).
3. `README.md`: prerequisites, setup, env vars, scripts, seed accounts, demo flow, troubleshooting.
4. Dockerfiles for server/client + Compose services (`mongo`, `server`, `client`).
5. Document envs, ports, volumes, and production notes.
6. Update `architecture.md`/`ai-implementation-guide.md` if implementation changed a decision (log it).
7. Final traceability check against §12.

**Exit checks**
- Fresh clone + documented commands works.
- CI (if configured) is green.
- Demo script: register → order (COD) → admin confirm → delivery → delivered; online simulated payment.

---

## 8. File-by-file checklist

Use this as a build tracker. Tick items only when implemented **and** tested.

### Server
- [ ] `config/env.js`, `config/db.js`, `config/constants.js`
- [ ] `app.js`, `server.js`
- [ ] `models/user`, `refresh-token`, `address`, `menu-item`, `cart`, `order`, `payment`, `counter`
- [ ] `utils/ApiError`, `asyncHandler`, `logger`, `money`, `pagination`, `order-number`, `tokens`
- [ ] `middleware/authenticate`, `authorize`, `validate`, `error-handler`, `not-found`,
      `rate-limit`, `request-id`, `idempotency`
- [ ] `validators/auth`, `user`, `address`, `menu`, `cart`, `order`, `common`
- [ ] `repositories/*` for each model
- [ ] `services/auth`, `user`, `address`, `menu`, `cart`, `pricing`, `order`, `order-status`,
      `payment`, `report`, `providers/simulated`, `providers/gateway`
- [ ] `controllers/*` and `routes/*` for every module
- [ ] `tests/helpers/test-db`, `factories`
- [ ] `tests/unit/pricing`, `order-status`, `money`, `validators`
- [ ] `tests/integration/auth`, `menu`, `cart`, `orders`, `payments`, `delivery`, `admin`
- [ ] `scripts/seed.js`

### Client
- [ ] `api/client.js` + `auth`, `user`, `address`, `menu`, `cart`, `orders`, `payments`, `admin`, `delivery`
- [ ] `context/AuthContext`, `ToastContext`
- [ ] `routes/ProtectedRoute`, `RoleRoute`
- [ ] `features/auth` (login, register)
- [ ] `features/menu` (page, tabs, search, card)
- [ ] `features/cart` (page, line)
- [ ] `features/checkout` (page, address picker, payment selector, summary)
- [ ] `features/orders` (history, detail, timeline, cancel)
- [ ] `features/profile` (profile, address book)
- [ ] `features/admin` (layout, menu manager, order board, reports)
- [ ] `features/delivery` (board, detail)
- [ ] `components/ui/*`, `components/layout/*`
- [ ] `lib/constants`, `formatMoney`, `queryKeys`, `validators`
- [ ] `styles/tokens.css`, `global.css`
- [ ] `App.jsx`, `main.jsx`, 404/403 pages, `ErrorBoundary`

---

## 9. API quick reference (condensed)

```
POST   /api/v1/auth/register            public
POST   /api/v1/auth/login               public
POST   /api/v1/auth/refresh             refresh cookie
POST   /api/v1/auth/logout              auth
GET    /api/v1/auth/me                  auth

GET    /api/v1/users/me                 auth
PATCH  /api/v1/users/me                 auth

GET    /api/v1/addresses                customer
POST   /api/v1/addresses                customer
PATCH  /api/v1/addresses/:id            customer (owner)
DELETE /api/v1/addresses/:id            customer (owner)

GET    /api/v1/menu                     public (?category&q&available&page&limit)
GET    /api/v1/menu/categories          public
GET    /api/v1/menu/:id                 public
POST   /api/v1/menu                     admin
PATCH  /api/v1/menu/:id                 admin
DELETE /api/v1/menu/:id                 admin (soft delete)
PATCH  /api/v1/menu/:id/availability    admin

GET    /api/v1/cart                     customer
POST   /api/v1/cart/items               customer
PATCH  /api/v1/cart/items/:menuItemId   customer
DELETE /api/v1/cart/items/:menuItemId   customer
DELETE /api/v1/cart                     customer

POST   /api/v1/orders                   customer + Idempotency-Key
GET    /api/v1/orders                   customer (own, paginated)
GET    /api/v1/orders/:orderNumber      owner/admin/assigned delivery
POST   /api/v1/orders/:orderNumber/cancel   owner/admin
PATCH  /api/v1/orders/:orderNumber/status   admin/assigned delivery
PATCH  /api/v1/orders/:orderNumber/assign   admin

POST   /api/v1/payments/:orderNumber/initiate   customer (owner)
POST   /api/v1/payments/:orderNumber/confirm    customer (owner, simulated mode only)
POST   /api/v1/payments/webhook                 provider signature
GET    /api/v1/payments/:orderNumber            owner/admin

GET    /api/v1/admin/orders             admin
GET    /api/v1/admin/reports/summary    admin
GET    /api/v1/admin/users              admin

GET    /api/v1/delivery/orders          delivery (assigned)

GET    /api/v1/health                   public
GET    /api/v1/health/ready             public
```

---

## 10. Data contract essentials

### Order DTO (client-facing)
```js
{
  orderNumber, orderStatus, paymentMethod, paymentStatus,
  items: [{ menuItemId, name, unitPriceMinor, quantity, subtotalMinor }],
  pricing: { subtotalMinor, deliveryFeeMinor, taxMinor, discountMinor, totalMinor },
  address: { recipientName, phone, street, city, postalCode },
  statusHistory: [{ status, changedAt, changedByRole, note? }],
  assignedDeliveryUser: { id, name } | null,
  placedAt, notes
}
```
Never return: `passwordHash`, refresh token hashes, raw provider payloads, internal `__v`.

### User DTO
```js
{ id, name, email, phone, role, isActive, createdAt }
```

### Menu item DTO
```js
{ id, name, description, category, priceMinor, imageUrl, isAvailable }
```

### Cart DTO
```js
{
  items: [{ menuItemId, name, priceMinor, quantity, subtotalMinor, isAvailable, imageUrl }],
  subtotalMinor, itemCount, updatedAt
}
```

### Payment DTO
```js
{ orderNumber, method, amountMinor, currency, status, provider, providerRef, verifiedAt }
```

---

## 11. Test matrix

| Area | Happy path | Denial/failure |
|---|---|---|
| Auth | register, login, refresh | wrong password, duplicate email, expired/missing token, refresh reuse |
| RBAC | role can act | customer→admin (403), delivery on unassigned (403) |
| Menu | list/filter/search | non-admin create, invalid price, soft-deleted hidden |
| Cart | add/merge/update/remove | unavailable item, qty 0/100, another user's cart |
| Orders | checkout COD | empty cart, unowned address, unavailable item, double submit |
| Pricing | fees/tax/threshold | client-total tampering, rounding edges, snapshot integrity |
| Payments | COD paid on delivered, simulated online paid | failed payment, forged confirm/webhook, amount mismatch |
| Status | all allowed transitions | forbidden transitions, concurrent update, delivery-before-dispatch |
| Cancel | within window/state | outside window, after dispatch, non-owner |
| Profile/address | CRUD + default | cross-user access |
| Reports | summary totals | non-admin access, date filters |
| Frontend | forms, guards, cart UI | 401 refresh, API error states, 403 page |

Every integration test suite must include at least one denial case. Use factories to create users of
each role, menu items, and orders.

---

## 12. Definition of Done (per task)

- [ ] Code follows layering and naming conventions.
- [ ] Inputs validated; outputs use the standard envelope.
- [ ] Auth/role/ownership enforced server-side.
- [ ] Business rule implemented in a service function and unit-tested.
- [ ] Integration test covers happy path + a denial/failure path.
- [ ] No secrets/hashes/internal fields leaked.
- [ ] Pagination/indexes added where relevant.
- [ ] Frontend has loading/error/empty states and is responsive.
- [ ] `npm test` and `npm run lint` pass in touched packages.
- [ ] Progress log updated; architecture doc updated if a decision changed.

---

## 13. Common pitfalls (avoid these)

1. **Trusting client totals.** Recompute with `pricing.service`; ignore submitted amounts.
2. **Storing prices in the cart.** Cart stores `menuItemId` + `quantity`; prices are live.
3. **Mutating order history.** Append entries; never overwrite or remove.
4. **Non-atomic transitions.** Use `findOneAndUpdate({_id, orderStatus: from})`; check the result.
5. **Duplicate checkout.** Enforce `Idempotency-Key` uniqueness; return the existing order.
6. **Leaking existence.** Return 404 for resources the caller must not see.
7. **Skipping role checks on reads.** `GET /orders/:orderNumber` is as sensitive as writes.
8. **Floating-point money.** Integer minor units only.
9. **Hard-deleting menu items.** Soft-deactivate; snapshots must remain meaningful.
10. **Marking paid on redirect.** Only server verification sets `PAID`.
11. **Unescaped search regex.** Escape input; bound length.
12. **Unbounded lists.** Always paginate and cap `limit`.
13. **Over-fetching.** Project fields; never send `passwordHash`.
14. **Ignoring concurrency.** Two admins can update at once; compare-and-set protects history.
15. **Out-of-order phases.** Cart before menu or payment before orders creates rework.

---

## 14. AI working protocol

### 14.1 Per-task loop
1. **Inspect** — read the relevant docs section and existing files; do not assume.
2. **Plan** — list files to create/modify and the tests that will prove the task.
3. **Implement** — smallest coherent change; follow existing patterns.
4. **Verify** — run targeted tests, then full package tests and lint.
5. **Report** — summarize what changed, tests run, and any remaining risk. Do not claim success without evidence.

### 14.2 If something is ambiguous
- Prefer the SRS; then `architecture.md`; then the simplest secure implementation.
- Record the decision in the progress log with a one-line rationale.
- Ask the user only when the decision changes public API shape, data model, or scope.

### 14.3 If a test fails
- Fix the root cause, not the assertion.
- If the test itself is wrong, explain why and update it with the user's intent in mind.
- Never skip/disable tests to make a phase "pass".

### 14.4 Commit and review conventions (only when asked to commit)
- Small, focused commits: `feat(auth): add refresh token rotation`, `fix(cart): reject unavailable items`.
- Include tests in the same commit as the feature.
- Do not commit `.env`, `node_modules`, build output, or secrets.
- Reference SRS IDs in PR descriptions (e.g. "Implements FR-4.1–4.4, BR-2, BR-3").

### 14.5 Progress log template
Create `PROGRESS.md` (or append to `README.md`) and update it:
```md
## Progress
| Phase | Status | Notes | Date |
|---|---|---|---|
| 0 Scaffold | done | health ok, lint/test configured | 2026-11-02 |
| 1 Auth | in progress | refresh rotation done; tests pending | 2026-11-02 |
```
Also log deviations:
```md
### Decisions
- Used `bcryptjs` because native bcrypt failed to build on Windows. (2026-11-02)
```

### 14.6 Task prompt template
When starting a phase, use:
```
Implement Phase <N> — <name> from ai-implementation-guide.md.
Read architecture.md §<relevant sections> first.
Follow invariants §1 and conventions §5.
Deliver: <endpoints/files>.
Verify: <tests/lint>.
Do not modify unrelated modules.
Report: files changed, tests run, open risks.
```

---

## 15. Demo script (acceptance walkthrough)

Use seeded accounts and this sequence to prove the system:

1. Register a new customer; login.
2. Browse menu, filter a category, search an item; verify an unavailable item is blocked.
3. Add items, change quantity, remove one; check subtotal.
4. Save an address; checkout with COD (double-click submit → exactly one order).
5. Customer sees the order in history with `PLACED` and a timeline.
6. Admin login: confirm → preparing → ready for pickup; assign the delivery user.
7. Delivery login: sees only the assigned order; marks out for delivery → delivered.
8. Verify COD payment is `PAID` and status history includes all actors/timestamps.
9. Repeat with simulated online payment: pay, verify `PAID`; cancel another order and verify refund/cancel rules.
10. Try forbidden actions (customer hitting admin API, delivery updating unassigned order) and confirm 403/404.

---

## 16. Out of scope (do not build in v1)

- Multi-restaurant marketplace, tenant isolation, settlements
- Real payment gateway integration (adapter seam only)
- SMS/email notifications, push notifications
- Live GPS, route optimisation, delivery ETA prediction
- Loyalty points, coupons (discount hook exists but stays 0), reviews/ratings
- Admin user management beyond listing delivery users for assignment
- Real-time websockets; polling/refetch is sufficient
- Native mobile apps

If the user asks for any of these, confirm scope before implementing and update `architecture.md`.

---

## 17. Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| Server exits on boot | Missing/invalid env var | Check `config/env.js` error; copy `.env.example` to `.env` |
| `ECONNREFUSED 27017` | MongoDB not running | `docker compose up -d mongo` or start local Mongo |
| `401` on every request | Missing/expired access token | Login again; client should auto-refresh once |
| Refresh loop | Cookie path/SameSite/CORS mismatch | Cookie `Path=/api/v1/auth`, same origin or CORS credentials |
| `409 INVALID_STATUS_TRANSITION` | Stale UI or concurrent update | Refetch order; transition matrix is authoritative |
| `409 ITEM_UNAVAILABLE` | Item toggled off after adding | Refetch cart/menu; remove or replace item |
| Duplicate order | Missing/duplicated idempotency key | Generate one key per checkout attempt; check unique index |
| Money off by 100× | Rupees vs paise confusion | All API values are minor units; format only in UI |
| `bcrypt` install fails on Windows | Native build toolchain | Use `bcryptjs` |
| Tests hang | Mongo memory server not stopped | Close DB in `afterAll`; use the test-db helper |
| CORS error in browser | Origin not in `CORS_ORIGINS` | Add `http://localhost:5173`; restart server |

---

## 18. Final acceptance checklist

- [ ] All SRS functional requirements FR-1.1 … FR-8.3 implemented.
- [ ] Business rules BR-1 … BR-6 enforced and tested.
- [ ] Non-functional requirements §5.1–5.5 addressed (performance, reliability, security, quality, rules).
- [ ] Customer, admin, and delivery journeys work end-to-end.
- [ ] COD and simulated online payment both work; no client-trusted totals.
- [ ] Idempotent checkout; atomic transitions; ownership isolation.
- [ ] No secrets/hashes/internal fields in responses or logs.
- [ ] Responsive, accessible UI with loading/error/empty states.
- [ ] Tests and lint pass; build succeeds; README has reproducible setup.
- [ ] `architecture.md` and this guide reflect the implemented system.

---

*End of AI implementation guide.*
