/**
 * What the update check can be doing, in the order a user meets it.
 *
 * - `unknown` — never checked (first run, and no cached answer).
 * - `checking` — a request is in flight.
 * - `update-available` — a newer release is published on GitHub.
 * - `up-to-date` — this build is the latest release.
 * - `ahead` — this build is newer than the latest release (a development build,
 *   or a version published but not yet released). Reported honestly rather than
 *   as "up to date", because "you are running something that is not released
 *   yet" is a different fact.
 * - `unavailable` — the check could not answer: offline, rate-limited, or no
 *   releases published yet. `message` says which.
 */
export type UpdateStatus =
  | 'unknown'
  | 'checking'
  | 'update-available'
  | 'up-to-date'
  | 'ahead'
  | 'unavailable';

/** One downloadable file attached to a release. */
export interface ReleaseAsset {
  name: string;
  /** Size in bytes, as GitHub reports it. */
  size: number;
  downloadUrl: string;
}

/** A published GitHub release, reduced to what the app shows. */
export interface ReleaseInfo {
  /** Version without the tag prefix, e.g. `1.0.0` for the tag `v1.0.0`. */
  version: string;
  /** The tag exactly as published, e.g. `v1.0.0`. */
  tag: string;
  /** Release title, or the tag when the release has no title. */
  name: string;
  /** The release notes, as Markdown. */
  notes: string;
  /** ISO timestamp of publication, or null when GitHub reports none. */
  publishedAt: string | null;
  /** The GitHub page for this release. */
  url: string;
  prerelease: boolean;
  assets: ReleaseAsset[];
}

/** The answer to "is there anything newer than what I am running?" */
export interface UpdateCheck {
  status: UpdateStatus;
  /** Version of the running build. */
  currentVersion: string;
  /** The newest published release, once one has been read. */
  latest: ReleaseInfo | null;
  /** When the answer was obtained, ISO timestamp. */
  checkedAt: string | null;
  /** Why the check could not answer, or extra context when it could. */
  message: string | null;
}

/**
 * How far the in-app update has got.
 *
 * - `idle` — nothing has been asked for yet.
 * - `downloading` — the installer for this machine is being fetched.
 * - `installing` — the file is on disk and the OS installer is being started.
 * - `started` — the installer is running; what happens next is the OS's.
 * - `error` — it could not be done, and `error` says why.
 */
export type UpdateInstallState = 'idle' | 'downloading' | 'installing' | 'started' | 'error';
