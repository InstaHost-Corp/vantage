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

## Deployment evidence (post-release)

- **Release commit / tag**: `d50cbe01066d3a8332bf8ec518213cb3f3023753` / `v2.1.0`
- **Target**: TrueNAS `vantage` app, public endpoint `https://vantage.insta.host/`
- **Deployment job**: TrueNAS `app.update` job `4091` (SUCCESS), started
  2026-08-29T21:48:10Z, completed 2026-08-29T21:48:30Z
- **Runtime identity**: container `5d688b0347438ee0d74e9fe8fb9b9a853c8acf87fa46be502d97ce914b0127e5`
  running `node:24-slim@sha256:3638d9a6fe4030bd716be989438248074489337ba3275657f93595428be4fc03`,
  compose config-hash `0f6d6507bcedda17fe455ed6d01c1a7f18d32b1b4b15641b6abe21107a67597d`,
  read-only `/app` source mount from
  `/mnt/TailsPool/vantage/releases/d50cbe01066d3a8332bf8ec518213cb3f3023753`
  (source digest `sha256:b066cd636a89d2196f41cb5ce74b02cb833b3efcc497464da804ee9e3d4cd902`).
- **Migration result**: PASS — additive tenant-scoped schema change, no data
  loss; `/readyz` confirmed `database`, `schema_seeded`, `database_writable` ok
  immediately after update.
- **Health/readiness**: `/healthz` reports version `2.1.0`, release SHA
  `d50cbe010...`, source digest above; `/readyz` reports `ready=true` with all
  checks ok.
- **Functional smoke**: two isolated production tenants created; tenant A
  connected then disconnected a catalogue service reference; tenant B's
  independent row was confirmed untouched throughout, proving tenant isolation
  of the new feature.
- **Snapshots**: pre-release `TailsPool/vantage@pre-2.1.0`, post-release
  `TailsPool/vantage@post-2.1.0` (both verified present via `zfs.snapshot.query`).
  Rollback point: Vantage 2.0.0 (`c8f0549ec9b5e4cb8ccf381083c5b9c1d6027a63`,
  snapshot `TailsPool/vantage@post-2.0.0`).
- **Gates**: `GO_DEPLOY`, `PASS_LIVE`, and `GO_PUBLISH` were all issued under
  Patrick Hamid's (`phamid`) GitHub-authenticated CTO solo-authority route
  (all three configured independent review sources attempted and recorded
  `UNAVAILABLE`/`INCONCLUSIVE`), together with a time-bound CTO deviation for
  the pre-existing (2.0.0-era) visual-style contract gap. Full evidence:
  `release-evidence/v2.1.0/release-evidence.json`.
