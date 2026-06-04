# Dashboard auth — WorkOS plan

## Today
Single trusted operator on `127.0.0.1`. `serve.mjs` holds the Supabase
service-role key server-side and exposes read + write endpoints. The
`authorize(req, action)` guard in `serve.mjs` is **permissive** (returns ok) and
is the single chokepoint every write path already calls.

## Target — WorkOS AuthKit, access by user type
Gate the dashboard behind WorkOS login and authorize each action by the signed-in
user's role. The service-role key never reaches the browser; WorkOS authenticates
the *human*, `serve.mjs` authorizes the *action*, Supabase trusts `serve.mjs`.

### Integration points
1. **Login**: put WorkOS AuthKit (hosted login) in front of the app. On callback,
   `serve.mjs` sets a sealed session cookie (JWT). Unauthenticated requests to
   anything but the login routes get redirected/401.
2. **Session middleware** in `serve.mjs`: validate the cookie/JWT on every request,
   resolve the WorkOS user + organization role.
3. **Authorize**: replace the body of `authorize(req, action)` with
   `return (WRITE_ROLES[action] || []).includes(roleFromSession(req))`. Read
   endpoints require any authenticated session.

### Role → permission matrix (maps to `WRITE_ROLES` in serve.mjs)
| Action (endpoint) | Allowed roles |
| --- | --- |
| `ceo_approve` — `/api/agreement/ceo-approve` | admin, ceo |
| `add_agreement` — `/api/agreement` | admin, purchasing |
| `assign_office` — `/api/territory/assign` | admin, purchasing |
| `refresh_status` — `/api/price-refresh/*` | admin, purchasing |
| `invoice_pay` — `/api/invoice/pay` | admin, accounting |
| `save_settings` — `/api/settings` | admin |
| read endpoints (`/api/territories`, `/api/price-lists`, `/api/invoice-gate`) | any authenticated user (incl. viewer) |

People → roles (Pro Exteriors): **Chris → admin/ceo**, **Roberto Huerta →
purchasing** (vendor agreements, price-list refresh, territories), **Lucinda Dunn
→ accounting** (invoice payment, credit memos), **field/leadership → viewer**.
Roles are abstract; never hard-code a person's name as a role.

### Env (add to .env, names in config/.env.example)
```
WORKOS_API_KEY=...
WORKOS_CLIENT_ID=...
WORKOS_REDIRECT_URI=https://<dashboard-host>/auth/callback
WORKOS_COOKIE_PASSWORD=...   # >=32 chars, seals the session cookie
```

### Notes
- This is the only place to add auth — because all writes already funnel through
  `authorize()`, enabling WorkOS is a localized change, not a rewrite.
- Keep `SUPABASE_SERVICE_ROLE_KEY` server-only; never expose it to the browser
  even after WorkOS is in place.
