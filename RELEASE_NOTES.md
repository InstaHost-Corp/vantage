# Vantage 2.1.0 — workspace service configuration

| | |
|---|---|
| **Release** | 2.1.0 |
| **Type** | Minor — tenant-scoped service configuration |
| **Repository** | `InstaHost-Corp/vantage` |
| **Publication model** | Public GitHub repository; free hosted demonstration |

## What changed

- **Workspace service configuration**: tenant administrators can associate a
  service from the Vantage catalogue with a tenant-owned account reference.
  Every read and change remains scoped to the administrator's tenant.
- **Truthful capability status**: a configured reference does not establish an
  external connection. Vantage does not accept or retain API keys, passwords,
  access tokens, callback URLs, or other credentials; it makes no provider
  calls and does not collect data or alter readiness from this configuration.
- **Existing simulated connections** become configured references at startup
  and their stale sync timestamps are cleared.

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
2. Start the new version. Existing simulated connection states are converted
   to configured references without contacting any external provider.
3. If rollback is needed, restore the backup and redeploy the prior release.

## Rollback

- Restore the pre-2.1 database backup and redeploy the previous release.

## Known limitations

- Provider-specific OAuth/API-token connections and automated data collection
  are not implemented. A future provider integration must add a documented
  read-only authorization contract, secret handling, revocation and live
  provider validation before it can collect customer data.
