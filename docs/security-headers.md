# Security headers on the web build

The browser build publishes four headers that a plain static host normally
leaves out. They are declared in one file — [`public/_headers`](../public/_headers)
— which `ng build` copies to `dist/deepwork/browser/_headers`, and which
**Cloudflare Pages reads from the root of the deployed output**. There is no
dashboard step and no API call: changing a header is a commit.

GitHub Pages cannot send custom response headers at all, which is why this only
works on the Pages project. The values below are what a scanner such as
<https://securityheaders.com> looks for.

| Header                      | Value                                                  | What it stops                                  |
| --------------------------- | ------------------------------------------------------ | ---------------------------------------------- |
| `Strict-Transport-Security` | `max-age=31536000; includeSubDomains`                  | A downgrade to plain HTTP, and the cookie/redirect tricks that follow it |
| `Content-Security-Policy`   | an allowlist of exactly what the app loads             | A script, frame or request from any other origin |
| `X-Frame-Options`           | `SAMEORIGIN`                                           | Somebody framing the app and click-jacking it  |
| `Permissions-Policy`        | `camera=()`, `microphone=()`, `geolocation=()`, …      | A dependency (or an injected script) using device APIs the app never needs |

`X-Content-Type-Options: nosniff` and `Referrer-Policy:
strict-origin-when-cross-origin` are repeated there too. Pages sends both on its
own, but declaring them keeps the file the single answer to "what does this site
send?" and means a move to another host loses nothing.

## Why the CSP has `'unsafe-inline'`

Two things in this app need it, and neither can be given a hash or a nonce:

- **Google Tag Manager injects its container as an inline `<script>`.** A static
  host build cannot mint a per-response nonce, and the injected code is not known
  when the page is built, so no hash can describe it either.
- **Angular writes component styles into `<style>` elements at runtime**, so
  `style-src` needs `'unsafe-inline'` by construction.

The origin list is still doing the work that matters: a script from anywhere
outside the allowlist is refused. `'unsafe-eval'` is deliberately absent and
`scripts/check-headers.mjs` fails if it is ever added.

## Adding a vendor

Every origin in the policy is there because this app loads something from it:

| Origin                                   | Used for                                              |
| ---------------------------------------- | ----------------------------------------------------- |
| `www.googletagmanager.com`, `*.google-analytics.com`, `*.analytics.google.com` | Google Tag Manager and the GA4 property it loads |
| `gc.zgo.at`, `*.goatcounter.com`         | The visitor counter: the pinned script and where pageviews go |
| `js.hcaptcha.com`, `*.hcaptcha.com`      | The contact form's captcha: script, iframe, assets, styles |
| `api.web3forms.com`                      | Where the contact form posts                          |
| `api.github.com`                         | The release feed behind the download list             |
| `data:`, `blob:`                         | The select control's inline SVG, and CSV/Excel/JSON exports |

A new one belongs in the directive that matches how it is used — `script-src`
for a script, `connect-src` for `fetch`/XHR/beacons, `img-src` for pixels — and
in the comment at the top of `_headers` that says why. Then check the browser
console: a blocked request names the directive it violated and the origin it
wanted, which is the whole diagnosis.

## Checking it

Locally, after a build (the script also runs in CI, and inside `npm run verify`):

```bash
npm run check:headers
```

Against the deployed site — the only way to know whether the host is really
sending them:

```bash
npm run check:headers -- --url https://app.deepwork.rajatmalik.dev/
curl -sI https://app.deepwork.rajatmalik.dev/ | grep -iE 'strict-transport|content-security|x-frame|permissions-policy'
```

The check reads the headers off the live response and judges each value the same
way it judges the file, so a host that ignores `_headers` fails here rather than
passing silently.

## Two things a header change cannot undo

**HSTS is remembered by the browser.** Once a visitor has seen
`max-age=31536000`, that browser will refuse plain HTTP to this host for a year,
even if the header is removed later. That is the point of it — and why a
shorter `max-age` while trying it out, or the Cloudflare zone-level toggle
(**SSL/TLS → Edge Certificates → HSTS**) instead of this file, is the cautious
route. `preload` is not set: submitting to the preload list is effectively
permanent and is a decision for the domain, not for one app on it.

**One host has one set of headers.** `_headers` matches on the request path, not
on the hostname, so the policy also applies to the project's `*.pages.dev`
address and to preview deployments. That is harmless — the same app is served
there — but it does mean a header added for the custom domain applies to every
preview too.

## The deployment this depends on

The headers only reach a visitor if the address they use is served by the Pages
project. At the time of writing, `app.deepwork.rajatmalik.dev` still answers from
**GitHub Pages** (the response carries `Server: GitHub.com` and the bundle from
the last `deploy.yml` run), while the Pages project serves the app at its
`app-deepwork.pages.dev` address. Until the custom domain is attached to the
Pages project — **Workers & Pages → the project → Custom domains**, which also
rewrites the DNS record that currently points at `malikrajat.github.io` — the
scanner at the custom domain will keep reporting the headers as missing, no
matter what this repository contains.

Once the domain has moved, the GitHub Pages deployment in
[`deploy.yml`](../.github/workflows/deploy.yml) is publishing a site nobody
visits, and can be removed.
