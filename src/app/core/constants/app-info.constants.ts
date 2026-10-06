/**
 * The facts about this build, in one place.
 *
 * `APP_VERSION` is the version the About page reports and the number the update
 * check compares against GitHub. It is deliberately a constant rather than an
 * import of `package.json`: the webview build, the desktop bundle and the
 * release tag all have to agree, and three copies in three build systems is
 * exactly where they stop agreeing. Keep it in step with `package.json`,
 * `src-tauri/tauri.conf.json` and `src-tauri/Cargo.toml`.
 */
export const APP_VERSION = '2.0.19';

/** Product name as it appears in the UI, the installers and the releases. */
export const APP_NAME = 'DeepWork';

/** One line describing the app, used on the About page. */
export const APP_TAGLINE =
  'A secure, lightweight, cross-platform focus timer and task manager that keeps its data on your own machine.';

/** Owner/repository on GitHub. */
export const APP_REPOSITORY = 'malikrajat/deepwork';

export const APP_REPO_URL = `https://github.com/${APP_REPOSITORY}`;

/**
 * The browser build, published to GitHub Pages by
 * `.github/workflows/deploy.yml` on every push to `main`.
 *
 * Derived from the repository rather than written out, because the two have to
 * agree: Pages serves `<owner>.github.io/<repo>/`, which is the same `<repo>`
 * the build's `--base-href` points at (`package.json`, `build:github`).
 */
export const APP_WEB_APP_URL = (() => {
  const [owner, repo] = APP_REPOSITORY.split('/');
  return `https://${owner}.github.io/${repo}/`;
})();

/** Where releases, release notes and installers live. */
export const APP_RELEASES_URL = `${APP_REPO_URL}/releases`;

/**
 * GitHub's releases endpoint.
 *
 * The list endpoint is used rather than `/releases/latest` so a release
 * published out of order — or a pre-release — cannot hide a newer version.
 * Drafts and prereleases are filtered by GitHub itself for drafts, and by
 * version comparison in `UpdateService`.
 */
export const APP_RELEASES_API = `https://api.github.com/repos/${APP_REPOSITORY}/releases`;

/** Where to send a bug report or a feature request. */
export const APP_ISSUES_URL = `${APP_REPO_URL}/issues/new`;

/** The written history of the app, kept in the repository. */
export const APP_CHANGELOG_URL = `${APP_REPO_URL}/blob/main/CHANGELOG.md`;
