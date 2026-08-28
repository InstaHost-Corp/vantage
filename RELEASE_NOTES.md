# Vantage 1.3.0 - public signup and open publication

| | |
|---|---|
| **Release** | 1.3.0 |
| **Type** | Minor - public signup and repository publication |
| **Repository** | `InstaHost-Corp/vantage` |
| **Publication model** | Public GitHub repository; free hosted demonstration |

## What changed

- Added `/signup` and `POST /api/auth/signup` for self-service contributor
  accounts.
- Signup normalizes and validates bounded name, email and password fields,
  stores passwords with salted scrypt hashing, rate-limits anonymous attempts,
  rejects duplicate addresses, and grants no administrative privileges.
- Opened `https://vantage.insta.host` for anonymous access after verifying the
  application-level public-mode guards.

## Security and data

- New accounts are contributors and the shared fictional workspace resets
  daily. Do not enter real or confidential information.
- Signup stores the supplied display name and email plus a password hash so
  the account can be used. No plaintext password is stored or returned.

## Rollback

- Restore the Cloudflare Access gate with `python3 scripts/publishctl.py regate`.
- Redeploy the previous known-good release and restore repository visibility
  only if required; do not rewrite history.

## Known limitations

- The hosted demonstration remains shared and fictional. It is not a
  production compliance system and does not connect to customer environments.
