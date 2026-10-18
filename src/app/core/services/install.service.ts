import { computed, inject, Injectable, OnDestroy, signal } from '@angular/core';
import { installSupport } from '../utils/install-support.util';
import { PlatformOs, detectOs, isMobileAgent, osLabel } from '../utils/platform.util';
import { NotificationService } from './notification.service';
import { AttentionService } from './attention.service';
import { LogService } from './log.service';

const DISMISS_KEY = 'deepwork_install_dismissed';
const SYSTEM_PROMPT_KEY = 'deepwork_install_system_prompt_at';
const STARTUP_ASKED_KEY = 'deepwork_pwa_startup_asked';
const STARTUP_ACKNOWLEDGED_KEY = 'deepwork_pwa_startup_ack';

/** How long the app waits before suggesting installation at system level. */
const SYSTEM_PROMPT_DELAY_MS = 150_000;

/**
 * How often the system-level suggestion may be posted.
 *
 * Once a week, not once a visit: a notification that arrives every time the app
 * is opened is an advertisement, and the app already has a banner for the case
 * where the user is looking at it. This is the other half — a nudge for the
 * person who has the tab open somewhere behind their work.
 */
const SYSTEM_PROMPT_INTERVAL_MS = 7 * 24 * 60 * 60_000;

/** How long the banner pulses after a system notification points at it. */
const HIGHLIGHT_MS = 9_000;

/** How the app is being run. */
export type RunMode = 'desktop' | 'installed' | 'browser';

/** What the store remembers between visits, without touching the database. */
function readFlag(key: string): boolean {
  try {
    return localStorage.getItem(key) === '1';
  } catch {
    return false;
  }
}

function writeFlag(key: string, value: boolean): void {
  try {
    if (value) localStorage.setItem(key, '1');
    else localStorage.removeItem(key);
  } catch {
    /* storage unavailable — the suggestion simply comes back next time */
  }
}

function readNumber(key: string): number {
  try {
    const value = Number(localStorage.getItem(key));
    return Number.isFinite(value) ? value : 0;
  } catch {
    return 0;
  }
}

/** True when the page is being shown as an installed app rather than a tab. */
function detectStandalone(): boolean {
  try {
    if (globalThis.matchMedia?.('(display-mode: standalone)')?.matches) return true;
  } catch {
    /* no media queries here */
  }
  // iOS does not implement the media query for home-screen apps; it sets this
  // non-standard flag instead.
  return (globalThis.navigator as { standalone?: boolean } | undefined)?.standalone === true;
}

/**
 * How this copy of DeepWork is running, and what that copy can therefore do.
 *
 * Three states, and every install-related surface reads them from here rather
 * than guessing:
 *
 * - **desktop** — the packaged Tauri app. It can start at login, stay on top,
 *   live in the tray and own the whole window. No install prompt.
 * - **installed** — the web app launched from its own icon (PWA). It has its own
 *   window and works offline; the browser controls the login item and the
 *   always-on-top behaviour, so the app can only explain how.
 * - **browser** — a tab. It can install itself where the browser allows it, and
 *   until it does, the app prompts: a banner while the user is here and a system
 *   notification while they are not.
 *
 * `mode` is a signal because "installed" can become true while the app is
 * running — `appinstalled` fires, or the page is moved between display modes —
 * and every prompt has to stop the moment it does.
 */
@Injectable({ providedIn: 'root' })
export class InstallService implements OnDestroy {
  private readonly notifications = inject(NotificationService);
  private readonly attention = inject(AttentionService);
  private readonly log = inject(LogService, { optional: true });

  /**
   * True inside the packaged desktop app.
   *
   * The desktop bundle is already an installed application: `beforeinstallprompt`
   * never fires there and `(display-mode: standalone)` never matches, so the
   * browser-only install UI would otherwise show up on every page of the
   * installed app as an extra full-width bar above the app header.
   */
  readonly isDesktopApp = typeof globalThis !== 'undefined' && '__TAURI_INTERNALS__' in globalThis;

  /** True when launched as an installed web app (PWA). */
  readonly isInstalled = signal(detectStandalone());

  /** True when the browser's native install prompt is ready to trigger. */
  readonly canInstall = signal(false);

  /** True when the user hid the install banner — remembered across visits. */
  readonly isDismissed = signal(readFlag(DISMISS_KEY));

  /** True while the install/startup dialog is open. */
  readonly dialogOpen = signal(false);

  /** Which half of the dialog to show. */
  readonly dialogView = signal<'install' | 'startup'>('install');

  /** True for a few seconds after a system prompt points at the banner. */
  readonly highlighted = signal(false);

  /** True when the user has been told how to start the installed app at login. */
  readonly startupAcknowledged = signal(readFlag(STARTUP_ACKNOWLEDGED_KEY));

  /** True when the app was installed during this session. */
  readonly justInstalled = signal(false);

  /** True once anything has been set up for this installation. */
  readonly setupComplete = computed(() => this.isDesktopApp || this.isInstalled());

  readonly os: PlatformOs = detectOs(globalThis.navigator?.userAgent ?? '', {
    maxTouchPoints: (globalThis.navigator as { maxTouchPoints?: number } | undefined)
      ?.maxTouchPoints,
  });

  /** The OS in words the copy can use. */
  readonly osName = osLabel(this.os);

  readonly isMobile = signal(this.detectMobile());

  /**
   * How this copy is running. A function of the two facts above rather than a
   * third variable that could disagree with them.
   */
  readonly mode = computed<RunMode>(() => {
    if (this.isDesktopApp) return 'desktop';
    return this.isInstalled() ? 'installed' : 'browser';
  });

  /** Shorthand for the two prompts that only apply to the web app. */
  readonly isPwa = computed(() => this.mode() === 'installed');

  /**
   * How this browser installs a web app, and what to say if it will not.
   *
   * Read once: a browser does not change under a running page. It exists
   * because the icon in the address bar is a Chromium feature — Safari installs
   * from the File menu and has no icon, and Firefox cannot install at all — so
   * one instruction for all three sends two kinds of reader looking for
   * something that is not there.
   */
  readonly support = installSupport(globalThis.navigator?.userAgent ?? '');

  /** The one sentence to show when the browser is not offering its own button. */
  readonly hint = this.support.hint;

  /**
   * True when this browser can float a timer above other windows.
   *
   * The Document Picture-in-Picture API is Chromium-only and desktop-only, so it
   * is offered where it exists and explained where it does not. On the packaged
   * desktop the native window does this itself and none of this applies.
   */
  readonly canFloatOnTop = 'documentPictureInPicture' in globalThis;

  /** True when the OS can be asked to launch this copy at login. */
  readonly canStartAtLogin = this.isDesktopApp;

  /**
   * True while the banner should be on screen.
   *
   * The banner is fixed to the top of the window, so the app shell has to know
   * whether it is there: it leaves the banner's height free at the top rather
   * than putting the sidebar's own collapse button underneath it. One condition,
   * asked by both, so the two can never disagree.
   */
  readonly isVisible = computed(
    () => !this.isDesktopApp && !this.isInstalled() && !this.isDismissed(),
  );

  /**
   * True when the app should ask how to start at login.
   *
   * A web app cannot write a login item — that is the browser's and the
   * operating system's business — so the app asks once and explains, rather
   * than leaving the user to discover it. The desktop build has a real switch
   * and its own first-run dialog; this is only for the installed web app.
   */
  readonly shouldExplainStartup = computed(
    () => this.isPwa() && !this.startupAcknowledged(),
  );

  private deferredPrompt: any = null;
  private systemPromptTimer: ReturnType<typeof setTimeout> | null = null;
  private highlightTimer: ReturnType<typeof setTimeout> | null = null;
  private startupTimer: ReturnType<typeof setTimeout> | null = null;
  private lastSystemPromptAt = readNumber(SYSTEM_PROMPT_KEY);

  constructor() {
    // Pick up prompt captured before Angular bootstrapped (race condition fix)
    const early = (globalThis as any).__pwaInstallPrompt;
    if (early) {
      this.deferredPrompt = early;
      this.canInstall.set(true);
      (globalThis as any).__pwaInstallPrompt = null;
    }

    // Also handle prompts that fire after bootstrap
    globalThis.addEventListener?.('beforeinstallprompt', (e: Event) => {
      e.preventDefault();
      this.deferredPrompt = e;
      this.canInstall.set(true);
    });

    globalThis.addEventListener?.('appinstalled', () => this.markInstalled(true));

    // The mode can change without a reload in two ways: the browser moves the
    // page into (or out of) a standalone window, or the user comes back to a tab
    // that was installed while it was in the background.
    try {
      const standalone = globalThis.matchMedia?.('(display-mode: standalone)');
      standalone?.addEventListener?.('change', (event) => this.markInstalled(event.matches));
    } catch {
      /* no media queries here */
    }
    globalThis.document?.addEventListener?.('visibilitychange', () => {
      if (globalThis.document.visibilityState === 'visible' && detectStandalone()) {
        this.markInstalled(true);
      }
    });

    // A phone can be rotated or resized into a different layout without the user
    // agent changing; the copy follows the width.
    try {
      const coarse = globalThis.matchMedia?.('(pointer: coarse)');
      coarse?.addEventListener?.('change', () => this.isMobile.set(this.detectMobile()));
    } catch {
      /* no media queries here */
    }
  }

  // ── Install ─────────────────────────────────────────────────────────────────

  /**
   * Installs the web app, or explains how.
   *
   * The native prompt exists on Chromium only and is only offered once it has
   * fired. Everywhere else the dialog is the answer — Safari's File menu, a
   * phone's Share sheet, and the browsers that cannot install at all. A button
   * labelled Install that silently does nothing is the worst of the three.
   */
  async install(): Promise<void> {
    if (!this.deferredPrompt) {
      this.openDialog('install');
      return;
    }
    this.deferredPrompt.prompt();
    const { outcome } = await this.deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      this.deferredPrompt = null;
      this.canInstall.set(false);
      this.dialogOpen.set(false);
    }
  }

  /** Hide the banner without preventing future installs. */
  dismiss(): void {
    writeFlag(DISMISS_KEY, true);
    this.isDismissed.set(true);
  }

  /** Bring the banner back, for Settings' "Show the install prompt again". */
  showAgain(): void {
    writeFlag(DISMISS_KEY, false);
    this.isDismissed.set(false);
    this.openDialog('install');
  }

  openDialog(view: 'install' | 'startup' = this.isInstalled() ? 'startup' : 'install'): void {
    this.dialogView.set(view);
    this.dialogOpen.set(true);
    if (view === 'startup') writeFlag(STARTUP_ASKED_KEY, true);
  }

  closeDialog(): void {
    this.dialogOpen.set(false);
  }

  /** Points the user at the banner for a moment, after a system notification. */
  highlight(): void {
    this.highlighted.set(true);
    if (this.highlightTimer) clearTimeout(this.highlightTimer);
    this.highlightTimer = setTimeout(() => this.highlighted.set(false), HIGHLIGHT_MS);
  }

  /** The installed app's answer to "thank you, I know how to start it". */
  acknowledgeStartup(): void {
    writeFlag(STARTUP_ACKNOWLEDGED_KEY, true);
    this.startupAcknowledged.set(true);
  }

  // ── The prompts ─────────────────────────────────────────────────────────────

  /**
   * Starts the system-level suggestion for the web app.
   *
   * Called once, at startup. It waits long enough that the user has actually
   * used the app before being told to install it, and only speaks when a
   * notification could actually be delivered. Anything else is a timer that
   * fires into nothing and counts as a prompt that was shown.
   */
  startSystemPrompt(): void {
    if (this.isDesktopApp || this.isInstalled() || this.isDismissed()) return;
    if (!this.support.supported) return;
    if (this.systemPromptTimer) return;
    if (Date.now() - this.lastSystemPromptAt < SYSTEM_PROMPT_INTERVAL_MS) return;
    this.systemPromptTimer = setTimeout(() => void this.postSystemPrompt(), SYSTEM_PROMPT_DELAY_MS);
  }

  /**
   * Opens the post-install explanation once, a few seconds after the app opens.
   *
   * Only for the installed web app, only until the user has read it, and only if
   * it has not already been shown in this installation — an explanation that
   * reappears on every launch is a dialog nobody can close for good.
   */
  maybeExplainStartup(): void {
    if (!this.isPwa() || this.startupAcknowledged()) return;
    if (readFlag(STARTUP_ASKED_KEY)) return;
    if (this.startupTimer) return;
    this.startupTimer = setTimeout(() => {
      if (this.isPwa() && !this.startupAcknowledged() && !this.dialogOpen()) {
        this.openDialog('startup');
      }
    }, 4_000);
  }

  private async postSystemPrompt(): Promise<void> {
    this.systemPromptTimer = null;
    if (this.isDesktopApp || this.isInstalled() || this.isDismissed()) return;
    if (this.attention.paused()) {
      // The user asked for quiet. Try once more later rather than swallowing the
      // one suggestion the week had; nothing is marked as delivered.
      this.systemPromptTimer = setTimeout(
        () => void this.postSystemPrompt(),
        10 * 60_000,
      );
      return;
    }
    if (!this.notificationPermissionGranted()) {
      // Without permission there is no system-level half. The banner is still
      // there, and the suggestion is not recorded as shown.
      this.log?.info('system', 'install suggestion skipped: notifications are not permitted');
      return;
    }

    const surface = this.isMobile() ? 'home screen' : 'desktop';
    await this.notifications.announce(
      'Install DeepWork',
      `Add DeepWork to your ${surface} so your timer is one click away. It opens in its own window and works offline.`,
      {
        tag: 'deepwork-install',
        onClick: () => {
          this.highlight();
          globalThis.focus?.();
        },
      },
    );
    this.lastSystemPromptAt = Date.now();
    try {
      localStorage.setItem(SYSTEM_PROMPT_KEY, String(this.lastSystemPromptAt));
    } catch {
      /* storage unavailable — the next visit may suggest it again */
    }
    this.log?.info('system', 'install suggested at system level');
  }

  // ── Internals ───────────────────────────────────────────────────────────────

  private markInstalled(installed: boolean): void {
    if (installed === this.isInstalled()) return;
    this.isInstalled.set(installed);
    if (!installed) return;

    // Installed: every browser-only prompt is over.
    this.justInstalled.set(true);
    this.canInstall.set(false);
    this.deferredPrompt = null;
    writeFlag(DISMISS_KEY, false);
    this.isDismissed.set(false);
    if (this.systemPromptTimer) {
      clearTimeout(this.systemPromptTimer);
      this.systemPromptTimer = null;
    }
    this.log?.info('system', 'installed as a web app');
    // The question that follows an installation is "shall it open with your
    // computer?", and the answer here is an explanation rather than a switch.
    setTimeout(() => this.openDialog('startup'), 800);
  }

  private detectMobile(): boolean {
    const ua = globalThis.navigator?.userAgent ?? '';
    if (isMobileAgent(ua, (globalThis.navigator as { maxTouchPoints?: number })?.maxTouchPoints ?? 0)) {
      return true;
    }
    return globalThis.matchMedia?.('(pointer: coarse)')?.matches ?? false;
  }

  private notificationPermissionGranted(): boolean {
    if (typeof Notification === 'undefined') return false;
    return Notification.permission === 'granted';
  }

  ngOnDestroy(): void {
    if (this.systemPromptTimer) clearTimeout(this.systemPromptTimer);
    if (this.highlightTimer) clearTimeout(this.highlightTimer);
    if (this.startupTimer) clearTimeout(this.startupTimer);
  }
}
