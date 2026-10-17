import { computed, Injectable, inject, OnDestroy, signal } from '@angular/core';
import { TimerService } from './timer.service';
import { LogService } from './log.service';

/** The shape of the window the Document Picture-in-Picture API returns. */
interface PipApi {
  requestWindow(options?: { width?: number; height?: number }): Promise<Window>;
}

/**
 * A small timer window that floats above other applications, in the browser.
 *
 * The installed app has a native "always on top" switch. A web page does not:
 * no stylesheet can lift a tab above another application. Chromium's Document
 * Picture-in-Picture API is the one exception — it hands the page a separate,
 * always-on-top window — and this service is what turns that into the same
 * promise the desktop switch makes: the timer stays visible while the user works
 * somewhere else.
 *
 * Deliberately a *second* surface rather than moving the app into the window:
 * the main page keeps running (the timer, the reminders, the sound), and the
 * floating window is a mirror with a pause button. That is also why it is built
 * by hand instead of being an Angular component — the PiP document is a
 * separate document, and bootstrapping a second Angular application into it to
 * draw eight characters would be a price paid for every user to serve the few
 * who open it.
 *
 * Where the API does not exist (Firefox, Safari, every phone) the button is not
 * offered, and the UI says what the desktop app does instead.
 */
@Injectable({ providedIn: 'root' })
export class FloatingTimerService implements OnDestroy {
  private readonly timer = inject(TimerService);
  private readonly log = inject(LogService, { optional: true });

  /** True while the floating window is open. */
  readonly isOpen = signal(false);

  /** True when this browser can open one at all. */
  readonly supported = typeof globalThis !== 'undefined' && 'documentPictureInPicture' in globalThis;

  /** The one line the button reads. */
  readonly label = computed(() => (this.isOpen() ? 'Close floating timer' : 'Float timer on top'));

  private window: Window | null = null;
  private ticker: ReturnType<typeof setInterval> | null = null;

  /** Opens the window, or closes it if it is already up. */
  async toggle(): Promise<void> {
    if (this.isOpen()) {
      this.close();
      return;
    }
    await this.open();
  }

  async open(): Promise<void> {
    const api = (globalThis as { documentPictureInPicture?: PipApi }).documentPictureInPicture;
    if (!api) return;
    try {
      const win = await api.requestWindow({ width: 248, height: 138 });
      this.window = win;
      this.draw(win);
      this.isOpen.set(true);
      // The user can close a PiP window with its own controls, and the page has
      // to hear about it or the button stays in its "open" state for ever.
      win.addEventListener('pagehide', () => this.handleClosed());
      this.ticker = setInterval(() => this.update(win), 250);
      this.log?.info('system', 'floating timer opened');
    } catch (error) {
      this.log?.warn('system', `floating timer refused: ${describe(error)}`);
    }
  }

  close(): void {
    if (this.ticker) {
      clearInterval(this.ticker);
      this.ticker = null;
    }
    try {
      this.window?.close();
    } catch {
      // The window is already gone; the state below is what matters.
    }
    this.window = null;
    this.isOpen.set(false);
  }

  private handleClosed(): void {
    if (this.ticker) {
      clearInterval(this.ticker);
      this.ticker = null;
    }
    this.window = null;
    this.isOpen.set(false);
    this.log?.info('system', 'floating timer closed');
  }

  /** Builds the floating window's whole document, once. */
  private draw(win: Window): void {
    const doc = win.document;
    doc.title = 'DeepWork';
    doc.head.innerHTML = `<style>
      :root { color-scheme: dark; }
      * { box-sizing: border-box; }
      body {
        margin: 0; height: 100vh; display: flex; align-items: center; justify-content: center;
        background: #0b0818; color: #f2f0ff; font-family: system-ui, -apple-system, sans-serif;
        user-select: none; -webkit-user-select: none;
      }
      .card {
        width: 100%; height: 100%; padding: 14px 16px; display: flex; align-items: center; gap: 14px;
        background: linear-gradient(135deg, rgba(139,92,246,.16), rgba(6,182,212,.08));
        border: 1px solid rgba(139,92,246,.3); border-radius: 14px;
      }
      .dial { position: relative; width: 74px; height: 74px; flex: 0 0 auto; }
      .dial svg { transform: rotate(-90deg); display: block; }
      .dial .track { fill: none; stroke: rgba(255,255,255,.1); stroke-width: 6; }
      .dial .arc { fill: none; stroke: #8b5cf6; stroke-width: 6; stroke-linecap: round; }
      .dial .time {
        position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
        font-size: 15px; font-weight: 700; font-variant-numeric: tabular-nums; letter-spacing: -.3px;
      }
      .info { min-width: 0; display: flex; flex-direction: column; gap: 6px; }
      .kind { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: .08em; color: #8b87ab; }
      button {
        border: 1px solid rgba(139,92,246,.45); background: rgba(139,92,246,.18);
        color: #f2f0ff; border-radius: 8px; padding: 7px 10px; font-size: 11px; font-weight: 600;
        cursor: pointer; font-family: inherit;
      }
      button:hover { background: rgba(139,92,246,.32); }
    </style>`;
    doc.body.innerHTML = `<main class="card">
      <div class="dial" aria-hidden="true">
        <svg width="74" height="74" viewBox="0 0 74 74">
          <circle class="track" cx="37" cy="37" r="32"></circle>
          <circle class="arc" cx="37" cy="37" r="32" stroke-dasharray="201.06" stroke-dashoffset="0"></circle>
        </svg>
        <span class="time" data-time>00:00</span>
      </div>
      <div class="info">
        <span class="kind" data-kind>Focus session</span>
        <button type="button" data-toggle>Pause</button>
      </div>
    </main>`;

    doc.querySelector('[data-toggle]')?.addEventListener('click', () => {
      if (this.timer.isRunning()) this.timer.pause();
      else this.timer.start();
      this.update(win);
    });
    this.update(win);
  }

  /** Brings the floating window up to date with the timer. */
  private update(win: Window): void {
    const doc = win.document;
    const time = doc.querySelector('[data-time]');
    const kind = doc.querySelector('[data-kind]');
    const toggle = doc.querySelector('[data-toggle]');
    if (time) time.textContent = this.timer.displayTime();
    if (kind) {
      const type = this.timer.timerType();
      kind.textContent =
        type === 'work' ? 'Focus session' : type === 'long-break' ? 'Long break' : 'Short break';
    }
    if (toggle) toggle.textContent = this.timer.isRunning() ? 'Pause' : 'Start';
    const arc = doc.querySelector('.arc') as SVGCircleElement | null;
    if (arc) {
      const circumference = 201.06;
      arc.style.strokeDashoffset = String(circumference * (1 - this.timer.progress()));
    }
  }

  ngOnDestroy(): void {
    this.close();
  }
}

/** One line from whatever went wrong. */
function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
