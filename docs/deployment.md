# The web app: how it is built, and how it gets onto GitHub Pages

The browser build is the one artefact in this repository that is not a desktop
installer. It lives at **<https://app.deepwork.rajatmalik.dev/>**, it is produced
by GitHub Actions, and nothing on a developer's machine has to be uploaded by
hand. This page is the whole of it: what publishes the site, the repository and
DNS settings that publish depends on, and what to check when a deployment looks
wrong.

## The short version

| Question                                   | Answer                                                                     |
| ------------------------------------------ | -------------------------------------------------------------------------- |
| Where does the site live?                  | <https://app.deepwork.rajatmalik.dev/> — a custom domain, at its root       |
| What publishes it?                         | [`.github/workflows/deploy.yml`](../.github/workflows/deploy.yml)           |
| When does that run?                        | Every push to `main`, and on demand from **Actions → Run workflow**         |
| What does it build?                        | `npm run build:github` → `dist/deepwork/browser`                            |
| Where does that come from?                 | `ng build --base-href=/ --configuration production && node scripts/pages-404.mjs` |
| How does the app survive a refresh?        | `404.html` — see [`pages-404.mjs`](../scripts/pages-404.mjs)                 |
| How does the custom domain survive a deploy? | [`public/CNAME`](../public/CNAME)                                        |
| What does GitHub need to be told?          | **Settings → Pages**: Source *GitHub Actions*, custom domain, HTTPS enforced |

The rest of this page is the reasoning behind each line, because the failure
modes here are quiet: a wrong base href serves a blank page at a URL that
answers `200`, and a missing `404.html` serves a GitHub error page for every
route but the root. Neither shows up as a red build.

## Why GitHub Actions at all

Angular has no server to deploy. `ng build` turns the project into a folder of
static files — JavaScript, CSS, an `index.html`, a service worker — and hosting
is reduced to putting that folder at a URL. GitHub Pages will host it, but only
what is committed to a branch or delivered as a Pages artefact, and it does not
run a build for you.

So the build has to happen before the folder is published. `deploy.yml` is that
build: a runner checks out `main`, runs `npm ci`, runs `ng build`, and hands the
output folder to GitHub as a Pages artefact. That is the whole "CI builds it and
deploys it" arrangement — there is no second directory to keep in step, no
`gh-pages` branch to force-push, and no chance of a stale folder on a laptop
being the thing that went live.

GitHub's own source options need to agree with this. **Settings → Pages → Build
and deployment → Source** must be **GitHub Actions**. If it is set to *Deploy
from a branch*, GitHub publishes the branch as-is instead of waiting for the
artefact, and the site you see is not the site the workflow built.

## Why the base href is `/`

Angular resolves every script, stylesheet and icon against the `<base href>` in
`index.html`. A build made for `<owner>.github.io/<repo>/` carries
`<base href="/deepwork/">`, and the browser then asks for
`https://app.deepwork.rajatmalik.dev/deepwork/main-….js`. On the custom domain
there is no `/deepwork/` directory, so every one of those requests is a 404, the
page stays empty, and the network tab is the only evidence. The address still
answers `200`, so nothing looks broken from the outside except that there is
nothing on the page.

`build:github` therefore passes `--base-href=/`: the site is at the root of its
own domain, so its assets are too. `deploy.yml` verifies the result before it
uploads anything —

```bash
grep -q '<base href="/"' dist/deepwork/browser/index.html
```

— so a deployment that would serve a blank page fails in the pipeline instead of
in a browser. `scripts/pages-404.mjs` refuses to write the `404.html` copy for
the same reason: a copy carrying a sub-path base href would be a second copy of
the same blank page.

If the app ever moves back under a path — `example.com/deepwork/`, or a Pages
project URL again — both places change together: `--base-href` in
`package.json`'s `build:github`, and the guard at the bottom of
`scripts/pages-404.mjs`.

## Why there is a `404.html`

GitHub Pages is a file server with no rewrite rules. A request for `/tasks` is a
request for a file called `tasks`; there is none, so the answer is GitHub's
"File not found" page. The app works as long as you only click links inside it,
and breaks the moment a route is refreshed, bookmarked, or opened from a shared
link.

Pages does serve one thing it knows about: the site's own `404.html`, at the
address that was asked for. Publishing a copy of the shell under that name is
the entire fix — the browser is given the app, the app's router reads `/tasks`
from the untouched address bar, and the Tasks page opens. It is the same trade
an S3 website makes with `ErrorDocument`.

`scripts/pages-404.mjs` makes that copy at the end of `npm run build:github`,
rather than as a `cp` step in CI, so that a local build is byte-for-byte the
artefact CI publishes.

## Why there is a `CNAME` file

The custom domain is a setting on the repository, and Pages keeps it across
deployments on its own. `public/CNAME` is there anyway: it costs one line, it
documents the intended host inside the source tree, and it means the artefact
itself still says where it belongs if the site is ever rebuilt into a fresh
repository or served by another static host. Angular copies everything under
`public/` into the build, so it arrives as `dist/deepwork/browser/CNAME` without
anything else to do.

## What is needed outside this repository

These are one-time settings, and nothing in the code can check them.

**DNS.** At the DNS provider for `rajatmalik.dev`, a `CNAME` record:

| Type    | Name              | Value                    |
| ------- | ----------------- | ------------------------ |
| `CNAME` | `app.deepwork`    | `malikrajat.github.io.`  |

A subdomain of a domain you own is a `CNAME`; the apex (`rajatmalik.dev` itself)
would need `A`/`AAAA` records instead. The value is **`malikrajat.github.io`** —
the user site — not `malikrajat.github.io/deepwork`.

**Repository settings** — **Settings → Pages**:

| Setting            | Value                                  |
| ------------------ | -------------------------------------- |
| Source             | **GitHub Actions**                     |
| Custom domain      | `app.deepwork.rajatmalik.dev`          |
| Enforce HTTPS      | **On**                                 |

The certificate is issued by GitHub after the DNS record resolves — usually
minutes, occasionally a day. Until it is approved, the site is reachable over
plain `http://` only; the HTTPS box stays unticked with no error worth reading.

Checking the current state without opening a browser:

```bash
gh api repos/malikrajat/deepwork/pages \
  --jq '{status, cname, build_type, html_url, https_enforced}'
```

A healthy repository answers with `"build_type": "workflow"`, the custom domain,
`"https_enforced": true`, and a certificate whose state is `approved`.

## Publishing a change

Deployments follow `main`, and only `main`:

1. Commit the change on a branch, open a pull request, merge it — the same
   route every other change takes.
2. The merge lands on `main` and `deploy.yml` starts on its own.
3. **Actions → Deploy Angular App to GitHub Pages** shows the run: checkout,
   `npm ci`, build, the base-href check, then the upload and the deployment.
4. The deployment step prints the URL it published. Open it and hard-refresh
   once — the service worker serves the previous bundle from cache until it
   updates.

A push to any other branch starts no deployment, and a pull request shows no
deploy check: `deploy.yml` has no `pull_request` trigger. To publish without a
commit at all, **Actions → Deploy Angular App to GitHub Pages → Run workflow**
on `main` (`workflow_dispatch`).

## Checking a deployment

**Locally, before pushing.** `npm run build:github` is the same command CI runs.
The things worth looking at afterwards:

```bash
grep -o '<base href="[^"]*"' dist/deepwork/browser/index.html   # must be "/"
cat dist/deepwork/browser/CNAME                                  # the custom domain
test -f dist/deepwork/browser/404.html && echo shell-copy-present
```

Serving that folder over HTTP and clicking around — `npx http-server
dist/deepwork/browser`, then open a deep route directly — is the cheapest way to
reproduce what Pages does, `404.html` included.

**Live.** Always with a fresh cache, because the service worker will otherwise
answer from the previous deployment:

```bash
curl -s https://app.deepwork.rajatmalik.dev/ | grep -o '<base href="[^"]*"'
curl -sI https://app.deepwork.rajatmalik.dev/tasks | head -1   # 404 status, app body
```

The second line is expected to be `404` — Pages answers a deep link with the
`404.html` copy, and the app renders. That is the design, not a fault.

## When something looks wrong

| Symptom                                                         | Cause                                                                                          |
| --------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Blank page, `200` response, every asset `404` under `/deepwork/` | The artefact was built without `--base-href=/` — check the `build:github` script and the workflow's base-href step |
| Blank page, assets `404` under a path that does not exist        | The custom domain is gone from **Settings → Pages**; the site is being served from the project URL instead |
| GitHub's "File not found" on a refresh of any inner route        | `404.html` missing from the artefact — `scripts/pages-404.mjs` did not run, or uploaded the wrong folder |
| An old version keeps appearing after a successful deploy         | The service worker cache. Hard-refresh, or unregister it in devtools; a new `sw.js` takes over on the next visit |
| Deploy run is green but the site did not change                 | Pages source is *Deploy from a branch*, so GitHub published the branch and ignored the artefact |
| HTTPS shows "Not secure", or the domain is unreachable           | The DNS record is missing or still propagating, or GitHub has not issued the certificate yet    |

## The old address

`https://malikrajat.github.io/deepwork/` now answers `301` to the custom domain,
which is why old links in [`CHANGELOG.md`](../CHANGELOG.md) and in the dated
release notes still arrive at the app. Those files are history and are left as
written; every address the app itself hands out — About, the download list, the
visitor counter note — comes from `APP_WEB_APP_URL` in
[`app-info.constants.ts`](../src/app/core/constants/app-info.constants.ts).
