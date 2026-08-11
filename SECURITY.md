# Security policy

## The hosted demonstration

`https://vantage.insta.host` is a **free, shared, public demonstration**. It is
deliberately not an identity-gated system:

* Everyone signs in with the same published demonstration accounts and the
  password `vantage123`. Those credentials are documented, not leaked.
* All data is fictional. There is no real company, no real personnel and no
  real customer data in it.
* The workspace is shared. Anything you change is visible to every other
  visitor, and the whole tenant is restored to its seeded baseline **daily**.
* **It does not save credentials.** The sign-in page pre-fills the published
  demonstration account and asks your browser not to save or autofill anything
  against this origin. Your session token lives in `sessionStorage`, so it is
  gone when you close the tab. Nothing you type into the sign-in form is
  written to the database or the logs, and the abuse throttle keys on a digest
  rather than on the address you typed.
* Do not put real, personal or confidential information into it. Anything you
  type into the demonstration should be treated as public and disposable.
* The one form that asks for your identity — the Trust Center document request
  — **discards it**. On the public demonstration your name, email and company
  are not stored; the queue records an anonymous demonstration request instead.
  Nothing is emailed, and no document is sent.

The application enforces per-client rate limits, bounded and anonymised
anonymous writes, browser security headers and role separation, but the
deployment carries no availability commitment of any kind.

## Reporting a vulnerability

Please report suspected vulnerabilities privately rather than opening a public
issue:

* GitHub private vulnerability reporting on this repository (**Security →
  Report a vulnerability**), or
* email `patrick.hamid@gmail.com` with `vantage` in the subject.

Include what you did, what happened, and what you expected. A proof of concept
against the hosted demonstration is welcome, but please do not run automated
scanners, volumetric load or anything destructive against it — it is one small
shared instance, and denial of service is not an interesting finding.

An acknowledgement will be sent within seven days. This is a personal
open-source project with no paid support and no bug bounty.

## Supported versions

Only the latest released version receives fixes.

## Running it yourself

If you need a private instance, run one — the whole point of the licence:

```sh
git clone https://github.com/phamid/vantage.git && cd vantage
npm run setup && npm start
```

A self-hosted instance defaults to the safe posture: no public-demo banner and
**no scheduled data reset**. Before exposing one to a network, change the
seeded passwords in `server/seed.js`, and put your own identity gate in front
of it if the data stops being fictional.
