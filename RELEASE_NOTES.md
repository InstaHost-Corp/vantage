# Vantage 2.2.0 — public landing page

| | |
|---|---|
| **Release** | 2.2.0 |
| **Type** | Minor — new pre-auth marketing landing page |
| **Repository** | `InstaHost-Corp/vantage` |
| **Publication model** | Public GitHub repository; free hosted demonstration |

## What changed

- **New landing page** at `/` for unauthenticated visitors, replacing the
  previous immediate redirect to `/login`. It explains what Vantage is, lists
  its capability areas, and states that it is free, MIT-licensed and open
  source with a link to the public GitHub repository and a copy of the
  self-host command (`git clone` / `npm run setup` / `npm start`).
- The Vantage logo on `/login` and `/signup` now links back to `/`.
- Authenticated visitors are unaffected: `/` continues to render the existing
  dashboard for a signed-in session.

## Security and data

- No new server routes, no new data collected, no schema or migration change.
  The landing page renders static marketing copy plus the pre-existing public
  `/api/public/config` endpoint (service name, version, source URL, signup
  policy) that was already exposed to unauthenticated callers.
- Content was checked against the existing `compliance-positioning` test,
  which fails the build if prohibited overclaiming language (for example
  "audit-ready evidence" or "live data from your connected systems") appears
  in any public-facing source file; `web/src/pages/Home.jsx` was added to the
  scanned file set.

## Migration

None. This is a stateless, presentation-only change; no database migration or
backfill is required.

## Rollback

- Redeploy the previous release (2.1.0). No data changes to revert.

## Known limitations

- The landing page content is static per deployment; there is no CMS or
  per-tenant customization of the marketing copy.
