import {
  ApplicationConfig,
  ErrorHandler,
  Injector,
  inject,
  provideAppInitializer,
  provideBrowserGlobalErrorListeners,
} from '@angular/core';
import { provideRouter } from '@angular/router';

import { routes } from './app.routes';
import { AppErrorHandler } from './core/services/app-error-handler';
import { DbService } from './core/services/db.service';
import { LogService } from './core/services/log.service';
import { SettingsService } from './core/services/settings.service';
import { ThemeService } from './core/services/theme.service';
import { TrayMenuService } from './core/services/tray-menu.service';
import { DesktopPrefsService } from './core/services/desktop-prefs.service';
import { UiService } from './core/services/ui.service';
import { ScheduleService } from './core/services/schedule.service';
import { WaterReminderService } from './core/services/water-reminder.service';
import { ReminderService } from './core/services/reminder.service';
import { AttentionService } from './core/services/attention.service';
import { LaunchPromptService } from './core/services/launch-prompt.service';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    // Anything Angular catches goes to `crash.log` rather than only the console.
    { provide: ErrorHandler, useClass: AppErrorHandler },
    provideRouter(routes),
    // `provideAppInitializer` replaced the `APP_INITIALIZER` token in Angular 22;
    // the callback runs in an injection context, so `inject()` replaces `deps`.
    provideAppInitializer(async () => {
      const log = inject(LogService);
      const db = inject(DbService);
      const settings = inject(SettingsService);
      const theme = inject(ThemeService);
      const schedule = inject(ScheduleService);
      const waterReminder = inject(WaterReminderService);
      const reminder = inject(ReminderService);
      const injector = inject(Injector);
      const trayMenu = inject(TrayMenuService);
      const desktopPrefs = inject(DesktopPrefsService);
      const ui = inject(UiService);
      const attention = inject(AttentionService);
      const launchPrompt = inject(LaunchPromptService);

      // The log is connected before anything else can fail, so the startup
      // sequence itself is on the record.
      await log.install();
      await db.init();
      await settings.loadSettings();
      theme.apply();
      await schedule.load();
      // One ticker for the water reminder: it reads the settings on every
      // tick, so turning the reminder on or off needs no restart.
      waterReminder.start();
      // The stand-and-walk reminder is the same shape: its own single loop,
      // reading the settings on every pass, sharing the attention state and the
      // notification sound with every other message the app raises. It is
      // loaded after the critical services because its card, its quote deck and
      // its scheduler are not part of the first paint — the chunk arrives here,
      // before the window is shown, so the first tick still has somewhere to run.
      const { MovementReminderService } = await import('./core/services/movement-reminder.service');
      injector.get(MovementReminderService).start();
      await trayMenu.init();
      // Reconciles "start with system" with the real OS state and applies
      // the saved always-on-top preference before the UI appears.
      await desktopPrefs.init();
      // Listens for the OS minimise button and, when this copy was started by
      // the OS at login, opens straight into the mini widget.
      await ui.init();
      // Asks the desktop once whether now is a quiet moment, and keeps asking:
      // every reminder that is not a finished timer reads this before it speaks.
      await attention.init();
      // The standing reminders are stored, not scheduled: starting the loop after
      // the attention state is known means a reminder that came due while the app
      // was closed is raised (or held, if the user is paused) with the truth
      // already in hand.
      reminder.start();
      // Opens the first-run question, or starts the day's reminders if it has
      // already been answered. After the preferences it depends on, never before
      // them: "already marked" is a fact about the operating system.
      await launchPrompt.init();
      // The other half of the two body reminders being off by default: while
      // either one is off, offer it every two hours inside its working window.
      // Loaded here rather than imported at the top so the offer and its copy
      // stay out of the first paint, like the stand-and-walk feature itself.
      const { BodyReminderPromptService } =
        await import('./core/services/body-reminder-prompt.service');
      injector.get(BodyReminderPromptService).start();
    }),
  ],
};
