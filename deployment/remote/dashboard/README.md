# Pro Exteriors Open Brain Admin

Local-first admin viewport for the vendor pricing and credit memo workflow.

## Run

```bash
npm run dev
```

Open `http://127.0.0.1:4177`.

## Build

```bash
npm run check
npm run build
```

The build writes static files to `dist/`.

## Data mode

The current app uses sample pilot data and persists interface decisions in browser `localStorage`. This is intentional: the first iteration lets us validate the human workflow before writing to production-shaped Supabase tables.

The future server-side API seam is:

- `GET /api/admin/state`
- `POST /api/admin/product-matches/:id/approve`
- `POST /api/admin/product-matches/:id/reject`
- `POST /api/admin/credit-memos/:id/approve`
- `POST /api/admin/credit-memos/:id/request-changes`
- `POST /api/admin/credit-memos/:id/reject`
- `POST /api/admin/credit-memos/:id/mark-sent`
- `POST /api/admin/credit-memos/:id/mark-received`

Those endpoints must run server-side with privileged Supabase credentials. The browser app should never receive `SUPABASE_SERVICE_ROLE_KEY`.
