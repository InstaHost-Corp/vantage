# Vantage 2.0.0 — multi-tenant production mode

| | |
|---|---|
| **Release** | 2.0.0 |
| **Type** | Major — multi-tenant isolation and production mode |
| **Repository** | `InstaHost-Corp/vantage` |
| **Publication model** | Public GitHub repository; free hosted demonstration |

## What changed

- **Multi-tenant isolation**: every customer-owned table now carries a
  `tenant_id` column. Each authenticated request is scoped to the caller's
  tenant. Two tenants cannot read or update each other's records.
- **Production mode** (`VANTAGE_ENV=production`): fails closed at startup
  unless properly configured. Demo reset, demo seeding and the continuous
  scan timer are disabled. The public config endpoint does not expose
  demo credentials.
- **Tenant-per-signup**: in production mode, `POST /api/auth/signup` creates
  a new tenant with the caller as owner/admin. The `company` field is
  required. The compliance framework library is seeded automatically.
- **Automatic migration**: existing databases are migrated to the multi-tenant
  schema on first boot. The migration adds the `tenants` table, inserts a
  default tenant, and adds `tenant_id` to all 25 customer-owned tables.

## Security and data

- Bearer token authentication is inherently CSRF-immune (documented in the
  public config endpoint).
- Signup and login are rate-limited per client IP.
- Duplicate email returns a generic error that does not enumerate tenants.
- Production mode requires a random session secret of at least 32 characters,
  supplied through a read-only `VANTAGE_SESSION_SECRET_FILE` mount. An inline
  `VANTAGE_SESSION_SECRET` is for local development only and must not be
  recorded in deployment configuration.
- Admin actions (demo reset, policy approval, settings, framework toggle)
  require the `admin` role within the caller's tenant.

## Migration

1. Back up `data/vantage.db` before upgrading.
2. Start the new version — migration runs automatically.
3. Check logs for `multi-tenant migration complete`.
4. If migration fails, restore from backup.

## Rollback

- Restore the pre-2.0 database backup and redeploy the previous release.

## Known limitations

- Public Trust Center routes are disabled in production (`404`) until
  tenant-specific publication is implemented.
- No tenant deletion, data export or billing API.
- The hosted demonstration remains shared and fictional.
