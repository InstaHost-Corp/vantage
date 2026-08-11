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
  form and the email field, `new-password` on the password field — and the
  `data-1p-ignore`, `data-lpignore` and `data-bwignore` attributes that
  1Password, LastPass and Bitwarden honour are set on the form as well as on
  each input, so a manager that keys on the container is covered too. Live QA
  caught that the form was missing them. The browser therefore neither offers
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
| Second round: the sweep still ran only on sign-in traffic, so on an idle service the last visitor's entry stayed in memory until somebody else signed in | LOW | An unreferenced 60-second timer sweeps regardless of traffic |
| Second round: a corrupt marker was truthy, so it was never repaired and every restart re-anchored the daily clock — the original fault, reintroduced through the repair path. A far-future marker would have postponed the reset indefinitely | MEDIUM | The marker is validated on read: unparseable or future-dated values are treated as missing and repaired with the anchor actually in use. Two restart tests cover both, and fail against the naive check |

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

| Item | Value |
|---|---|
| Release commit | `919823ea69c4fdf303872b951a671ec04a813ab1` |
| Tag | `v1.2.0` |
| Repository | `phamid/vantage` — public, MIT licence |
| Source artifact | release commit tree excluding `.git`, `node_modules`, `tests`, `release-evidence`, `__pycache__`, `data` |
| Staged source digest (post-transfer, hash-sorted manifest) | `sha256:445ab0e7bcd46ef9bee32f9989474772af3f8f7fd009a32983d12a70e96514ff` — compared after transfer and byte-identical |
| Rendered configuration digest | `sha256:ac708b52c5726d2413c366ff353603317d62765b1d34595ae18db8edd69226da` |
| Image (configured and active) | `node:24-slim@sha256:3638d9a6fe4030bd716be989438248074489337ba3275657f93595428be4fc03` |
| Deployment job | `12660 app.update SUCCESS` — no failed job |
| Runtime identity | state `RUNNING`, 1 container; `/app` **ro** from the release directory, `/data` **rw**; port 30002 |
| Environment added | `VANTAGE_DEMO_RESET_MINUTES=1440`, `VANTAGE_SESSION_DAYS=1` |
| Migration result | not applicable — the application writes its own `demo_reset` marker on first boot |
| Pre-release snapshot | `TailsPool/vantage@pre-1.2.0` |
| Post-release snapshot | `TailsPool/vantage@post-1.2.0` |
| Origin health | `/healthz` 200 — version 1.2.0, release_sha `919823ea69c4…` |
| Public config | `public_demo=true`, all four guards enabled, `reset_interval_minutes 1440`, next reset a day out |
| First-boot behaviour | The existing tenant was **not** wiped, as the release engineer predicted from the source: no marker existed, the schedule anchored to now, and the first reset falls due a day after deployment. Verified live — readiness stayed at 73% with 33 of 49 passing |
| Public edge | `/`, `/login`, `/trust`, `/healthz`, `/api/public/config` all 200 anonymously; `/api/dashboard` 401 as the in-boundary negative control |
| Pre-deployment QA | **PASS** — including a Playwright rendered-DOM check of the pre-filled field, the autocomplete and ignore attributes, the legacy-token purge and the sessionStorage-only token, plus a scan of the raw SQLite bytes confirming a submitted fake work address and password appear nowhere |
| `GO_DEPLOY` | **GO_DEPLOY** with five conditions, all satisfied |
| Live QA | **PASS_LIVE** |
| `GO_PUBLISH` | **GO_PUBLISH** |

Full machine-readable evidence: `release-evidence/release-evidence.json`,
`edge-verification.json`, `cleanup-manifest.json`, `verdicts.json`,
`pre-freeze-contract-matrix.json` and `deployment-profile.json`.

Release notes for earlier versions remain in `CHANGELOG.md` and in this file's
history.
