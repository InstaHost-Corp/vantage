# Vantage 1.2.0 — release notes

| | |
|---|---|
| **Release** | 1.2.0 |
| **Type** | Minor — demonstration behaviour and credential hygiene, no breaking API change |
| **Service** | `vantage` |
| **Public endpoint** | https://vantage.insta.host |
| **Target** | nas1.insta.host (TrueNAS SCALE), TCP 30002 |
| **Runtime** | `node:24-slim@sha256:3638d9a6fe4030bd716be989438248074489337ba3275657f93595428be4fc03`, release source bind-mounted read-only |
| **Data** | `/mnt/TailsPool/vantage/data` (SQLite) |
| **Identity** | none — public and free, as of 1.1.0 |
| **Repository** | `phamid/vantage` — public, MIT licence |
| **Previous release** | 1.1.0 (`a624d802…`) |

## What is being released

Two things, both about the hosted instance being honestly a *demonstration*:

1. **It resets daily.** The shared workspace restores itself to the seeded
   baseline once a day instead of every six hours.
2. **It saves no credentials.** Nothing a visitor types at sign-in is retained
   anywhere — not on their device, not in the database, not in the logs, and not
   in the process's own abuse counters.

## What's new

- The reset cadence is daily (`VANTAGE_DEMO_RESET_MINUTES` defaults to `1440`
  when `VANTAGE_PUBLIC_DEMO` is set). The sign-in page and the in-app banner say
  so.
- The sign-in form arrives **pre-filled** with the published demonstration
  account, and one-click buttons switch between the seeded accounts, so a
  visitor never has to type a credential to try the product.
- The form and both inputs disable autocomplete — `autocomplete="off"` on the
  form and the email field, `new-password` on the password field, plus the
  `data-1p-ignore`, `data-lpignore` and `data-bwignore` attributes that
  1Password, LastPass and Bitwarden honour. The browser therefore neither offers
  to save credentials against this origin nor autofills a visitor's real ones
  into it.
- The session token moved from `localStorage` to `sessionStorage`: closing the
  tab leaves nothing on the visitor's device. `VANTAGE_SESSION_DAYS` makes the
  server-side session lifetime configurable, and the public deployment sets it
  to `1` so a session never outlives the data it was issued against.

## Security changes

| Guard | What it prevents |
|---|---|
| The sign-in throttle keys on an HMAC of `<client address>\|<account>` under a process-random key | A real work address, typed out of habit into a public demonstration, sitting in process memory in the clear. A plain digest would only be pseudonymous — a guessed address could be confirmed by hashing it — so the key is generated at boot and never leaves memory |
| Throttle entries swept on a cadence, not only under pressure | An entry outliving its fifteen-minute window because too few other people happened to sign in |
| Autocomplete disabled and both fields pre-filled | A visitor's password manager saving a credential against a shared demonstration, or autofilling their real one into it |
| `sessionStorage` rather than `localStorage` | A session token outliving the visit on someone else's machine |
| `VANTAGE_SESSION_DAYS=1` on the public deployment | A session outliving the data it was issued against, given the tenant now reseeds daily |
| The last reset is persisted and an overdue reset runs at boot | The advertised daily cadence quietly lapsing, because a schedule anchored to process start restarts its clock on every deployment |
| No `localStorage` fallback, and the legacy key is purged on load | A token left behind on a visitor's device — including one written by 1.1.0, which nothing else would have removed |

Tests assert outcomes rather than mechanisms: driving the throttle to its limit
with a realistic work address leaves that address in no surface a later visitor
can read; a successful sign-in records the account name with no credential
material anywhere; and `tests/restart.test.mjs` boots the real server, changes
something as a visitor would, restarts it twice — once inside the window and
once with the deadline already passed — and proves the change survives the
first and is gone after the second.

### Findings fixed from the mandatory pre-deployment review

The independent security lane returned **REVISE** on the first candidate. All
three findings were fixed; none was waived.

| Finding | Severity | Fix |
|---|---|---|
| The daily reset was measured from process start and never persisted, so a restart before the deadline postponed it by another full day while the UI kept promising "daily" | MEDIUM | The last reset is persisted in the settings table, the schedule is anchored to it, and an overdue reset runs at boot. Proven by a restart test that fails when the anchor is removed |
| `sessionStorage` fell back to `localStorage`, and tokens written by 1.1.0 were never cleaned up, so a bearer token could still outlive the tab | LOW | The fallback is memory, and the legacy `localStorage` key is removed on load |
| Throttle digests were unsalted and swept only when the map grew past 5,000 keys, so a guessed address could be confirmed and entries could outlive the stated window | LOW | HMAC under a process-random key, and a time-based sweep |

### Already true before this release, and re-verified

No password has ever been written to the database or the logs; only the seeded
scrypt hashes exist, and the service holds, mounts and reads no secret material
of its own. This release closes the remaining places where something a visitor
*typed* could linger.

## Behaviour changes

- Sign-in no longer persists across browser restarts.
- The reset cadence displayed in the UI reads "daily".
- `GET /api/public/config` reports `reset_interval_minutes: 1440`.

## Data and migrations

None. The schema is created and seeded idempotently on boot.

## Breaking changes

None.

## Known issues and residual risks

- The demonstration password remains published, deliberately. It is a shared
  fictional workspace; the guards above ensure that choice costs a visitor
  nothing.
- A visitor who deliberately types a real credential into the password field is
  still sending it to this service. It is not stored, logged or echoed, but the
  only complete protection is not to do it — which is why the field is
  pre-filled and the page says so.
- Rate limiting and the throttle remain in-process, which is exact for the
  single deployed instance.

## Deployment instructions

```sh
ssh nas1 "midclt call zfs.snapshot.create '{\"dataset\":\"TailsPool/vantage\",\"name\":\"pre-1.2.0\",\"recursive\":true}'"

rsync -a --delete --exclude '.git' --exclude 'node_modules' --exclude 'tests' \
      --exclude 'release-evidence' --exclude '__pycache__' --exclude 'data' \
      -e ssh ./ nas1:/mnt/TailsPool/vantage/releases/<sha>/

ssh nas1 "midclt call -j app.update vantage '<payload pinning the new release directory, APP_VERSION=1.2.0, VANTAGE_DEMO_RESET_MINUTES=1440 and VANTAGE_SESSION_DAYS=1>'"

ssh nas1 "curl -s http://127.0.0.1:30002/api/public/config"
```

The identity gate is already removed, so `publishctl.py apply --stage public` is
not part of this release. `publishctl.py regate` remains the containment path.

## Rollback

1. `midclt call -j app.update` pinned back to
   `/mnt/TailsPool/vantage/releases/a624d802a7a63b1117a8dd5177877af215b72e97`
   with the 1.1.0 environment. 1.1.0 carries no known defect.
2. `zfs.rollback` to `TailsPool/vantage@pre-1.2.0` if data must be restored.
3. `python3 scripts/publishctl.py regate` if the open endpoint must be closed
   for any reason, independent of the application version.

## Deployment evidence

<!-- Replaced with measured values after deployment. -->

| Item | Value |
|---|---|
| Release commit | _pending deployment_ |
| Tag | `v1.2.0` |
| Staged source digest | _pending deployment_ |
| Image (configured and active) | `node:24-slim@sha256:3638d9a6fe4030bd716be989438248074489337ba3275657f93595428be4fc03` |
| Deployment job | _pending deployment_ |
| Runtime identity | _pending deployment_ |
| Pre-release snapshot | `TailsPool/vantage@pre-1.2.0` |
| Post-release snapshot | _pending deployment_ |
| Origin health and readiness | _pending deployment_ |
| Public verification | _pending deployment_ |
| Pre-deployment QA | _pending_ |
| `GO_DEPLOY` | _pending_ |
| Live QA | _pending_ |
| `GO_PUBLISH` | _pending_ |

Release notes for earlier versions remain in `CHANGELOG.md` and in this file's
history.
