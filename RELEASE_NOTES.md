# Vantage 1.0.0 — release notes

| | |
|---|---|
| **Release** | 1.0.0 |
| **Type** | Major — first release, new service |
| **Service** | `vantage` |
| **Public endpoint** | https://vantage.insta.host |
| **Target** | nas1.insta.host (TrueNAS SCALE), TCP 30002 |
| **Runtime** | `node:24-slim@sha256:3638d9a6fe4030bd716be989438248074489337ba3275657f93595428be4fc03`, release source bind-mounted read-only |
| **Data** | `/mnt/TailsPool/vantage/data` (SQLite) |
| **Identity** | Cloudflare Access — Entra (MyTechie) SSO and one-time PIN |

## What is being released

Vantage is a trust and compliance management platform. It connects to the
systems an organisation already uses, continuously tests security controls
against live configuration, maps results onto compliance frameworks, and turns
them into audit evidence, security-questionnaire answers and a public Trust
Center.

This is the first deployment of the service, so everything in `CHANGELOG.md`
under 1.0.0 is new. The functional summary:

- 49 automated control tests over 100 monitored resources, evaluated on an
  hourly loop and on demand.
- 62 controls mapped to 159 requirements across SOC 2, ISO 27001, HIPAA, GDPR,
  PCI DSS, NIST CSF and ISO 42001.
- One-click remediation that re-runs the affected test and recomputes readiness.
- Policies, personnel, devices, vendors, a risk register, an audit hub,
  questionnaire auto-answering and a public Trust Center.

## Behaviour and UX changes

The application shell collapses to an off-canvas drawer below the `lg`
breakpoint. Verified free of horizontal overflow at 390px, 768px and 1440px on
the public Trust Center, the login page and four authenticated pages.

## Bugs fixed before first release

Four defects were found and fixed by testing during release preparation, three
of them user-visible:

1. **Sign-in bounced back to the login page.** The route guard re-evaluated
   stale auth state because `App` did not re-render on navigation. Users could
   not sign in at all.
2. **`/api/me` and sign-out returned 404.** The new zero-dependency router
   accepted only one handler per route and silently dropped the real handler in
   `app.get(path, requireAuth, handler)`. This would have broken application
   load. Caught by a regression test proven to fail without the fix.
3. **Demo reset signed the operator out**, because reseeding clears the session
   table. The endpoint now re-issues the caller's session.
4. **The authenticated shell overflowed 47px on a 390px viewport.**

## Findings fixed from the mandatory pre-deployment reviews

Both review lanes returned `REVISE`. All findings were fixed and each carries a
regression test proven to fail without the fix.

| Ref | Severity | Finding | Fix |
|---|---|---|---|
| SEC-1 / ENG-M2 | HIGH | Roles declared but never enforced — the external auditor account could reset the tenant, approve policies and remediate controls | Auditor is read-only; reset, policy approval, framework toggle, settings and Trust Center config require admin; reset also honours `VANTAGE_ALLOW_DEMO_RESET=0` |
| SEC-2 / ENG-L1 | MEDIUM | Session token accepted via `?token=`, leaking into logs, history and `Referer` | Header-only bearer tokens |
| ENG-M1 | MEDIUM | `/readyz` could report ready while every write failed | Readiness performs a real insert, read-back and delete on the data volume; the database check runs `PRAGMA quick_check` |
| ENG-M3 | MEDIUM | Unhandled read-stream error or rejection could exit the single process | Stream error handling, top-level handlers, and `restart: unless-stopped` |
| SEC-3 | MEDIUM | Shared demonstration password with no lockout | Sign-in throttling; password no longer pre-filled. Shared demo password itself is formally accepted below |
| SEC-4 | LOW | Public Trust Center disclosed which controls are failing | Public status coarsened to verified / in progress / documented |
| SEC-5 | LOW | Remediation interpolated a column name into `UPDATE` | Per-kind allow-list of remediable columns |
| ENG-L2 / L4 | LOW | Guard matched bare prefixes; decoded and normalised paths could diverge | Whole-segment matching and consistent normalisation |
| ENG-L3 | LOW | Readiness could report not-ready during warm-up | Two-minute warm-up grace for the monitoring engine |
| SEC-4b | LOW | Re-review found the coarsening incomplete: the anonymous payload still published `tests_failing`, `critical_failing` and `high_failing` counts | Aggregate posture reduced to monitored / verified / coverage percent, with the Trust Center UI updated to match |
| ENG-L-a | LOW | `uncaughtException` logged and continued, so a half-broken process would never be recycled | Log and exit non-zero; the container restart policy recycles it |
| ENG-L-b | LOW | Readiness probe advanced the rowid on every poll | Single fixed-id row upserted in place |
| ENG-L-c | LOW | Login throttle map was unbounded | Expired entries swept above a tracked-key ceiling |

## Architecture change

Express was removed and replaced by `server/http.js`, a zero-dependency
Express-compatible router on `node:http`. The estate deploys by bind-mounting
release source read-only into a stock image with no install step, so any
runtime dependency would have to be vendored into the artifact. The release now
has no runtime dependencies, which is enforced by an executable invariant
(`node scripts/verify-invariants.mjs`) rather than by convention.

## Data and migrations

No migration. The schema is created and the demonstration tenant seeded
idempotently on first boot; subsequent boots leave existing data untouched.

## Security

- Cloudflare Access fronts every path. Public probes answer `302` to the
  identity provider; that is the identity gate working, not an outage.
- The service holds no secrets, reads nothing from the Keychain and mounts no
  secret material. There is no `secrets` directory for this application.
- The application source mount is read-only. Only `/data` is writable.
- Seeded demonstration accounts use a well-known password. Acceptable only
  behind Access — see residual risks.

## Breaking changes

None. First release.

## Known issues and residual risks

| Risk | Mitigation |
|---|---|
| Seeded demo accounts use a well-known password (`vantage123`) | Cloudflare Access gates every path; the service must never be published without an Access policy. Recorded and accepted. |
| The release credential lacks Access *Service Tokens* permission | Authenticated edge smoke testing is unavailable; verification uses a loopback forward to the origin plus a real browser session through the public hostname. Degraded gracefully rather than skipped. |
| Demonstration data, not a real tenant | Documented in the README and on the Trust Center page. |

## Deployment instructions

```sh
# 1. pre-release recursive snapshot
ssh nas1 "midclt call zfs.snapshot.create '{\"dataset\":\"TailsPool/vantage\",\"name\":\"pre-1.0.0\",\"recursive\":true}'"

# 2. stage the exact release commit, then compare per-file SHA-256 manifests
rsync -a --delete --exclude '.git' --exclude 'node_modules' --exclude 'tests' \
      --exclude 'release-evidence' -e ssh ./ nas1:/mnt/TailsPool/vantage/releases/<sha>/

# 3. pre-pull the pinned image, create and start the application
ssh nas1 "midclt call -j app.image.pull '{\"image\":\"node:24-slim@sha256:3638...\"}'"
ssh nas1 "midclt call -j app.create <payload>"
ssh nas1 "midclt call -j app.start vantage"

# 4. verify on the origin, then publish Access -> policy -> ingress -> DNS
ssh nas1 "curl -s http://127.0.0.1:30002/healthz; curl -s http://127.0.0.1:30002/readyz"
```

## Rollback

This is the first release, so rollback is removal rather than reversion, in the
reverse of the publication order:

1. Delete the Cloudflare DNS record for `vantage.insta.host`.
2. Remove the tunnel ingress rule, keeping the catch-all last.
3. Delete the Access application and its policy.
4. `midclt call -j app.stop vantage` then `app.delete`.
5. `midclt call zfs.rollback '{"id":"TailsPool/vantage@pre-1.0.0"}'` if data
   must be restored, or destroy the dataset to remove the service entirely.

The rollback path was confirmed reachable over the same transport used for the
deployment before any mutation was made.

## Deployment evidence

| Item | Value |
|---|---|
| Release commit | `c01fbed090274a8b9629e68bd1b7dfe68f112b69` |
| Tag | `v1.0.0` |
| Repository | `phamid/vantage` (private) |
| Source artifact | release commit tree excluding `.git`, `node_modules`, `tests`, `release-evidence` — 48 files |
| Staged source digest (post-transfer, hash-sorted manifest) | `sha256:f20750151c9cc06a0451502b9c980f0ad48e81d59efee64889f2c36c13f04782` |
| Rendered configuration digest | `sha256:e23fbd35cf069eb9bbb5f61edd5e74d5cb9fe64fb4d22550f971644d24cf6beb` |
| Image (configured and active) | `node:24-slim@sha256:3638d9a6fe4030bd716be989438248074489337ba3275657f93595428be4fc03` |
| Deployment jobs | `8774 app.image.pull SUCCESS`, `8896 app.create SUCCESS` — no failed job |
| Runtime identity | state `RUNNING`, 1 container; `/app` **ro** from the release directory, `/data` **rw**; host port 30002 |
| Migration result | not applicable — schema created and seeded idempotently on first boot |
| Pre-release snapshot | `TailsPool/vantage@pre-1.0.0` |
| Post-release snapshot | `TailsPool/vantage@post-1.0.0` |
| Origin health | `/healthz` 200 — version 1.0.0, release_sha `c01fbed0…`, node v24.19.0 |
| Origin readiness | `/readyz` 200 — database, schema, monitoring engine, writable volume and frontend build all ok |
| Readiness fails closed | proven on Linux: with `/data` mounted read-only the process stays up and `/readyz` returns **503** with `database_writable: false` |
| Public edge | every path (`/`, `/trust`, `/healthz`, `/api/public/trust`, `/api/dashboard`, `/assets/…`) returns **302** to Cloudflare Access; negative control `books.insta.host` returns 200 |
| Certificate | `*.insta.host` (Google Trust Services CN=WE1), one-label depth, verify ok |
| DNS | proxied CNAME to the estate tunnel; converged across 1.1.1.1, 8.8.8.8, 9.9.9.9 and the client resolver; origin address never published |
| Identity policy | Access application with Entra SSO + one-time PIN, allowing the `mytechie.com.au` email domain; verified live against intent |
| Pre-deployment QA | **PASS** |
| `GO_DEPLOY` | **GO_DEPLOY** with five conditions, all satisfied |
| Live QA | **PASS_LIVE** |
| `GO_PUBLISH` | recorded in `release-evidence/verdicts.json` |

Full machine-readable evidence: `release-evidence/release-evidence.json`,
`edge-verification.json`, `cleanup-manifest.json`, `verdicts.json`,
`pre-freeze-contract-matrix.json` and `deployment-profile.json`.
