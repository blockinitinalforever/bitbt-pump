# BitBT Admin / API deployment (Phase 1)

## Hosts

| Host | Role |
|------|------|
| `https://admin.bitbt.com` | Static admin SPA (`admin/`) + same-origin `/api` reverse proxy |
| `https://api.bitbt.com` | Public API (`GET /api/team`, `POST /api/contact`) for the marketing site |
| `127.0.0.1:3100` | Axum (`bitbt-api`) — bind loopback only |

Nginx examples:

- `admin/nginx.conf.example` — admin vhost
- `admin/nginx-api.bitbt.com.conf.example` — public API vhost

Both vhosts must set `X-Real-IP $remote_addr`. The API trusts **only** a valid `X-Real-IP` (not client-controlled `X-Forwarded-For`).

## Ordered rollout

1. **PostgreSQL** — ensure the `bitbt` database exists and `DATABASE_URL` is available only via a protected env file / secret store (never commit it; avoid inline `DATABASE_URL=...` on shared shell history).
2. **Migrations** — from `backend/`, start Axum once (runs `sqlx::migrate!`) so these apply in order:
   - `001_admin_and_team.sql` — admins, sessions, bilingual team seed
   - `002_submissions_created_at.sql` — idempotent `submissions` table for fresh DBs + `created_at` compatibility for legacy DBs
3. **Bootstrap admin** — after migrations:
   ```text
   cargo run --release --bin bootstrap_admin
   ```
   This generates a ≥24 character password with `OsRng`, stores **only** the Argon2id hash, prints the plaintext **once** after a successful DB commit, and uses username `admin`.
   To rotate later, set `ADMIN_BOOTSTRAP_FORCE=1` (rotation updates the hash and deletes all sessions in one transaction). Prefer a secret manager over putting passwords on the command line.
4. **SMTP env** (optional) — set `SMTP_USER` + `SMTP_PASS` + `CONTACT_EMAIL` together if contact email notifications are required. Missing both SMTP vars disables mail without failing startup.
5. **Start Axum** — systemd/supervisor with env from the secret store; confirm loopback listen on `PORT` (default `3100`).
6. **Enable Nginx** — install both vhost examples, obtain TLS certs, `nginx -t && systemctl reload nginx`.
7. **Deploy admin static files** — copy `admin/index.html`, `admin/styles.css`, `admin/app.js` to the admin root (e.g. `/opt/bitbt-admin`).
8. **Smoke checks**
   - `GET https://api.bitbt.com/api/team?locale=en`
   - `POST https://api.bitbt.com/api/contact` from the marketing origin
   - Login at `https://admin.bitbt.com` (same-origin `/api`)

## Security notes

- Admin cookies are `HttpOnly`, `Secure`, `SameSite=Strict`; admin responses send `Cache-Control: no-store`.
- Browser admin mutations require `Origin: https://admin.bitbt.com` when Origin is present; missing Origin is allowed only for non-browser ops (curl/automation).
- Public CORS allowlist is `https://bitbt.com` and `https://www.bitbt.com` (credentials disabled).
- `server_tokens off` and dotfile denial are enabled in the example vhosts.
